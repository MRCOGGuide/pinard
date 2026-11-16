"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getExamAvailability } from "@/lib/examAvailability";
import { isIanaZone } from "@/lib/timezone";
import type { ExamPart } from "@/lib/types";
import { isWeeklyHours } from "@/lib/confidence";

export async function saveOnboarding(
  exam: ExamPart,
  examDate: string,
  /**
   * The browser's timezone. Taken here as well as on Account because
   * this is the first thing a candidate does, and reminders are sent on
   * their clock — someone who never opens Account would otherwise be
   * emailed on London time for good.
   */
  timezone?: string,
  /** Weekly study time, one of WEEKLY_HOURS; optional, so a candidate can skip it. */
  hours?: number | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (!["part1", "part2", "part3"].includes(exam)) {
    return { error: "Choose an exam part" };
  }

  // Candidates can only onboard onto live exam parts; admins onto any.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    const availability = await getExamAvailability(supabase);
    if (!availability[exam]) {
      return { error: "This exam part is not available yet" };
    }
  }

  // Exam date must be a valid future date.
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || examDate <= today) {
    return { error: "Choose an exam date in the future" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ exam, exam_date: examDate })
    .eq("id", user.id);
  if (error) {
    // The detail goes to the log, not the screen (security audit M6).
    console.error("onboarding action failed:", error.code);
    return { error: "Your exam details could not be saved. Try again." };
  }

  // Written on its own, and its failure ignored: onboarding is the one
  // path that must not fail, and a missing zone only means reminders
  // keep the London default they have always had.
  if (isIanaZone(timezone)) {
    await supabase.from("profiles").update({ timezone }).eq("id", user.id);
  }

  // Likewise on its own: the column arrives with phase55, and until it is
  // there the plan keeps its default of ten questions a day.
  if (isWeeklyHours(hours)) {
    const { error: hoursError } = await supabase
      .from("profiles")
      .update({ study_hours_per_week: hours })
      .eq("id", user.id);
    if (hoursError) console.error("weekly hours not saved:", hoursError.code);
  }

  revalidatePath("/", "layout");
  return {};
}

/** Weekly study time on its own, from Account. */
export async function saveStudyHours(hours: number): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  if (!isWeeklyHours(hours)) return { error: "Choose one of the options" };

  const { error } = await supabase.from("profiles").update({ study_hours_per_week: hours }).eq("id", user.id);
  if (error) {
    console.error("weekly hours not saved:", error.code);
    return { error: "Your study time could not be saved. Try again." };
  }
  revalidatePath("/", "layout");
  return {};
}
