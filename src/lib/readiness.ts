/**
 * Readiness as a measure of knowledge (owner, 16 November 2026):
 *
 *   "I need readiness to be a true reflection of knowledge (in easy and
 *   difficult questions), not just 1 question per 5 pages. Because a
 *   really easy question for 5 pages will make them look ready when they
 *   are not because the question they answered as easy and it only
 *   tested one fact and those 5 pages can contain 30+ facts."
 *
 * Counted in facts, not questions or pages.
 *
 *   Facts       Each guideline's examinable facts are those the library
 *               extracted from it (key_facts: risks, timings, incidences,
 *               thresholds, doses, cut-offs). Those are the numerical ones,
 *               so a management step with no number in it is not among
 *               them; a guideline is therefore credited with at least
 *               FACTS_PER_PAGE_FLOOR facts a page, so one rich in advice and
 *               sparse in numbers is not treated as small.
 *
 *   Tested      An answer tests facts by its difficulty: an easy question
 *               (difficulty 1-2) one, a medium one (3) two, a hard one
 *               (4-5) three (FACTS_TESTED). They are facts of the passages
 *               the question cites, and a passage can never be credited
 *               with more facts tested than it holds: ten easy questions
 *               on one paragraph do not stand for a 30-fact guideline.
 *
 *   Knowledge   In each guideline, the share of tested facts answered
 *               correctly, so a hard question right counts three times an
 *               easy one, and a hard one wrong three times against. Easy
 *               questions right and hard ones wrong reads as knowing the
 *               simple facts only, which is what it is.
 *
 *   Enough      The facts that must have been tested to know a candidate's
 *               level in the guideline within about ±25% (95% confidence,
 *               ENOUGH_FOR_ANY): about 4 for a guideline of 5 facts, 10
 *               for 30, 12 for 67, 15 for 1,000. Sampling does not need
 *               every fact tested, but a larger guideline needs more.
 *
 *   Shown       Knowledge times the share of `enough` tested. A guideline
 *               never met shows nothing. Where the bank's questions on a
 *               guideline cannot test `enough`, the part they cannot test
 *               is judged by the candidate's standing across the topic
 *               (topicReadiness), never by the few questions there are.
 *
 * A topic is its guidelines' `shown`, each weighted by its facts and its
 * priority (core 6, supporting 3, background 1: PRIORITY_WEIGHT). Overall
 * readiness weights each topic by its priority times the square root of
 * its facts, so a broad topic counts for more without High-Impact Articles
 * (279 articles) outweighing the core syllabus. A topic is secured at 70%.
 *
 * Everything comes from the library, the bank and the candidate's first
 * answers as they stand, so it moves when any of them does. Pure
 * functions; the model is read by lib/readiness-model.
 */

import { PASS_THRESHOLD, readinessBand, type Readiness } from "@/lib/performance";
import { PRIORITY_WEIGHT } from "@/lib/studyPlan";
import type { SectionPriority } from "@/lib/types";

/** Facts an answer tests, by the question's difficulty (1 to 5). */
export function factsTested(difficulty: number | null | undefined): number {
  if (!difficulty || difficulty <= 2) return 1;
  if (difficulty === 3) return 2;
  return 3;
}

/**
 * Facts tested that tell a candidate's level within ±25% at 95%
 * confidence, in a guideline of unlimited size: 1.96² × 0.25 / 0.25².
 *
 * ±25% rather than ±20% (24), measured on the bank of 16 November 2026
 * with candidates simulated answer by answer: at 24 a candidate getting
 * 75% right showed 59% after 2,000 answers and one getting every answer
 * right 83%, because so much of the bank had to be answered first; at
 * 15 they show 68% and 98%, while a 30-fact guideline still needs about
 * ten facts tested and one easy question right counts for a tenth of it.
 */
export const ENOUGH_FOR_ANY = 15;

/** The least a page is credited with: the library's facts are numerical only. */
export const FACTS_PER_PAGE_FLOOR = 2;

/** Facts tested needed in a guideline of `facts` facts (finite-population sampling). */
export function factsEnough(facts: number): number {
  if (facts <= 0) return 0;
  return ENOUGH_FOR_ANY / (1 + (ENOUGH_FOR_ANY - 1) / facts);
}

export type ReadinessPassage = { document_id: number; facts: number };

export type ReadinessGuideline = {
  section_id: number;
  document_id: number;
  /** Examinable facts, at least FACTS_PER_PAGE_FLOOR a page. */
  facts: number;
  priority: SectionPriority;
  /** Facts the bank's questions on it can test, at most: `enough` is never more. */
  capacity: number;
};

/** Serialisable, so it can be cached between requests. */
export type ReadinessModel = {
  guidelines: ReadinessGuideline[];
  /** Each approved question: its topic, difficulty and the passages it cites. */
  questions: Record<number, { section_id: number; difficulty: number | null; passages: number[] }>;
  /** Each cited passage: its guideline and the facts it holds (at least the floor). */
  passages: Record<number, ReadinessPassage>;
  topicPriority: Record<number, SectionPriority>;
};

