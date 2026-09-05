"use server";

import { recordAnswer } from "@/app/session/actions";

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
 */
export async function submitMockPaper(input: {
  sessionId: string;
  secondsTaken: number;
  answers: { questionId: number; chosenKey: string }[];
}): Promise<{
  error?: string;
  results?: { questionId: number; is_correct: boolean }[];
}> {
  const answers = Array.isArray(input.answers) ? input.answers : [];
  if (answers.length === 0) return { results: [] };

  const each = Math.max(1, input.secondsTaken) / answers.length;

  const results: { questionId: number; is_correct: boolean }[] = [];
  for (const answer of answers) {
    const outcome = await recordAnswer({
      questionId: answer.questionId,
      chosenKey: answer.chosenKey,
      secondsTaken: each,
      sessionId: input.sessionId,
    });
    // One unrecordable answer must not lose the paper. It is marked
    // wrong for the candidate's total, which is what an unanswered
    // question is worth in the real thing.
    results.push({
      questionId: answer.questionId,
      is_correct: Boolean(outcome.is_correct),
    });
  }

  return { results };
}
