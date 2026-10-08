import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { SessionRunner } from "@/components/SessionRunner";
import { LeaveSession } from "@/components/LeaveSession";
import { createClient } from "@/lib/supabase/server";
import { buildFlaggedSession, fetchFlaggedIds } from "@/lib/session";
import { getAccess, hasFullAccess } from "@/lib/access";
import { redirectToSignIn } from "@/lib/auth";

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


/**
 * Everything the candidate flagged while practising, in one run. Not a
 * topic, so it sits outside the section list: flags cut across the
 * syllabus, which is the point of them.
 */
export default async function FlaggedPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirectToSignIn();

  const tier = await getAccess(supabase, user.id);
  if (!hasFullAccess(tier)) redirect("/pricing");

  const questions = await buildFlaggedSession(supabase, user.id);
  const flaggedIds = await fetchFlaggedIds(supabase, user.id);

  if (questions.length === 0) {
    return (
      <>
        <TraceHeader title="Flagged" eyebrow="Review later" />
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-sm text-ink/80">
            Nothing flagged yet. Use the flag on any question while you
            practise and it will wait for you here.
          </p>
          <Link
            href="/practise"
            className="mt-5 inline-block btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
          >
            Back to topics
          </Link>
        </div>
      </>
    );
  }

  return (
    // The editorial direction, on the question screen (Phase 9 prototype).
    <div>
      <TraceHeader
        title="Flagged"
        eyebrow="Review later"
        lede="Questions you flagged, newest first. Unflag one and it drops off this list."
      />
      <LeaveSession href="/practise" label="Exit to topics" />
      <SessionRunner
        questions={questions}
        title="Flagged"
        flaggedIds={flaggedIds}
      />
    </div>
  );
}
