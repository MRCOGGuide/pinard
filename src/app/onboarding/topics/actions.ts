"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { leafSections } from "@/lib/performance";
import { isConfidence, type Confidence } from "@/lib/confidence";
import type { Section } from "@/lib/types";

/**
 * Saves how confident a candidate feels in each topic (owner, 16 November
 * 2026). A topic rated is written; a topic left blank, or cleared, has no
 * rating and the plan treats it as unknown until there are answers.
 *
 * Only the candidate's own rows, through their own session (RLS), and
 * only for the active topics of the exam they are sitting: a section id
 * from anywhere else is ignored rather than stored.
 */
export async function saveConfidence(
  ratings: { section_id: number; confidence: Confidence | null }[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  if (!Array.isArray(ratings) || ratings.length > 500) return { error: "Your ratings could not be read. Try again." };

  const { data: profile } = await supabase.from("profiles").select("exam").eq("id", user.id).single();
  if (!profile?.exam) return { error: "Choose your exam first" };

  const { data: sections } = await supabase.from("sections").select("*").eq("exam", profile.exam);
  const allowed = new Set(leafSections((sections ?? []) as Section[]).map((s) => s.id));

  const now = new Date().toISOString();
  const rated: { user_id: string; section_id: number; confidence: Confidence; updated_at: string }[] = [];
  const cleared: number[] = [];
  for (const r of ratings) {
    const id = Number(r?.section_id);
    if (!Number.isInteger(id) || !allowed.has(id)) continue;
    if (r.confidence === null) cleared.push(id);
    else if (isConfidence(r.confidence)) rated.push({ user_id: user.id, section_id: id, confidence: r.confidence, updated_at: now });
  }

  if (rated.length > 0) {
    const { error } = await supabase.from("section_confidence").upsert(rated, { onConflict: "user_id,section_id" });
    if (error) {
      // The detail goes to the log, not the screen (security audit M6).
      console.error("confidence not saved:", error.code);
      return { error: "Your ratings could not be saved. Try again." };
    }
  }
  if (cleared.length > 0) {
    const { error } = await supabase
      .from("section_confidence")
      .delete()
      .eq("user_id", user.id)
      .in("section_id", cleared);
    if (error) {
      console.error("confidence not cleared:", error.code);
      return { error: "Your ratings could not be saved. Try again." };
    }
  }

  revalidatePath("/", "layout");
  return {};
}
