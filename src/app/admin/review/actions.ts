"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { ukEnglishProblems } from "@/lib/generation";
import type { QuestionOption } from "@/lib/types";

export async function approveQuestion(id: number) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("generated_questions")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/review");
  return {};
}

export async function rejectQuestion(id: number) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("generated_questions")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/review");
  return {};
}

export type ExplanationEdit = {
  key: string;
  verdict: "correct" | "incorrect";
  text: string;
  citation_chunk_ids: number[];
  source_reference: string;
};

/**
 * Save admin edits to a question. Re-runs the UK-English lint so an edit
 * can't reintroduce an americanism; keeps it pending for a final approve.
 */
export async function updateQuestion(
  id: number,
  input: {
    stem: string;
    options: QuestionOption[];
    correct_key: string;
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
    ...input.explanations.map((e) => e.text),
  ].join("\n");
  const lint = ukEnglishProblems(blob);
  if (lint.length > 0) return { error: `UK-English: ${lint.join("; ")}` };

  const { error } = await supabase
    .from("generated_questions")
    .update({
      stem: input.stem.trim(),
      options: input.options,
      correct_key: input.correct_key,
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
