import { after, NextResponse } from "next/server";
import { beginAsk } from "@/lib/askAllowance";
import { latestRuns, newRunId, readTestSet, resultsSoFar, runStarted, runTests } from "@/lib/ask-tests";
import { getPlan } from "@/lib/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/** A run this old has finished or been cut off. */
const RUN_LIMIT_MS = 6 * 60 * 1000;

/** The owner's button on Admin > Ask tests, and how far a run has got. */
async function admin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin" ? { supabase, user } : null;
}

export async function GET(request: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const run = new URL(request.url).searchParams.get("run");
  if (!run) return NextResponse.json({ error: "run is required" }, { status: 400 });
  const [done, set] = await Promise.all([resultsSoFar(run), readTestSet()]);
  return NextResponse.json({ done, total: set.length });
}

export async function POST() {
  const who = await admin();
  if (!who) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const set = await readTestSet();
  if (!set.length) return NextResponse.json({ error: "The test questions could not be read." }, { status: 500 });

  // A second press joins the run under way.
  const [latest] = await latestRuns(1);
  if (latest && latest.results.length < set.length && Date.now() - runStarted(latest.id).getTime() < RUN_LIMIT_MS) {
    return NextResponse.json({ run: latest.id, total: set.length });
  }

  // These count towards the site's daily AI ceiling, as the bench's do.
  const plan = await getPlan(who.supabase, who.user.id);
  for (let i = 0; i < set.length; i++) {
    const begun = await beginAsk(createAdminClient(), who.user.id, plan);
    if (!begun.ok) return NextResponse.json({ error: "The daily AI ceiling has been reached, or the check is unavailable. Try later." }, { status: 429 });
  }

  const run = newRunId();
  after(() => runTests(run, who.user.id));
  return NextResponse.json({ run, total: set.length }, { status: 202 });
}
