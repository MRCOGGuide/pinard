import { after, NextResponse } from "next/server";
import { carriesCronSecret } from "@/lib/cron-auth";
import { STEPS_BUDGET_MS } from "@/lib/decision-aid-extract";
import { readRun, runBusy, runStalled, startRun, stepRun, writeRun } from "@/lib/decision-aid-revise";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Revises the aids marked Needs changes. The owner's button starts a run,
 * which does as many aids as fit in its time. The background workflow
 * carries on one with aids left (see lib/queue-run for why a run never
 * starts the next itself). Authorised by an admin session, or by the cron
 * secret.
 */
async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const run = await readRun();
  return NextResponse.json({ run: run && runStalled(run) ? { ...run, state: "stopped", message: "This run stopped part way. Press the button to carry on." } : run });
}

export async function POST(request: Request) {
  const machine = carriesCronSecret(request);
  if (!machine && !(await isAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  let run = await readRun();
  if (machine) {
    if (run?.state !== "running" || runBusy(run)) return NextResponse.json({ run });
  } else {
    if (run?.state === "running" && !runStalled(run)) return NextResponse.json({ run });
    run = await startRun();
    await writeRun(run);
    if (run.state === "done") return NextResponse.json({ run });
  }

  const running = run;
  after(async () => {
    const stop = Date.now() + STEPS_BUDGET_MS;
    while (running.state === "running" && Date.now() < stop) {
      await stepRun(running);
      await writeRun(running);
    }
  });
  return NextResponse.json({ run: running }, { status: 202 });
}
