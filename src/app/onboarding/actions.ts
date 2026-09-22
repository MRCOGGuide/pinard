"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getExamAvailability } from "@/lib/examAvailability";
import { isIanaZone } from "@/lib/timezone";
import type { ExamPart } from "@/lib/types";

export async function saveOnboarding(
  exam: ExamPart,
  examDate: string,
  /**
   * The browser's timezone. Taken here as well as on Account because
   * this is the first thing a candidate does, and reminders are sent on
   * their clock — someone who never opens Account would otherwise be
   * emailed on London time for good.
   */
  timezone?: string
) {
  const supabase = createClient();
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
  if (error) return { error: error.message };

  // Written on its own, and its failure ignored: onboarding is the one
  // path that must not fail, and a missing zone only means reminders
  // keep the London default they have always had.
  if (isIanaZone(timezone)) {
    await supabase.from("profiles").update({ timezone }).eq("id", user.id);
  }

  revalidatePath("/", "layout");
  return {};
}
