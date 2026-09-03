import type { MasteryBand, PlanUnit } from "@/lib/studyPlan";
import type { Section, SectionPriority } from "@/lib/types";

/**
 * Mastery bands and syllabus-unit construction shared by the study plan,
 * daily session and progress screen.
 *
 * Bands (PROJECT.md): secure at/above the 70% pass threshold, developing
 * 50–69, weak below 50. Unseen sections count as weak (highest priority).
 */

export const PASS_THRESHOLD = 70;
export const ROLLING_WINDOW = 20; // answers used for rolling accuracy

export function masteryFromAccuracy(accuracy: number): MasteryBand {
  if (accuracy >= PASS_THRESHOLD) return "secure";
  if (accuracy >= 50) return "developing";
  return "weak";
}

export type PerfRow = {
  section_id: number;
  rolling_accuracy: number;
  attempts: number;
  mastery: MasteryBand;
  last_practised_at: string | null;
};

/** Leaf sections (sub-topics, or top-level when childless) are the units. */
export function leafSections(sections: Section[]): Section[] {
  const parentIds = new Set(
    sections.map((s) => s.parent_id).filter((id): id is number => id !== null)
  );
  return sections.filter((s) => s.is_active && !parentIds.has(s.id));
}

export function buildPlanUnits(
  sections: Section[],
  perf: PerfRow[]
): PlanUnit[] {
  const perfBySection = new Map(perf.map((p) => [p.section_id, p]));
  return leafSections(sections).map((s) => {
    const row = perfBySection.get(s.id);
    const accuracy = row ? Number(row.rolling_accuracy) : 0;
    return {
      section_id: s.id,
      title: s.title,
      accuracy,
      band: row ? row.mastery : "weak",
      priority: (s.priority ?? 2) as SectionPriority,
    };
  });
}

/** Recompute rolling accuracy + band from a section's recent answers. */
export function rollingPerformance(recentIsCorrect: boolean[]): {
  rolling_accuracy: number;
  mastery: MasteryBand;
} {
  const window = recentIsCorrect.slice(-ROLLING_WINDOW);
  if (window.length === 0) return { rolling_accuracy: 0, mastery: "weak" };
  const correct = window.filter(Boolean).length;
  const accuracy = Math.round((correct / window.length) * 100);
  return { rolling_accuracy: accuracy, mastery: masteryFromAccuracy(accuracy) };
}

/** Streak = consecutive days up to today with at least one answer. */
export function currentStreak(answerDates: string[], todayISO: string): number {
  const days = new Set(answerDates.map((d) => d.slice(0, 10)));
  let streak = 0;
  const cursor = new Date(`${todayISO}T00:00:00Z`);
  // Allow the streak to count from today or yesterday (today may be unstarted).
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!days.has(cursor.toISOString().slice(0, 10))) return 0;
  }
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** Overall readiness: mean rolling accuracy across all syllabus units. */
export function readiness(units: PlanUnit[]): {
  percent: number;
  secured: number;
  total: number;
} {
  if (units.length === 0) return { percent: 0, secured: 0, total: 0 };
  const mean =
    units.reduce((s, u) => s + u.accuracy, 0) / units.length;
  const secured = units.filter((u) => u.accuracy >= PASS_THRESHOLD).length;
  return { percent: Math.round(mean), secured, total: units.length };
}
