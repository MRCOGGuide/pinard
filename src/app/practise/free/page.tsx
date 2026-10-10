import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { SessionRunner } from "@/components/SessionRunner";
import { LeaveSession } from "@/components/LeaveSession";
import { createClient } from "@/lib/supabase/server";
import { buildFreeSampleSession, fetchFlaggedIds } from "@/lib/session";
import { getAccess, hasFullAccess } from "@/lib/access";
import { plansProps } from "@/lib/plansProps";
import { redirectToSignIn } from "@/lib/auth";

export const maxDuration = 60;

/** The free account's 15 sample questions, then the plans (pricing Phase 2). */
export default async function FreeSamplePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectToSignIn();
  if (hasFullAccess(await getAccess(supabase, user.id))) redirect("/practise");

  const [questions, plans, flaggedIds] = await Promise.all([
    buildFreeSampleSession(supabase),
    plansProps(),
    fetchFlaggedIds(supabase, user.id),
  ]);

  return (
    <div>
      <TraceHeader
        title="Free sample"
        eyebrow="MRCOG Part 2"
        lede={`${questions.length} questions from across the syllabus, each with full worked feedback and its source.`}
      />
      <LeaveSession href="/practise" label="Exit to topics" />
      <SessionRunner questions={questions} title="Free sample" endCard="paywall" plans={plans} flaggedIds={flaggedIds} />
    </div>
  );
}
