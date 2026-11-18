"use server";

import { recordAnswer } from "@/app/session/actions";
import { createClient } from "@/lib/supabase/server";
import { getAccess, hasFullAccess } from "@/lib/access";
import { fetchQuestionsByIds, type SessionQuestion } from "@/lib/session";

/* The mock is part of the subscription. The page already sends a free
   account to /pricing, but this action can be called directly, and it
   marks every answer it is given, so it checks for itself (security
   audit H1). A paper is also capped at the full paper's size. */
const MAX_PAPER_ITEMS = 400;

/* How long one hand-in call may spend recording before it returns and
   lets the page call again for the rest (pre-launch review, 18 November
   2026: a full paper recorded in one call could outlast the server's
   time limit, and the page then waited on "Marking" for ever). */
const RECORD_BUDGET_MS = 35_000;

/**
 * Record a whole paper at once, when it is submitted.
 *
 * A daily session records each answer as it is given, because it tells
 * the candidate immediately whether they were right. A mock does not:
 * nothing is marked until the paper is handed in, so nothing is written
 * until then either. Writing as they went would put the verdict on the
 * wire one question at a time, where the page could read it.
 *
 * Every answer still goes through recordAnswer, so a mock feeds the
 * topic map and the study plan exactly as practice does. The seconds
 * are the paper's own time divided between its questions: the runner
 * knows how long the paper took, not how long each question took, and
 * a candidate who revisits an answer three times has no single figure
 * to report anyway.
 *
 * Safe to call again for the same sitting: answers already recorded
 * under this sitting are read back rather than recorded twice, so a
 * retry after a dropped connection, or the next call of a long paper,
 * finishes the job. `remaining` above zero means call again.
 */
export async function submitMockPaper(input: {
  sessionId: string;
  secondsTaken: number;
  answers: { questionId: number; chosenKey: string }[];
}): Promise<{
  error?: string;
  results?: { questionId: number; is_correct: boolean }[];
  remaining?: number;
}> {
  const started = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to hand in a paper." };
  if (!hasFullAccess(await getAccess(supabase, user.id))) {
    return { error: "The mock is part of the full subscription." };
  }

  const answers = Array.isArray(input.answers) ? input.answers.slice(0, MAX_PAPER_ITEMS) : [];
  if (answers.length === 0) return { results: [], remaining: 0 };
  const sessionId = String(input.sessionId ?? "").slice(0, 64);

  // What this sitting has already recorded, from an earlier call.
  const { data: done } = await supabase
    .from("user_answers")
    .select("question_id, is_correct")
    .eq("user_id", user.id)
    .eq("session_id", sessionId);
  const recorded = new Map((done ?? []).map((row) => [Number(row.question_id), Boolean(row.is_correct)]));

  const each = Math.max(1, input.secondsTaken) / answers.length;

  const results: { questionId: number; is_correct: boolean }[] = [];
  let remaining = 0;
  for (const answer of answers) {
    const already = recorded.get(answer.questionId);
    if (already !== undefined) {
      results.push({ questionId: answer.questionId, is_correct: already });
      continue;
    }
    if (Date.now() - started > RECORD_BUDGET_MS) {
      remaining++;
      continue;
    }
    const outcome = await recordAnswer({
      questionId: answer.questionId,
      chosenKey: answer.chosenKey,
      secondsTaken: each,
      sessionId,
    });
    // One unrecordable answer must not lose the paper. It is marked
    // wrong for the candidate's total, which is what an unanswered
    // question is worth in the real thing.
    results.push({
      questionId: answer.questionId,
      is_correct: Boolean(outcome.is_correct),
    });
  }

  return { results, remaining };
}

/**
 * The questions of a paper being resumed, by id and in the paper's order
 * (pre-launch review, 18 November 2026: a reload or a dropped tab lost
 * the paper). The page keeps the ids and the answers on the device; this
 * fetches the questions again. Questions retired since are left out.
 */
export async function loadMockPaper(ids: number[]): Promise<{ error?: string; questions?: SessionQuestion[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to carry on with your paper." };
  if (!hasFullAccess(await getAccess(supabase, user.id))) {
    return { error: "The mock is part of the full subscription." };
  }
  const wanted = (Array.isArray(ids) ? ids : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MAX_PAPER_ITEMS);
  if (wanted.length === 0) return { error: "That paper could not be found." };
  const questions = await fetchQuestionsByIds(supabase, wanted);
  if (questions.length === 0) return { error: "That paper could not be found." };
  return { questions };
}
