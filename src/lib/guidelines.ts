/**
 * Weakness inside a topic, guideline by guideline (Phase C proposal 1,
 * approved by the owner on 16 November 2026).
 *
 * A plan topic is broad: Antenatal Care holds questions from 25
 * guidelines and High-Impact Articles from 279 articles, yet each had
 * one score, so 70% overall could hide a guideline answered wrongly every
 * time. Every approved question records the documents it was written
 * from (source_document_ids), so each guideline can be scored from the
 * answers already stored. No table.
 *
 * Scored on first attempts only, as topics are (lib/review firstAttempts):
 * a question answered again says whether an answer was remembered, not
 * whether the guidance is known.
 *
 * Pure functions; no I/O.
 */

/**
 * What an unasked guideline is taken to stand at, and how many answers
 * that assumption is worth. With the pass mark at 0.7 and a weight of
 * two, a guideline answered wrongly once (0.47) comes before one never
 * asked (0.70), which comes before one answered rightly once (0.80): the
 * order a candidate's time should go in.
 */
const PRIOR = 0.7;
const PRIOR_WEIGHT = 2;

export type GuidelineRecord = { answered: number; correct: number };

/** Accuracy drawn toward the pass mark when the answers are few. */
export function guidelineNeed(record: GuidelineRecord | undefined): number {
  const answered = record?.answered ?? 0;
  const correct = record?.correct ?? 0;
  return (correct + PRIOR * PRIOR_WEIGHT) / (answered + PRIOR_WEIGHT);
}

/**
 * Answers per guideline. `firstAnswers` maps a question to whether its
 * first answer was right; `docsOf` maps a question to the documents it
 * was written from. A question from two documents counts toward both.
 */
export function scoreGuidelines(
  firstAnswers: Map<number, boolean>,
  docsOf: (questionId: number) => number[] | null | undefined
): Map<number, GuidelineRecord> {
  const scores = new Map<number, GuidelineRecord>();
  for (const [questionId, correct] of firstAnswers) {
    for (const doc of docsOf(questionId) ?? []) {
      const r = scores.get(doc) ?? { answered: 0, correct: 0 };
      r.answered += 1;
      if (correct) r.correct += 1;
      scores.set(doc, r);
    }
  }
  return scores;
}

type Orderable = { id: number; emq_group_id: string | null; source_document_ids: number[] | null };

/**
 * A topic's questions in the order a session should take them: one from
 * each guideline in turn, the guidelines most in need first (answered
 * worst, then never asked, then answered well), so a session spreads
 * over the guidance and leans to where it is weak.
 *
 * An EMQ set moves as one, its scenarios together, so the session
 * selector that reads this order takes whole sets rather than a scenario
 * from each of several. The pool should arrive shuffled: ties keep the
 * order they arrive in, which is what keeps sessions varied.
 */
export function orderByGuidelineNeed<T extends Orderable>(pool: T[], firstAnswers: Map<number, boolean>): T[] {
  const docsById = new Map(pool.map((q) => [q.id, q.source_document_ids]));
  const scores = scoreGuidelines(firstAnswers, (id) => docsById.get(id));

  // Items: a single question, or a whole EMQ set.
  const items: T[][] = [];
  const setIndex = new Map<string, number>();
  for (const q of pool) {
    if (q.emq_group_id) {
      const at = setIndex.get(q.emq_group_id);
      if (at !== undefined) {
        items[at].push(q);
        continue;
      }
      setIndex.set(q.emq_group_id, items.length);
    }
    items.push([q]);
  }

  // Grouped by the guideline each item was written from (its first document).
  const groups = new Map<number, T[][]>();
  for (const item of items) {
    const doc = item[0].source_document_ids?.[0] ?? -1;
    const list = groups.get(doc) ?? [];
    list.push(item);
    groups.set(doc, list);
  }
  const ordered = [...groups.entries()]
    .map(([doc, list], arrival) => ({ need: guidelineNeed(scores.get(doc)), list, arrival }))
    .sort((a, b) => a.need - b.need || a.arrival - b.arrival);

  // One item from each guideline in turn, neediest first.
  const out: T[] = [];
  for (let round = 0; out.length < pool.length; round++) {
    let took = false;
    for (const g of ordered) {
      const item = g.list[round];
      if (item) {
        out.push(...item);
        took = true;
      }
    }
    if (!took) break;
  }
  return out;
}

/**
 * The guidelines a candidate most needs to work on, for Progress: those
 * answered at least twice and under the pass mark, worst first.
 */
export function weakestGuidelines(
  scores: Map<number, GuidelineRecord>,
  limit = 6
): { documentId: number; answered: number; correct: number }[] {
  return [...scores.entries()]
    .filter(([, r]) => r.answered >= 2 && r.correct / r.answered < 0.7)
    .sort((a, b) => guidelineNeed(a[1]) - guidelineNeed(b[1]) || b[1].answered - a[1].answered)
    .slice(0, limit)
    .map(([documentId, r]) => ({ documentId, ...r }));
}
