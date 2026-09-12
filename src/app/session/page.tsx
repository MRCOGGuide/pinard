import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { SessionRunner } from "@/components/SessionRunner";
import { createClient } from "@/lib/supabase/server";
import { buildDailySession, fetchFlaggedIds } from "@/lib/session";
import { getAccess, hasFullAccess } from "@/lib/access";

/**
 * Ask Pinard runs as a server action from this route, and a server
 * action inherits the limit of the route that hosts it. A grounded
 * answer is retrieval — an embedding call and a vector search, about
 * 830ms warm and several seconds on a cold index — and then a model
 * call over the passages. Ten seconds is the default, and it is not
 * enough for that: the candidate would get a Gateway Timeout instead
 * of an answer, which is what the ten-second budget was already doing
 * to the plan narrative.
 */
export const maxDuration = 60;


export default async function SessionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const tier = await getAccess(supabase, user.id);
  if (!hasFullAccess(tier)) redirect("/pricing");

  /*
    Timed, because this page has twice reached a candidate as a Gateway
    Timeout and twice been diagnosed from the code rather than from
    evidence. Durations only — no ids, nothing about the person — and
    one line per load, which Vercel keeps under Observability → Logs.
    Remove once the cause is known and fixed.
  */
  const marks: [string, number][] = [];
  let last = Date.now();
  // Each figure is that phase alone, not the time so far: a running
  // total makes the last phase look like the slow one.
  const mark = (name: string) => {
    const now = Date.now();
    marks.push([name, now - last]);
    last = now;
  };
  mark("access");

  const today = new Date().toISOString().slice(0, 10);
  const session = await buildDailySession(supabase, user.id, today);
  mark("buildDailySession");

  if (session.status === "needs_onboarding") redirect("/onboarding");

  const flaggedIds = await fetchFlaggedIds(supabase, user.id);
  mark("fetchFlaggedIds");
  console.log(
    `[session] ${marks.map(([n, ms]) => `${n}=${ms}ms`).join(" ")} questions=${session.questions.length}`
  );

  if (session.questions.length === 0) {
    return (
      <>
        <TraceHeader title="Today's session" />
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-sm leading-relaxed text-ink/80">
            There are no approved questions for today&rsquo;s topics yet. Once
            questions have been generated and approved, your daily session will
            appear here — weighted toward the topics you most need.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-card border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink/80 hover:text-ink-strong"
          >
            Back to today
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <TraceHeader
        title="Today's session"
        lede={
          session.focus.length
            ? `Weighted toward ${session.focus.map((f) => f.title).slice(0, 3).join(", ")}.`
            : undefined
        }
      />
      <SessionRunner
        questions={session.questions}
        title="Daily session"
        flaggedIds={flaggedIds}
      />
    </>
  );
}
