import { getExamAvailability } from "@/lib/examAvailability";
import { createAdminClient } from "@/lib/supabase/admin";
import { EXAM_LABELS, type ExamPart } from "@/lib/types";
import { SignUpForm } from "./SignUpForm";

/**
 * Join the pilot, or the waitlist.
 *
 * A server page around the client form so it knows which exam parts the
 * owner has opened in Admin: the waitlist offered all three papers when
 * only Part 2 was live. exam_availability is readable signed in only,
 * and this page's audience is signed out, so it is read with the
 * service role here (as the landing page does) rather than by widening
 * the policy.
 */
export default async function SignUpPage() {
  const availability = await getExamAvailability(createAdminClient());
  const parts = (Object.keys(EXAM_LABELS) as ExamPart[]).filter((p) => availability[p]);
  return <SignUpForm parts={parts} />;
}
