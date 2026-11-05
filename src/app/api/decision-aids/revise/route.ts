import { after, NextResponse } from "next/server";
import { carriesCronSecret } from "@/lib/cron-auth";
import { callNextRunStep, readRun, runStalled, startRun, stepRun, writeRun, type RevisionRun } from "@/lib/decision-aid-revise";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Revises the aids marked Needs changes. The owner's button starts a run;
 * after that each step does one aid, answers, and calls the next, as a
 * search does (decision-aids/search). Authorised by an admin session, or
 * by the cron secret between steps.
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

  const body = (await request.json().catch(() => null)) as { run?: RevisionRun } | null;
  let run = machine && body?.run ? body.run : await readRun();
  if (machine) {
    if (run?.state !== "running") return NextResponse.json({ run });
  } else {
    if (run?.state === "running" && !runStalled(run)) return NextResponse.json({ run });
    run = await startRun();
    await writeRun(run);
    if (run.state === "done") return NextResponse.json({ run });
  }

  const running = run;
  const origin = new URL(request.url).origin;
  after(async () => {
    await stepRun(running);
    await writeRun(running);
    if (running.state === "running" && !(await callNextRunStep(origin, running))) {
      running.state = "stopped";
      running.message = "The next step could not be started. Press the button to carry on.";
      await writeRun(running);
    }
  });
  return NextResponse.json({ run: running }, { status: 202 });
}
