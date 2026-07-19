import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("exam, exam_date, name")
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto max-w-md">
      <TraceHeader
        title="Set up your revision"
        lede="Two quick things and your adaptive plan begins. You can change these any time."
      />
      <OnboardingForm
        initialExam={profile?.exam ?? null}
        initialDate={profile?.exam_date ?? null}
      />
    </div>
  );
}
