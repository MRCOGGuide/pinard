/**
 * Deterministic study-plan algorithm (PROJECT.md section 7, item 4).
 * No AI: distributes remaining days across the syllabus, front-loading
 * weak topics, guaranteeing full coverage, inserting spaced-repetition
 * revisits of secured topics every ~7 days, and tapering to mixed mock
 * papers in the final fortnight. Claude writes only the narrative (P).
 *
 * Pure functions only — unit-tested, no I/O.
 */

import type { SectionPriority } from "@/lib/types";
import { DEFAULT_DAILY, RATING_GIVES_WAY, RATING_PRIOR, type Confidence } from "@/lib/confidence";

export type MasteryBand = "weak" | "developing" | "secure";

export type PlanUnit = {
  section_id: number;
  title: string;
  band: MasteryBand;
  accuracy: number; // 0–100 rolling accuracy (0 when unseen)
  /**
   * Distinct questions answered in this section, up to the rolling
   * window of twenty. Repeats are not counted, because the same
   * question answered three times is one piece of evidence about the
   * topic, not three.
   *
   * Accuracy on its own cannot say how much to believe itself: one
   * correct answer reads as 100%. Readiness uses this to decide
   * whether a topic's figure has earned full weight.
   */
  attempts?: number;
  /** Answers this topic needs before its score is believed in full (lib/performance sureAtFor). */
  sureAt?: number;
  /** 1 core syllabus · 2 supporting literature · 3 background. */
  priority: SectionPriority;
  /**
   * Whether the bank holds approved questions for this section.
   *
   * A section nobody has practised reads as 0% and therefore weak, which
   * is what should put it first — but a section with nothing to practise
   * reads exactly the same way while being unable to serve a single
   * question. Scheduling those spends a candidate's days on sessions
   * that can only apologise, and it spends them first, because weak
   * comes first and repeats three times.
   *
   * So a plan schedules only what can be answered. The section is not
   * dropped from the syllabus — every section is examined — it simply
   * waits for its questions, and the topic map says so.
   *
   * Absent means covered. The coverage planner deliberately omits it:
   * it asks what the plan *would* demand of every section in order to
   * decide what to generate, which is the one caller that must see the
   * empty ones.
   */
  covered?: boolean;
  /** What the candidate said about the topic, if they rated it (lib/confidence). */
  rating?: Confidence;
  /** What decided the band: their answers, their rating, or neither yet. */
  source?: "answers" | "rating" | "unknown";
  /** Rated confident with too few answers to know: asked early, to confirm it. */
  confirm?: boolean;
};

/**
 * How much of a candidate's time each tier is worth, at equal accuracy.
 *
 * Every section is examined, so none is ever dropped — but a core
 * clinical topic earns roughly six times the attention of background
 * material, and a candidate close to their exam should not be spending
 * their evenings on practice papers.
 */
export const PRIORITY_WEIGHT: Record<SectionPriority, number> = {
  1: 6,
  2: 3,
  3: 1,
};

export type PlanItem = { section_id: number; title: string; question_target: number };
export type PlanDayKind = "study" | "review" | "mixed";
export type PlanDay = { date: string; kind: PlanDayKind; items: PlanItem[] };
export type PlanWeek = { week_number: number; days: PlanDay[] };

export type StudyPlan = {
  meta: {
    exam_date: string;
    generated_on: string;
    days_remaining: number;
    snapshot: string; // material-change detector
  };
  weeks: PlanWeek[];
  totals: {
    study_days: number;
    review_days: number;
    mixed_days: number;
    sections: number;
  };
};

/**
 * Changed when the building itself changes, so plans stored before are
 * rebuilt rather than reused. "v2": review days taken in turn (Phase C,
 * 16 November 2026). Empty before that, so nothing older needs it.
 */
const PLAN_VERSION = "v2:";

const FINAL_FORTNIGHT = 14;
const REVIEW_EVERY = 7; // spaced revisit cadence (days), within the 7–10 band
const BAND_RANK: Record<MasteryBand, number> = { weak: 0, developing: 1, secure: 2 };
const TARGET: Record<MasteryBand, number> = { weak: 8, developing: 6, secure: 4 };

// ---------- date helpers (UTC, YYYY-MM-DD) ----------
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}
export function addDays(date: Date, n: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}
export function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Stable fingerprint of the inputs that should trigger a regeneration. */
export function planSnapshot(examDate: string, units: PlanUnit[], daily = DEFAULT_DAILY): string {
  // Priority is part of the fingerprint: retiering a section changes how
  // the plan should spend its days, so the plan is rebuilt when it does.
  // So is coverage — the day a section's first questions are approved,
  // the plan should start scheduling it. And so are a rating still to be
  // confirmed and the questions a day the candidate has time for.
  const parts = units
    .map(
      (u) =>
        `${u.section_id}:${u.band}:${u.priority}:${u.covered === false ? 0 : 1}${u.confirm ? ":c" : ""}`
    )
    .sort()
    .join(",");
  // PLAN_VERSION rebuilds every stored plan once when the way plans are built changes.
  const head = `${PLAN_VERSION}${examDate}`;
  return daily === DEFAULT_DAILY ? `${head}|${parts}` : `${head}|d${daily}|${parts}`;
}

