import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { SessionRunner } from "@/components/SessionRunner";
import { createClient } from "@/lib/supabase/server";
import { buildFlaggedSession, fetchFlaggedIds } from "@/lib/session";
import { getAccess, hasFullAccess } from "@/lib/access";

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
  if (!user) redirect("/sign-in");

  const tier = await getAccess(supabase, user.id);
  if (!hasFullAccess(tier)) redirect("/pricing");

  const questions = await buildFlaggedSession(supabase, user.id);
  const flaggedIds = await fetchFlaggedIds(supabase, user.id);

  if (questions.length === 0) {
    return (
      <>
        <TraceHeader title="Flagged" eyebrow="Review later" />
        <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
          <p className="text-sm text-graphite/80">
            Nothing flagged yet. Use the flag on any question while you
            practise and it will wait for you here.
          </p>
          <Link
            href="/practise"
            className="mt-5 inline-block rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre"
          >
            Back to topics
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <TraceHeader
        title="Flagged"
        eyebrow="Review later"
        lede="Questions you flagged, newest first. Unflag one and it drops off this list."
      />
      <SessionRunner
        questions={questions}
        title="Flagged"
        flaggedIds={flaggedIds}
      />
    </>
  );
}
