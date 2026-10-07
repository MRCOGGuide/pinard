import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { getExamAvailability } from "@/lib/examAvailability";
import { OnboardingForm } from "./OnboardingForm";
import { redirectToSignIn } from "@/lib/auth";

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirectToSignIn();

  const [{ data: profile }, availability] = await Promise.all([
    supabase
      .from("profiles")
      .select("exam, exam_date, role")
      .eq("id", user.id)
      .single(),
    getExamAvailability(supabase),
  ]);

  return (
    <div className="mx-auto max-w-md">
      <TraceHeader
        title="Set up your revision"
        lede="Two quick things and your adaptive plan begins. You can change these any time."
      />
      <OnboardingForm
        initialExam={profile?.exam ?? null}
        initialDate={profile?.exam_date ?? null}
        availability={availability}
        isAdmin={profile?.role === "admin"}
      />
    </div>
  );
}
