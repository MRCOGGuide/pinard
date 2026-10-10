"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchQuestionsByIds, type SessionQuestion } from "@/lib/session";

/**
 * The questions of a diagnostic being resumed, by the ids saved on the
 * candidate's device. Read through their own session, so row-level
 * security decides what comes back: a free account gets its free
 * questions and nothing more, whatever ids are sent.
 */
export async function loadDiagnosticQuestions(ids: unknown): Promise<SessionQuestion[]> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 400) return [];
  const clean = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (clean.length !== ids.length) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return fetchQuestionsByIds(supabase, clean);
}

export async function completeDiagnostic() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("profiles")
    .update({ diagnostic_completed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) {
    // The detail goes to the log, not the screen (security audit M6).
    console.error("diagnostic action failed:", error.code);
    return { error: "Your diagnostic could not be saved. Try again." };
  }

  revalidatePath("/", "layout");
  return {};
}
