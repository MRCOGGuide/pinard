/**
 * Readiness that answers for the breadth and weight of what is examined
 * (owner, 16 November 2026: "Can't expect a candidate to be ready based
 * on 5 questions in a 5 page guideline vs 30 pages guideline - make it
 * dynamic and truly reflection of correct and appropriate readiness").
 *
 * Built from guidelines, not topics. For each guideline behind a topic's
 * questions:
 *
 *   pages     its length in the library, counted in chunks of 600 to
 *             800 tokens, about a printed page each;
 *   needed    the answers it takes to have been tested on it: one for
 *             every PAGES_PER_ANSWER pages, at least one, and never more
 *             than the questions the bank holds on it, so a candidate is
 *             not marked down for a gap in the bank;
 *   shown     accuracy on first answers there, times the share of
 *             `needed` answered: a guideline never asked shows nothing,
 *             and two of six answers count for a third.
 *
 * A topic's readiness is its guidelines' `shown`, each weighted by its
 * pages and its priority (a core guideline six times a background one,
 * PRIORITY_WEIGHT), so a 30-page guideline counts six times a 5-page one
 * of the same standing. Overall readiness weights each topic by its
 * priority and by the square root of its pages: broad topics count for
 * more, but High-Impact Articles, with 279 articles and some 5,000 pages,
 * does not outweigh the core syllabus as it would counted page for page.
 * A topic is secured at 70%, which needs both: enough of it answered,
 * and answered well.
 *
 * Everything is derived from the library and the bank as they stand,
 * so it moves when either does. Pure functions; the model is read by
 * lib/readiness-model.
 */

import { PASS_THRESHOLD, readinessBand, type Readiness } from "@/lib/performance";
import { PRIORITY_WEIGHT } from "@/lib/studyPlan";
import type { SectionPriority } from "@/lib/types";

/**
 * Pages of guidance per answer needed. Five, from the owner's own test:
 * five answers make a 5-page guideline (one needed) count in full and a
 * 30-page one (six needed) count for five-sixths; at eight pages, the
 * 30-page guideline would have needed only four and counted in full on
 * five. A 100-page guideline needs twenty. Measured on the bank of 16
 * November 2026 (2,540 Part 2 questions): with answers spread across the
 * guidance as sessions spread them, a candidate answering 75% correctly
 * shows 41% after 1,000 answers, 58% after 1,500 and their full 74% after
 * about 2,000. The demand grows with the bank, up to one answer per five
 * pages of everything it is written from.
 */
export const PAGES_PER_ANSWER = 5;

export type ReadinessGuideline = {
  section_id: number;
  document_id: number;
  /** Chunks in the library, about a page each. */
  pages: number;
  priority: SectionPriority;
  /** Approved questions in this topic written from this guideline. */
  available: number;
};

/** Serialisable, so it can be cached between requests. */
export type ReadinessModel = {
  guidelines: ReadinessGuideline[];
  /** Each approved question's topic and the guidelines it was written from. */
  questions: Record<number, { section_id: number; documents: number[] }>;
  topicPriority: Record<number, SectionPriority>;
};

export type TopicReadiness = {
  section_id: number;
  /** 0 to 100. */
  percent: number;
  /** Its share of overall readiness, before normalising. */
  weight: number;
  /** Answers counted toward what it needs, and what it needs. */
  answered: number;
  needed: number;
};

export function answersNeeded(g: Pick<ReadinessGuideline, "pages" | "available">): number {
  return Math.max(1, Math.min(g.available, Math.ceil(g.pages / PAGES_PER_ANSWER)));
}

const pairKey = (section: number, doc: number) => `${section}:${doc}`;

/** Each topic's readiness from first answers (question id to whether it was right). */
export function topicReadiness(model: ReadinessModel, firstAnswers: Map<number, boolean>): Map<number, TopicReadiness> {
  const records = new Map<string, { answered: number; correct: number }>();
  for (const [id, correct] of firstAnswers) {
    const q = model.questions[id];
    if (!q) continue;
    for (const doc of q.documents) {
      const k = pairKey(q.section_id, doc);
      const r = records.get(k) ?? { answered: 0, correct: 0 };
      r.answered += 1;
      if (correct) r.correct += 1;
      records.set(k, r);
    }
  }

  const acc = new Map<number, { shown: number; weight: number; pages: number; answered: number; needed: number }>();
  for (const g of model.guidelines) {
    const need = answersNeeded(g);
    const r = records.get(pairKey(g.section_id, g.document_id));
    const shown = r && r.answered > 0 ? (r.correct / r.answered) * Math.min(1, r.answered / need) : 0;
    const w = PRIORITY_WEIGHT[g.priority] * g.pages;
    const t = acc.get(g.section_id) ?? { shown: 0, weight: 0, pages: 0, answered: 0, needed: 0 };
    t.shown += w * shown;
    t.weight += w;
    t.pages += g.pages;
    t.answered += Math.min(r?.answered ?? 0, need);
    t.needed += need;
    acc.set(g.section_id, t);
  }

  const out = new Map<number, TopicReadiness>();
  for (const [section_id, t] of acc) {
    out.set(section_id, {
      section_id,
      percent: t.weight > 0 ? (t.shown / t.weight) * 100 : 0,
      weight: PRIORITY_WEIGHT[model.topicPriority[section_id] ?? 2] * Math.sqrt(t.pages),
      answered: t.answered,
      needed: t.needed,
    });
  }
  return out;
}

/**
 * Overall readiness. `sections`, when given, limits it to those topics
 * (the plan's units the bank can serve), so every screen counts the same
 * syllabus.
 */
export function overallReadiness(
  model: ReadinessModel,
  firstAnswers: Map<number, boolean>,
  sections?: Set<number>
): Readiness & { topics: Map<number, TopicReadiness> } {
  const all = topicReadiness(model, firstAnswers);
  const topics = new Map([...all].filter(([id]) => !sections || sections.has(id)));
  const list = [...topics.values()];
  const weight = list.reduce((s, t) => s + t.weight, 0);
  const percent = weight > 0 ? Math.round(list.reduce((s, t) => s + t.weight * t.percent, 0) / weight) : 0;
  return {
    percent,
    band: readinessBand(percent),
    secured: list.filter((t) => Math.round(t.percent) >= PASS_THRESHOLD).length,
    touched: list.filter((t) => t.answered > 0).length,
    total: list.length,
    topics,
  };
}
