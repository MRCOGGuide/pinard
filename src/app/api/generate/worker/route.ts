import { NextResponse } from "next/server";
import { runGenerationBatch } from "@/lib/generate-batch";
import {
  MAX_EMPTY_RUNS,
  WORKER_BATCH,
  WORKER_BUDGET_MS,
  type GenerationJob,
} from "@/lib/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The generation queue's worker: takes the oldest job that still wants
 * questions, generates a few, records what it made, and returns. It is
 * called repeatedly — by the admin page while it is open, and by the
 * daily Vercel cron — so a queue drains whether or not anyone is
 * watching, and no single run has to survive long enough to finish a
 * whole section.
 *
 * Authorised by an admin session, or by the cron secret.
 */
async function authorise(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header === `Bearer ${secret}`) return true;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile?.role === "admin";
}

type WorkerRun = {
  job_id: number;
  section_id: number;
  created: number;
  status: string;
  error?: string;
};

type WorkerResult =
  | { ok: false; error: string; ran: WorkerRun[] }
  | { ok: true; ran: WorkerRun[]; created: number; jobs_remaining: number };

async function work(): Promise<WorkerResult> {
  const deadline = Date.now() + WORKER_BUDGET_MS;
  const supabase = createAdminClient();

  const ran: WorkerRun[] = [];

  while (Date.now() < deadline) {
    const { data: jobs, error } = await supabase
      .from("generation_jobs")
      .select("*")
      .in("status", ["queued", "running"])
      .order("id", { ascending: true })
      .limit(1);

    // Without this, a missing table or a broken connection reads back
    // as an empty queue — the worker would report all clear and the
    // owner would wait for questions that were never being generated.
    if (error) {
      return {
        ok: false,
        error: `could not read the queue: ${error.message}`,
        ran,
      };
    }

    const job = (jobs ?? [])[0] as GenerationJob | undefined;
    if (!job) break;

    const remaining = job.target - job.created;
    if (remaining <= 0) {
      await supabase
        .from("generation_jobs")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .eq("id", job.id);
      continue;
    }

    await supabase
      .from("generation_jobs")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", job.id);

    const result = await runGenerationBatch({
      sectionId: job.section_id,
      format: job.format,
      count: Math.min(remaining, WORKER_BATCH),
      deadline,
    });

    if (!result.ok) {
      // A job that cannot run at all — no ingested passages, a deleted
      // section — is failed outright rather than retried for ever.
      await supabase
        .from("generation_jobs")
        .update({
          status: "failed",
          last_error: result.error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      ran.push({
        job_id: job.id,
        section_id: job.section_id,
        created: 0,
        status: "failed",
        error: result.error,
      });
      continue;
    }

    // EMQs are generated as sets; the target counts questions, and a
    // set is several.
    const made =
      job.format === "emq" ? result.emqScenarios : result.created;
    const total = job.created + made;
    const emptyRuns = made > 0 ? 0 : job.empty_runs + 1;

    let status: GenerationJob["status"] = "queued";
    let lastError: string | null = result.problems[0] ?? null;
    if (total >= job.target) {
      status = "done";
      lastError = null;
    } else if (emptyRuns >= MAX_EMPTY_RUNS) {
      status = "failed";
      lastError =
        result.insufficient > 0
          ? "the passages in this section cannot support more questions"
          : (result.problems[0] ?? "no questions produced");
    }

    await supabase
      .from("generation_jobs")
      .update({
        created: total,
        empty_runs: emptyRuns,
        status,
        last_error: lastError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    ran.push({
      job_id: job.id,
      section_id: job.section_id,
      created: made,
      status,
    });

    // The batch stopped on the deadline, so this run is over too.
    if (result.stoppedEarly) break;
  }

  const { count: remainingJobs } = await supabase
    .from("generation_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "running"]);

  return {
    ok: true,
    ran,
    created: ran.reduce((sum, r) => sum + r.created, 0),
    jobs_remaining: remainingJobs ?? 0,
  };
}

async function handle(request: Request) {
  if (!(await authorise(request))) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const result = await work();
  return NextResponse.json(result, { status: result.ok === false ? 500 : 200 });
}

export async function POST(request: Request) {
  return handle(request);
}

/** Vercel cron issues a GET. */
export async function GET(request: Request) {
  return handle(request);
}