/**
 * The first pass, with the topics the candidate called confident brought
 * forward: one in every three places, so each is checked within the
 * first weeks rather than at the end of the queue where secure topics
 * sit. Once answered, the answers decide (lib/performance placeOf).
 */
function withConfirmations(ordered: PlanUnit[]): PlanUnit[] {
  const confirm = ordered.filter((u) => u.confirm);
  if (confirm.length === 0) return ordered;
  const rest = ordered.filter((u) => !u.confirm);
  const out: PlanUnit[] = [];
  while (rest.length || confirm.length) {
    for (let i = 0; i < 2 && rest.length; i++) out.push(rest.shift()!);
    if (confirm.length) out.push(confirm.shift()!);
  }
  return out;
}

/**
 * A day's questions, shared among its topics in the same proportions as
 * their targets, so the day asks what the candidate said they have time
 * for (owner, 16 November 2026) and Today's "about N questions" is the
 * session they get.
 */
function fitDay(items: PlanItem[], daily: number): PlanItem[] {
  const total = items.reduce((s, i) => s + i.question_target, 0);
  if (total <= 0 || items.length === 0) return items;
  const exact = items.map((i) => (i.question_target / total) * daily);
  const counts = exact.map((e) => Math.max(1, Math.floor(e)));
  let assigned = counts.reduce((s, c) => s + c, 0);
  const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; assigned < daily && order.length; k++, assigned++) counts[order[k % order.length].i]++;
  return items.map((it, i) => ({ ...it, question_target: counts[i] }));
}

/**
 * Weakest first, and among equally weak topics the most examined first.
 * Band still leads: a weak background topic needs work before a secure
 * core one, but two weak topics are not equally urgent.
 */
function unitsWeakFirst(units: PlanUnit[]): PlanUnit[] {
  return [...units].sort(
    (a, b) =>
      BAND_RANK[a.band] - BAND_RANK[b.band] ||
      a.priority - b.priority ||
      a.section_id - b.section_id
  );
}

function itemFor(unit: PlanUnit, target = TARGET[unit.band]): PlanItem {
  return { section_id: unit.section_id, title: unit.title, question_target: target };
}

