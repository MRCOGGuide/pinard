"use server";

import { createClient } from "@/lib/supabase/server";
import { rollingPerformance, ROLLING_WINDOW } from "@/lib/performance";

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

/**
 * Similar Values panel (PROJECT.md item 7): NOT AI-generated. Looks up
 * the key facts behind this question's cited chunks, then finds other
 * stored facts sharing the same value (e.g. everything else that is
 * "7%") and returns them as memory pairs with citations.
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
    .select("citation_chunk_ids, status")
    .eq("id", questionId)
    .single();
  if (!question || question.status !== "approved") return [];
  const chunkIds: number[] = question.citation_chunk_ids ?? [];
  if (chunkIds.length === 0) return [];

  const { data: baseFacts } = await supabase
    .from("key_facts")
    .select("id, value_text, value_numeric, statement, source_reference")
    .in("chunk_id", chunkIds);
  if (!baseFacts || baseFacts.length === 0) return [];

  const groups: SimilarValueGroup[] = [];
  const seenValues = new Set<string>();

  for (const base of baseFacts) {
    const valueLabel = base.value_text ?? String(base.value_numeric ?? "");
    if (!valueLabel || seenValues.has(valueLabel)) continue;
    seenValues.add(valueLabel);

    let query = supabase
      .from("key_facts")
      .select("id, statement, source_reference")
      .neq("id", base.id)
      .limit(5);
    query = base.value_text
      ? query.eq("value_text", base.value_text)
      : query.eq("value_numeric", base.value_numeric);
    const { data: matches } = await query;
    if (!matches || matches.length === 0) continue;

    // De-duplicate identical statements (overlapping chunks store twins).
    const statements = new Set<string>([base.statement]);
    const facts = [
      { statement: base.statement, source_reference: base.source_reference },
    ];
    for (const m of matches) {
      if (statements.has(m.statement)) continue;
      statements.add(m.statement);
      facts.push({ statement: m.statement, source_reference: m.source_reference });
    }
    if (facts.length >= 2) groups.push({ value: valueLabel, facts });
    if (groups.length >= 3) break;
  }

  return groups;
}
