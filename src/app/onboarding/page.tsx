import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { getExamAvailability } from "@/lib/examAvailability";
import { OnboardingForm } from "./OnboardingForm";
import { redirectToSignIn } from "@/lib/auth";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectToSignIn();

  const [{ data: profile }, availability] = await Promise.all([
    // "*": study_hours_per_week arrives with phase55.
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getExamAvailability(supabase),
  ]);

  return (
    <div className="mx-auto max-w-md">
      <TraceHeader
        title="Set up your revision"
        lede="Your exam, your time, then the topics you feel sure of. Your plan is built from the answers, and you can change them any time."
      />
      <OnboardingForm
        initialExam={profile?.exam ?? null}
        initialDate={profile?.exam_date ?? null}
        initialHours={(profile?.study_hours_per_week as number | null | undefined) ?? null}
        availability={availability}
        isAdmin={profile?.role === "admin"}
      />
    </div>
  );
}
