"use server";

import { createClient } from "@/lib/supabase/server";
import { rollingPerformance, ROLLING_WINDOW } from "@/lib/performance";
import type { QuestionOption } from "@/lib/types";

/**
 * Records an answer and updates the section's rolling performance.
 * is_correct is recomputed server-side from the stored correct_key so the
 * client can't misreport it.
 */
export async function recordAnswer(input: {
  questionId: number;
  chosenKey: string;
  secondsTaken: number;
  sessionId: string;
}): Promise<{ error?: string; is_correct?: boolean; correct_key?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: question } = await supabase
    .from("generated_questions")
    .select("id, section_id, correct_key, status")
    .eq("id", input.questionId)
    .single();
  if (!question || question.status !== "approved") {
    return { error: "Question not available" };
  }

  const isCorrect = input.chosenKey === question.correct_key;

  const { error: insertError } = await supabase.from("user_answers").insert({
    user_id: user.id,
    question_id: question.id,
    chosen_key: input.chosenKey,
    is_correct: isCorrect,
    seconds_taken: Math.max(0, Math.round(input.secondsTaken)),
    session_id: input.sessionId,
  });
  if (insertError) return { error: insertError.message };

  // Recompute rolling performance for this section from recent answers.
  const { data: recent } = await supabase
    .from("user_answers")
    .select("is_correct, generated_questions!inner(section_id)")
    .eq("user_id", user.id)
    .eq("generated_questions.section_id", question.section_id)
    .order("answered_at", { ascending: false })
    .limit(ROLLING_WINDOW);

  const series = ((recent ?? []) as unknown as { is_correct: boolean }[])
    .map((r) => r.is_correct)
    .reverse();
  const { rolling_accuracy, mastery } = rollingPerformance(series);

  await supabase.from("user_topic_performance").upsert(
    {
      user_id: user.id,
      section_id: question.section_id,
      rolling_accuracy,
      attempts: series.length,
      mastery,
      last_practised_at: new Date().toISOString(),
    },
    { onConflict: "user_id,section_id" }
  );

  return { is_correct: isCorrect, correct_key: question.correct_key };
}

export type SimilarValueGroup = {
  value: string;
  facts: { statement: string; source_reference: string | null }[];
};

/** A value a candidate can carry across topics: "0.5%", "1 in 200". */
const PERCENTAGE = /\d\s*(%|per\s?cent)|\b1\s*(in|:)\s*\d/i;

/**
 * Similar Values panel (PROJECT.md item 7): NOT AI-generated. Looks up
 * the key facts behind this question's cited chunks, then finds other
 * stored facts sharing the same value (e.g. everything else that is
 * "7%") and returns them as memory pairs with citations.
 *
 * Percentage questions only. A number is worth carrying across topics
 * because it travels — 0.5% is the VBAC scar rupture risk and also the
 * risk of several other things — but under a question whose answer is
 * a drug or a management step the panel was noise.
 */
export async function getSimilarValues(
  questionId: number
): Promise<SimilarValueGroup[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: question } = await supabase
    .from("generated_questions")
    .select("citation_chunk_ids, status, correct_key, options")
    .eq("id", questionId)
    .single();
  if (!question || question.status !== "approved") return [];

  // Only percentage questions get this panel. The point of it is that a
  // number sticks better in company — "0.5% is also the risk of X" —
  // which does nothing for a question whose answer is a drug or a
  // management step, where it was only ever clutter under the card.
  const options = (question.options ?? []) as QuestionOption[];
  const answer = options.find((o) => o.key === question.correct_key);
  if (!answer || !PERCENTAGE.test(answer.text)) return [];

  const chunkIds: number[] = question.citation_chunk_ids ?? [];
  if (chunkIds.length === 0) return [];

  const { data: baseFacts } = await supabase
    .from("key_facts")
    .select("id, value_text, value_numeric, statement, source_reference")
    .in("chunk_id", chunkIds);
  if (!baseFacts || baseFacts.length === 0) return [];

  // The fact this question is actually about: a percentage, and the one
  // the answer quotes if we can tell which that is.
  const percentageFacts = baseFacts.filter(
    (f) => f.value_text && PERCENTAGE.test(f.value_text)
  );
  const base =
    percentageFacts.find(
      (f) => f.value_text && answer.text.includes(f.value_text)
    ) ?? percentageFacts[0];
  if (!base || !base.value_text) return [];

  const { data: matches } = await supabase
    .from("key_facts")
    .select("id, chunk_id, statement, source_reference")
    .eq("value_text", base.value_text)
    .neq("id", base.id)
    .limit(12);
  if (!matches || matches.length === 0) return [];

  // The point is a DIFFERENT fact that happens to share the value, so
  // anything from this question's own passages is dropped, and the rest
  // are compared on the words they use rather than the string. The same
  // fact is routinely ingested twice with its clauses swapped round —
  // a guideline and its summary — and listing that back as a companion
  // makes the panel look broken. Three companions is the ceiling: more
  // is a wall of numbers, not a memory hook.
  const ownChunks = new Set(chunkIds);
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9%]+/g, " ")
        .split(" ")
        .filter((w) => w.length >= 4)
    );
  const restates = (a: Set<string>, b: Set<string>) => {
    const smaller = a.size <= b.size ? a : b;
    const larger = smaller === a ? b : a;
    if (smaller.size === 0) return true;
    let shared = 0;
    for (const w of Array.from(smaller)) if (larger.has(w)) shared++;
    return shared / smaller.size >= 0.8;
  };

  const kept = [words(base.statement)];
  const facts = [
    { statement: base.statement, source_reference: base.source_reference },
  ];
  for (const m of matches) {
    if (facts.length >= 4) break;
    if (ownChunks.has(m.chunk_id as number)) continue;
    const w = words(m.statement);
    if (kept.some((k) => restates(k, w))) continue;
    kept.push(w);
    facts.push({ statement: m.statement, source_reference: m.source_reference });
  }
  if (facts.length < 2) return [];

  return [{ value: base.value_text, facts }];
}

/**
 * Flag or unflag a question for later review. Idempotent per state: the
 * row exists while flagged and is deleted when it isn't, so the table
 * only ever holds what a candidate still wants to come back to.
 */
export async function toggleQuestionFlag(
  questionId: number,
  flagged: boolean
): Promise<{ error?: string; flagged?: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (flagged) {
    const { error } = await supabase
      .from("user_question_flags")
      .upsert(
        { user_id: user.id, question_id: questionId },
        { onConflict: "user_id,question_id" }
      );
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("user_question_flags")
      .delete()
      .eq("user_id", user.id)
      .eq("question_id", questionId);
    if (error) return { error: error.message };
  }

  // Deliberately no revalidatePath: revalidating from here refreshes the
  // route the candidate is on, which re-runs its question query and hands
  // the runner a freshly drawn session — the card under them changes as
  // if they had pressed Next. /practise/flagged reads its list on every
  // visit anyway, so it is never stale.
  return { flagged };
}
