"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ExamPart } from "@/lib/types";

export async function saveOnboarding(exam: ExamPart, examDate: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (!["part1", "part2", "part3"].includes(exam)) {
    return { error: "Choose an exam part" };
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

  revalidatePath("/", "layout");
  return {};
}