export type TopicReadiness = {
  section_id: number;
  /** 0 to 100. */
  percent: number;
  /** Its share of overall readiness, before normalising. */
  weight: number;
  /** Facts tested that count, and facts tested needed. */
  tested: number;
  needed: number;
  /** Share of tested facts answered correctly, 0 to 100, or null if none. */
  knowledge: number | null;
};

const key = (section: number, doc: number) => `${section}:${doc}`;

/**
 * Facts tested and facts answered correctly, per topic and guideline,
 * with each passage capped at the facts it holds. `answers` maps a
 * question to whether its first answer was right; pass every approved
 * question as right to get what the bank can test.
 */
export function testedFacts(
  model: Pick<ReadinessModel, "questions" | "passages">,
  answers: Map<number, boolean>
): Map<string, { tested: number; correct: number }> {
  const perPassage = new Map<string, { section: number; doc: number; facts: number; tested: number; correct: number }>();
  for (const [id, right] of answers) {
    const q = model.questions[id];
    if (!q || q.passages.length === 0) continue;
    const share = factsTested(q.difficulty) / q.passages.length;
    for (const p of q.passages) {
      const passage = model.passages[p];
      if (!passage) continue;
      const k = `${q.section_id}:${p}`;
      const r = perPassage.get(k) ?? { section: q.section_id, doc: passage.document_id, facts: passage.facts, tested: 0, correct: 0 };
      r.tested += share;
      if (right) r.correct += share;
      perPassage.set(k, r);
    }
  }
  const perGuideline = new Map<string, { tested: number; correct: number }>();
  for (const r of perPassage.values()) {
    // No more facts tested in a passage than it holds; right and wrong scaled alike.
    const scale = r.tested > r.facts ? r.facts / r.tested : 1;
    const g = perGuideline.get(key(r.section, r.doc)) ?? { tested: 0, correct: 0 };
    g.tested += r.tested * scale;
    g.correct += r.correct * scale;
    perGuideline.set(key(r.section, r.doc), g);
  }
  return perGuideline;
}

/**
 * Each topic's readiness from first answers (question id to whether it
 * was right).
 *
 * Where the bank cannot test a guideline enough (its questions test
 * fewer facts than `enough`), only the share it can test is judged by
 * the answers there; the rest of the guideline is judged by how the
 * candidate stands across the whole topic, on what the bank can test of
 * every guideline in it. So two easy questions answered rightly on a
 * guideline the bank covers thinly do not make it known, and a gap in
 * the bank is not held against a candidate who is strong across the
 * topic.
 */
export function topicReadiness(model: ReadinessModel, firstAnswers: Map<number, boolean>): Map<number, TopicReadiness> {
  const tested = testedFacts(model, firstAnswers);
  const rows = model.guidelines.map((g) => {
    const enough = factsEnough(g.facts);
    const t = tested.get(key(g.section_id, g.document_id));
    return {
      g,
      enough,
      needed: Math.min(g.capacity, enough),
      tested: t?.tested ?? 0,
      knowledge: t && t.tested > 0 ? t.correct / t.tested : 0,
      right: t?.correct ?? 0,
      weight: PRIORITY_WEIGHT[g.priority] * g.facts,
    };
  });

  // First, the topic on what the bank can test of each guideline.
  const bankLevel = new Map<number, { shown: number; weight: number }>();
  for (const r of rows) {
    const coverage = r.needed > 0 ? Math.min(1, r.tested / r.needed) : 0;
    const b = bankLevel.get(r.g.section_id) ?? { shown: 0, weight: 0 };
    b.shown += r.weight * r.knowledge * coverage;
    b.weight += r.weight;
    bankLevel.set(r.g.section_id, b);
  }
  const levelOf = (section: number) => {
    const b = bankLevel.get(section);
    return b && b.weight > 0 ? b.shown / b.weight : 0;
  };

  // Then each guideline: its own answers for the share the bank can test, the topic's level for the rest.
  const acc = new Map<number, { shown: number; weight: number; facts: number; tested: number; needed: number; right: number; asked: number }>();
  for (const r of rows) {
    const testable = r.enough > 0 ? Math.min(1, r.g.capacity / r.enough) : 1;
    const direct = r.enough > 0 ? r.knowledge * Math.min(1, r.tested / r.enough) : 0;
    const shown = direct + (1 - testable) * levelOf(r.g.section_id);
    const a = acc.get(r.g.section_id) ?? { shown: 0, weight: 0, facts: 0, tested: 0, needed: 0, right: 0, asked: 0 };
    a.shown += r.weight * shown;
    a.weight += r.weight;
    a.facts += r.g.facts;
    a.tested += Math.min(r.tested, r.needed);
    a.needed += r.needed;
    a.right += r.right;
    a.asked += r.tested;
    acc.set(r.g.section_id, a);
  }
  const out = new Map<number, TopicReadiness>();
  for (const [section_id, a] of acc) {
    out.set(section_id, {
      section_id,
      percent: a.weight > 0 ? (a.shown / a.weight) * 100 : 0,
      weight: PRIORITY_WEIGHT[model.topicPriority[section_id] ?? 2] * Math.sqrt(a.facts),
      tested: a.tested,
      needed: a.needed,
      knowledge: a.asked > 0 ? (a.right / a.asked) * 100 : null,
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
    touched: list.filter((t) => t.tested > 0).length,
    total: list.length,
    topics,
  };
}
