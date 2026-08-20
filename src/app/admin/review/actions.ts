"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  sourceNarrationProblems,
  ukEnglishProblems,
} from "@/lib/generation";
import type { QuestionOption } from "@/lib/types";

/**
 * Approve or reject whole items. An EMQ set is reviewed as a unit — its
 * scenarios only make sense against the shared option list, so approving
 * some and rejecting others would leave a set that cannot be presented.
 */
async function setStatus(ids: number[], status: "approved" | "rejected") {
  const { supabase } = await requireAdmin();
  if (ids.length === 0) return { error: "Nothing to review" };
  const { error } = await supabase
    .from("generated_questions")
    .update({ status, reviewed_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return { error: error.message };
  revalidatePath("/admin/review");
  return {};
}

export async function approveQuestions(ids: number[]) {
  return setStatus(ids, "approved");
}

export async function rejectQuestions(ids: number[]) {
  return setStatus(ids, "rejected");
}

export type ExplanationEdit = {
  key: string;
  verdict: "correct" | "incorrect";
  text: string;
  citation_chunk_ids: number[];
  source_reference: string;
};

/**
 * Save admin edits to a question. Re-runs the UK-English and
 * source-narration lints so an edit cannot reintroduce an americanism
 * or "the passage states"; keeps it pending for a final approve.
 */
export async function updateQuestion(
  id: number,
  input: {
    stem: string;
    options: QuestionOption[];
    correct_key: string;
    explanation: string;
    explanations: ExplanationEdit[];
  }
) {
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
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/review");
  return {};
}

export async function resolveFailure(id: number) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("generation_failures")
    .update({ resolved: true })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/review");
  return {};
}
