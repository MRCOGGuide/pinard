"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  sourceNarrationProblems,
  ukEnglishProblems,
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
  const blob = [
    input.stem,
    ...input.options.map((o) => o.text),
    input.explanation,
    ...input.explanations.map((e) => e.text),
  ].join("\n");
  const lint = ukEnglishProblems(blob);
  if (lint.length > 0) return { error: `UK-English: ${lint.join("; ")}` };
  const narration = sourceNarrationProblems(blob);
  if (narration.length > 0) return { error: narration[0] };

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
