"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  questionEditProblems,
  questionLintFields,
} from "@/lib/generation";
import type { QuestionEditInput } from "@/components/QuestionEditForm";

/**
 * Permanently delete approved questions (the guideline-update workflow:
 * a guideline is superseded, its questions are removed and regenerated
 * from the new version). Cascades to users' answer history for those
 * questions by design — an outdated question shouldn't keep counting.
 */
/**
 * Save admin edits to an approved question — the "spotted an error
 * after approval" path. Same validation as the review editor (including
 * the UK-English lint); the question stays approved, and the edit is
 * live for candidates immediately.
 */
export async function updateBankQuestion(id: number, input: QuestionEditInput) {
  const { supabase } = await requireAdmin();

  if (!input.stem.trim()) return { error: "Stem cannot be empty" };
  if (!input.options.some((o) => o.key === input.correct_key)) {
    return { error: "Correct answer must be one of the options" };
  }
  const problem = questionEditProblems(questionLintFields(input));
  if (problem) return { error: problem };

  const { error } = await supabase
    .from("generated_questions")
    .update({
      stem: input.stem.trim(),
      options: input.options,
      correct_key: input.correct_key,
      explanation: input.explanation.trim(),
      explanations: input.explanations,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "approved");
  if (error) return { error: error.message };

  revalidatePath("/admin/bank");
  return {};
}

export async function deleteQuestions(ids: number[]) {
  if (ids.length === 0) return { error: "Nothing selected" };
  const { supabase } = await requireAdmin();

  // Deleting part of an EMQ set would leave scenarios that can no
  // longer be presented as a set — they would fall back to being shown
  // alone with their ten shared options, i.e. as an SBA. Widen the
  // selection to every scenario of any set it touches.
  const { data: touched } = await supabase
    .from("generated_questions")
    .select("emq_group_id")
    .in("id", ids)
    .not("emq_group_id", "is", null);

  const groupIds = Array.from(
    new Set(
      ((touched ?? []) as { emq_group_id: string | null }[])
        .map((r) => r.emq_group_id)
        .filter((g): g is string => Boolean(g))
    )
  );

  const doomed = new Set(ids);
  if (groupIds.length > 0) {
    const { data: siblings } = await supabase
      .from("generated_questions")
      .select("id")
      .in("emq_group_id", groupIds);
    for (const s of (siblings ?? []) as { id: number }[]) doomed.add(s.id);
  }

  const all = Array.from(doomed);
  const { error } = await supabase
    .from("generated_questions")
    .delete()
    .in("id", all);
  if (error) return { error: error.message };

  revalidatePath("/admin/bank");
  return { deleted: all.length };
}

/**
 * Choose the question shown as the worked example on the public landing
 * page. One per format: marking a new one stands the old one down, so
 * the page always has exactly one SBA and one EMQ set to show.
 *
 * EMQ sets are stored one row per scenario; the whole set is what the
 * page renders, so its siblings are marked together.
 */
export async function setShowcase(id: number, on: boolean) {
  const { supabase } = await requireAdmin();

  const { data: question } = await supabase
    .from("generated_questions")
    .select("id, format, emq_group_id")
    .eq("id", id)
    .single();
  if (!question) return { error: "Question not found" };

  // Stand down whatever currently holds the slot for this format.
  if (on) {
    const { error: clearError } = await supabase
      .from("generated_questions")
      .update({ showcase: false })
      .eq("format", question.format)
      .eq("showcase", true);
    if (clearError) return { error: clearError.message };
  }

  const target = supabase.from("generated_questions").update({ showcase: on });
  const { error } = question.emq_group_id
    ? await target.eq("emq_group_id", question.emq_group_id)
    : await target.eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/bank");
  revalidatePath("/");
  return {};
}
