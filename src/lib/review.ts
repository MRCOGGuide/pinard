/**
 * Coming back to what you got wrong.
 *
 * The question this answers: as someone revises, how does Pinard tell
 * whether they have actually improved in a topic? Three mechanisms
 * were possible and they are not alternatives, they are three
 * different jobs, so two are used here and the third is deliberately
 * refused.
 *
 *   The item you got wrong comes back.  This file. A question answered
 *     incorrectly returns after three days, then ten, then
 *     twenty-five, and retires once it has been answered correctly at
 *     all three. Spaced retrieval of your own errors is the single
 *     mechanism with the most evidence behind it, and until now
 *     nothing in the product did it: a question answered wrongly in
 *     week one was never seen again while any unseen question
 *     remained, so the one thing a candidate had demonstrably not
 *     learnt was the one thing never asked again.
 *
 *   The topic is scored on questions you have NOT seen.  Unchanged,
 *     and the reason the two must stay separate. If a repeat counted
 *     toward a topic's rolling accuracy, the score would measure
 *     whether someone remembers an answer rather than whether they
 *     know the medicine, and readiness would climb while nothing
 *     improved. Retries are served but not scored; fresh questions in
 *     the same section are what move the number.
 *
 *   A second diagnostic.  Refused. It spends an hour of a candidate's
 *     revision re-measuring what their daily answers already measure,
 *     and measures it worse: one question per topic against a rolling
 *     twenty. The diagnostic earns its hour once, as the cold start
 *     when there is no history at all.
 *
 * Nothing here needs a table. Every fact required is already in
 * user_answers: which question, whether it was right, and when.
 */

/**
 * Days after the previous attempt before a question is asked again:
 * once after three days, again after ten, last after twenty-five.
 *
 * Expanding, because an interval that stays short tests recognition
 * and an interval that opens out tests retrieval. The three together
 * span about five weeks, which fits inside the revision window a
 * candidate on this product actually has.
 */
export const RETRY_INTERVALS_DAYS = [3, 10, 25];

/** Correct answers in a row, after getting it wrong, before it retires. */
export const RETRIES_TO_RETIRE = RETRY_INTERVALS_DAYS.length;

export type Attempt = {
  question_id: number;
  is_correct: boolean;
  answered_at: string;
};

export type RetryState =
  | { status: "fresh" }
  | { status: "retired" }
  | { status: "waiting"; step: number; dueAt: Date }
  | { status: "due"; step: number; dueAt: Date };

const DAY_MS = 86_400_000;

/**
 * Where one question stands, from its attempts in any order.
 *
 * `step` counts correct answers since the last wrong one, so it is
 * both how many retrievals are banked and which interval applies next.
 */
export function retryState(attempts: Attempt[], now: Date): RetryState {
  if (attempts.length === 0) return { status: "fresh" };

  const ordered = [...attempts].sort(
    (a, b) => Date.parse(a.answered_at) - Date.parse(b.answered_at)
  );

  const lastWrong = ordered.map((a) => a.is_correct).lastIndexOf(false);
  // Never got it wrong, so there is nothing to come back to. A question
  // answered correctly first time is simply spent.
  if (lastWrong === -1) return { status: "retired" };

  const since = ordered.slice(lastWrong + 1);
  if (since.length >= RETRIES_TO_RETIRE) return { status: "retired" };

  const step = since.length;
  const last = ordered[ordered.length - 1];
  const dueAt = new Date(
    Date.parse(last.answered_at) + RETRY_INTERVALS_DAYS[step] * DAY_MS
  );
  return {
    status: now.getTime() >= dueAt.getTime() ? "due" : "waiting",
    step,
    dueAt,
  };
}

/**
 * The questions to ask again today, most overdue first.
 *
 * Ordering by how long something has been waiting rather than by when
 * it was failed: a question three weeks past its date is more urgent
 * than one failed yesterday, and on a day with more due than a session
 * can hold, the oldest debt is the one worth paying.
 */
export function dueForRetry(attempts: Attempt[], now: Date): number[] {
  const byQuestion = new Map<number, Attempt[]>();
  for (const a of attempts) {
    const list = byQuestion.get(a.question_id);
    if (list) list.push(a);
    else byQuestion.set(a.question_id, [a]);
  }

  const due: { question_id: number; dueAt: number }[] = [];
  byQuestion.forEach((list, question_id) => {
    const state = retryState(list, now);
    if (state.status === "due") {
      due.push({ question_id, dueAt: state.dueAt.getTime() });
    }
  });
  return due.sort((a, b) => a.dueAt - b.dueAt).map((d) => d.question_id);
}

/**
 * First attempts only, newest last, for scoring a topic.
 *
 * A repeat says whether an answer was remembered; only a question
 * never seen before says whether the topic is known. Rolling accuracy
 * is the topic's number, so it is built from these.
 */
export function firstAttempts(attempts: Attempt[]): Attempt[] {
  const seen = new Set<number>();
  return [...attempts]
    .sort((a, b) => Date.parse(a.answered_at) - Date.parse(b.answered_at))
    .filter((a) => {
      if (seen.has(a.question_id)) return false;
      seen.add(a.question_id);
      return true;
    });
}

/**
 * How much of a session may be questions coming back.
 *
 * A quarter. Enough that errors are genuinely revisited, little
 * enough that a candidate who got a bad week wrong does not open
 * tomorrow's session to find it is all yesterday's mistakes, which is
 * the state in which people stop opening it.
 */
export const RETRY_SHARE = 0.25;

export function retryBudget(sessionSize: number): number {
  return Math.max(1, Math.floor(sessionSize * RETRY_SHARE));
}
