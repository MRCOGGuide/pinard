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

export type MasteryBand = "weak" | "developing" | "secure";

export type PlanUnit = {
  section_id: number;
  title: string;
  band: MasteryBand;
  accuracy: number; // 0–100 rolling accuracy (0 when unseen)
  /** 1 core syllabus · 2 supporting literature · 3 background. */
  priority: SectionPriority;
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
export function planSnapshot(examDate: string, units: PlanUnit[]): string {
  // Priority is part of the fingerprint: retiering a section changes how
  // the plan should spend its days, so the plan is rebuilt when it does.
  const parts = units
    .map((u) => `${u.section_id}:${u.band}:${u.priority}`)
    .sort()
    .join(",");
  return `${examDate}|${parts}`;
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
  units: PlanUnit[]
): StudyPlan {
  const today = parseDay(todayISO);
  const exam = parseDay(examDateISO);
  const daysRemaining = diffDays(today, exam);

  const meta = {
    exam_date: examDateISO,
    generated_on: todayISO,
    days_remaining: daysRemaining,
    snapshot: planSnapshot(examDateISO, units),
  };

  // Exam passed or is today, or nothing to plan.
  if (daysRemaining <= 0 || units.length === 0) {
    return {
      meta,
      weeks: [],
      totals: { study_days: 0, review_days: 0, mixed_days: 0, sections: units.length },
    };
  }

  const ordered = unitsWeakFirst(units);

  // Weighted rotation: pass 1 covers everything (weak-first), pass 2 repeats
  // weak+developing, pass 3 repeats weak — so weak appears 3×, developing 2×,
  // secure 1×, and full coverage lands first.
  //
  // Two further passes over the core syllabus, and one over the
  // supporting literature, put the days where the exam is: background
  // material still appears, because pass 1 covers everything, but it
  // comes round once for every four visits to a core topic.
  const rotation: PlanUnit[] = [
    ...ordered,
    ...ordered.filter((u) => u.band !== "secure"),
    ...ordered.filter((u) => u.band === "weak"),
    ...ordered.filter((u) => u.priority === 1),
    ...ordered.filter((u) => u.priority === 1),
    ...ordered.filter((u) => u.priority === 2),
  ];

  const secureOrDeveloping = ordered.filter((u) => u.band !== "weak");

  // Walk each future day.
  const days: PlanDay[] = [];
  let studyDayCount = 0;
  let rot = 0;

  // Sections per study day, enough to cover the syllabus within the study window.
  const studyWindow = Math.max(1, daysRemaining - FINAL_FORTNIGHT);
  const perDay = Math.min(4, Math.max(2, Math.ceil(units.length / studyWindow)));

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
      days.push({ date, kind: "mixed", items: window });
      continue;
    }

    // Every ~7th study day → spaced revisit of secured (else developing) topics.
    if (studyDayCount > 0 && studyDayCount % REVIEW_EVERY === 0 && secureOrDeveloping.length > 0) {
      days.push({
        date,
        kind: "review",
        items: secureOrDeveloping.slice(0, Math.min(4, secureOrDeveloping.length)).map((u) => itemFor(u, 4)),
      });
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
    days.push({ date, kind: "study", items });
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
    sections: units.length,
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
  const weights = units.map((u) => ({
    section_id: u.section_id,
    weight:
      (u.accuracy < 70 ? Math.max(70 - u.accuracy, 1) : SPACED) *
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
