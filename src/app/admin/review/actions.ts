"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { formatReference } from "@/lib/reference";
import {
  questionEditProblems,
  questionLintFields,
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

/**
 * One source passage, fetched when a reviewer asks to see it.
 *
 * The review page pre-loads the passages cited by the questions it is
 * showing, which is fast and right until the citation on screen is not
 * in that set — a question approved a moment ago, a stale render, an id
 * reached some other way. The page then told the reviewer the passage
 * "could not be loaded (it may have been re-ingested)", which was
 * alarming and, every time it has been checked, untrue: the chunk was
 * there and simply had not been asked for.
 *
 * So the button falls back to asking. A passage that genuinely no
 * longer exists still says so — that is a real state, and it is how the
 * dangling citations were found — but it now means what it says.
 */
export async function getPassage(chunkId: number): Promise<{
  error?: string;
  passage?: {
    text: string;
    document_title: string;
    source_reference: string;
  };
}> {
  const { supabase } = await requireAdmin();
  if (!Number.isFinite(chunkId)) return { error: "Not a passage id" };

  const { data, error } = await supabase
    .from("content_chunks")
    .select(
      "id, text, content_documents(title, source_reference, source_year, tog_year, tog_issue)"
    )
    .eq("id", chunkId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "gone" };

  const row = data as unknown as {
    text: string;
    content_documents: {
      title: string | null;
      source_reference: string | null;
      source_year: number | null;
      tog_year: number | null;
      tog_issue: number | null;
    } | null;
  };
  const doc = row.content_documents;

  return {
    passage: {
      text: row.text,
      document_title: doc?.title ?? "",
      source_reference: formatReference({
        reference: doc?.source_reference ?? "",
        year: doc?.source_year ?? null,
        togYear: doc?.tog_year ?? null,
        togIssue: doc?.tog_issue ?? null,
      }),
    },
  };
}