export function buildStudyPlan(
  todayISO: string,
  examDateISO: string,
  units: PlanUnit[],
  /** Questions a day the candidate has time for (lib/confidence dailyQuestionsFor). */
  daily = DEFAULT_DAILY
): StudyPlan {
  const today = parseDay(todayISO);
  const exam = parseDay(examDateISO);
  const daysRemaining = diffDays(today, exam);

  const meta = {
    exam_date: examDateISO,
    generated_on: todayISO,
    days_remaining: daysRemaining,
    snapshot: planSnapshot(examDateISO, units, daily),
  };

  // Only sections that can actually serve a question are scheduled; see
  // PlanUnit.covered. The rest stay in the syllabus and out of the diary.
  const schedulable = units.filter((u) => u.covered !== false);

  // Exam passed or is today, or nothing to plan.
  if (daysRemaining <= 0 || schedulable.length === 0) {
    return {
      meta,
      weeks: [],
      totals: {
        study_days: 0,
        review_days: 0,
        mixed_days: 0,
        sections: schedulable.length,
      },
    };
  }

  const ordered = unitsWeakFirst(schedulable);

  // Weighted rotation: pass 1 covers everything (weak-first), pass 2 repeats
  // weak+developing, pass 3 repeats weak — so weak appears 3×, developing 2×,
  // secure 1×, and full coverage lands first.
  //
  // Two further passes over the core syllabus, and one over the
  // supporting literature, put the days where the exam is: background
  // material still appears, because pass 1 covers everything, but it
  // comes round once for every four visits to a core topic.
  const rotation: PlanUnit[] = [
    ...withConfirmations(ordered),
    ...ordered.filter((u) => u.band !== "secure"),
    ...ordered.filter((u) => u.band === "weak"),
    ...ordered.filter((u) => u.priority === 1),
    ...ordered.filter((u) => u.priority === 1),
    ...ordered.filter((u) => u.priority === 2),
  ];

  /*
    What review days revisit: the secured topics, then the developing
    ones, taken in turn. Every review day used to take the first four of
    this list, so across a whole plan the same four topics were reviewed
    fourteen times and the other twenty secured or developing ones never
    once (Phase C, 16 November 2026).
  */
  const secureOrDeveloping = [
    ...ordered.filter((u) => u.band === "secure"),
    ...ordered.filter((u) => u.band === "developing"),
  ];
  let reviewCount = 0;

  // Walk each future day.
  const days: PlanDay[] = [];
  let studyDayCount = 0;
  let rot = 0;

  // Sections per study day, enough to cover the syllabus within the study window.
  const studyWindow = Math.max(1, daysRemaining - FINAL_FORTNIGHT);
  const perDay = Math.min(
    4,
    Math.max(2, Math.ceil(schedulable.length / studyWindow))
  );

  // Cover today through the day before the exam (daysRemaining entries), so
  // "today's session" always has a plan day even on the generation date.
  for (let offset = 0; offset < daysRemaining; offset++) {
    const date = toISO(addDays(today, offset));
    const daysToExam = daysRemaining - offset;

    // Final fortnight → mixed mock papers across a rotating window of sections.
    if (daysToExam < FINAL_FORTNIGHT) {
      const start = (offset * 3) % ordered.length;
      const window: PlanItem[] = [];
      const size = Math.min(6, ordered.length);
      for (let i = 0; i < size; i++) {
        window.push(itemFor(ordered[(start + i) % ordered.length], 4));
      }
      days.push({ date, kind: "mixed", items: fitDay(window, daily) });
      continue;
    }

    // Every ~7th study day → spaced revisit of secured (else developing) topics.
    if (studyDayCount > 0 && studyDayCount % REVIEW_EVERY === 0 && secureOrDeveloping.length > 0) {
      const size = Math.min(4, secureOrDeveloping.length);
      const start = (reviewCount * size) % secureOrDeveloping.length;
      const revisit = Array.from({ length: size }, (_, i) => secureOrDeveloping[(start + i) % secureOrDeveloping.length]);
      days.push({ date, kind: "review", items: fitDay(revisit.map((u) => itemFor(u, 4)), daily) });
      reviewCount++;
      studyDayCount++;
      continue;
    }

    // Ordinary study day: next `perDay` sections from the weighted rotation.
    const items: PlanItem[] = [];
    const seen = new Set<number>();
    let guard = 0;
    while (items.length < perDay && guard < rotation.length * 2) {
      const unit = rotation[rot % rotation.length];
      rot++;
      guard++;
      if (seen.has(unit.section_id)) continue; // no repeats within one day
      seen.add(unit.section_id);
      items.push(itemFor(unit));
    }
    days.push({ date, kind: "study", items: fitDay(items, daily) });
    studyDayCount++;
  }

  // Group into 7-day weeks from today.
  const weeks: PlanWeek[] = [];
  for (const day of days) {
    const weekNo = Math.floor(diffDays(today, parseDay(day.date) ) / 7);
    let week = weeks.find((w) => w.week_number === weekNo);
    if (!week) {
      week = { week_number: weekNo, days: [] };
      weeks.push(week);
    }
    week.days.push(day);
  }
  weeks.sort((a, b) => a.week_number - b.week_number);

  const totals = {
    study_days: days.filter((d) => d.kind === "study").length,
    review_days: days.filter((d) => d.kind === "review").length,
    mixed_days: days.filter((d) => d.kind === "mixed").length,
    sections: schedulable.length,
  };

  return { meta, weeks, totals };
}

/**
 * Daily-session selection weighting (PROJECT.md item 5): sections below
 * 70% get weight proportional to (70 − accuracy); sections at/above 70%
 * enter spaced review with a small fixed weight. Returns how many
 * questions to draw from each section for a session of `size`.
 */
export function weightedSessionAllocation(
  units: PlanUnit[],
  size: number
): { section_id: number; count: number }[] {
  if (units.length === 0 || size <= 0) return [];
  const SPACED = 5; // small weight so secured topics still resurface

  // Distance from the pass mark decides how much work a topic needs;
  // its tier decides how much that work is worth. A background topic at
  // 40% still appears, but a core topic at 40% gets six times the
  // questions.
  // Until a rated topic has a few answers, the rating stands in for its
  // score (lib/confidence RATING_PRIOR): a 0% that only means unasked must
  // not outweigh a topic the candidate said they are not confident in.
  const accuracyOf = (u: PlanUnit) =>
    u.rating && (u.attempts ?? 0) < RATING_GIVES_WAY ? RATING_PRIOR[u.rating] : u.accuracy;
  const weights = units.map((u) => ({
    section_id: u.section_id,
    weight:
      (accuracyOf(u) < 70 ? Math.max(70 - accuracyOf(u), 1) : SPACED) *
      PRIORITY_WEIGHT[u.priority],
  }));
  const total = weights.reduce((s, w) => s + w.weight, 0);

  // Largest-remainder apportionment so counts sum exactly to `size`.
  const raw = weights.map((w) => ({
    section_id: w.section_id,
    exact: (w.weight / total) * size,
  }));
  const alloc = raw.map((r) => ({ section_id: r.section_id, count: Math.floor(r.exact) }));
  let assigned = alloc.reduce((s, a) => s + a.count, 0);
  const byRemainder = [...raw]
    .map((r, i) => ({ i, frac: r.exact - Math.floor(r.exact) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (assigned < size && byRemainder.length > 0) {
    alloc[byRemainder[k % byRemainder.length].i].count++;
    assigned++;
    k++;
  }
  return alloc.filter((a) => a.count > 0);
}
