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

/**
 * `covered` names the sections the bank can actually serve questions
 * for. Pass it wherever the units drive a candidate's plan or topic
 * map; omit it where the question is what the syllabus looks like
 * regardless of what has been written yet (the coverage planner).
 */
export function buildPlanUnits(
  sections: Section[],
  perf: PerfRow[],
  covered?: Set<number>
): PlanUnit[] {
  const perfBySection = new Map(perf.map((p) => [p.section_id, p]));
  return leafSections(sections).map((s) => {
    const row = perfBySection.get(s.id);
    const accuracy = row ? Number(row.rolling_accuracy) : 0;
    return {
      section_id: s.id,
      title: s.title,
      accuracy,
      attempts: row ? Number(row.attempts) : 0,
      band: row ? row.mastery : "weak",
      priority: (s.priority ?? 2) as SectionPriority,
      ...(covered ? { covered: covered.has(s.id) } : {}),
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

/**
 * How many answers in a topic before its score is worth believing.
 *
 * One correct answer is 100% accuracy, and a readiness figure that
 * takes it at face value tells a candidate a topic is secure on the
 * strength of a single lucky guess. Five is the point at which the
 * rolling figure stops swinging on one answer; a topic holding fewer
 * than five questions is believed once all of them are answered,
 * because there is nothing further to ask.
 */
export const SURE_ATTEMPTS = 5;

/** Below this readiness reads red, below GREEN_BAND amber, then green. */
export const AMBER_BAND = 40;
export const GREEN_BAND = PASS_THRESHOLD;

export type ReadinessBand = "red" | "amber" | "green";

export type Readiness = {
  /** 0 to 100. 100 means every topic practised and every question right. */
  percent: number;
  band: ReadinessBand;
  /** Topics at or above the pass threshold, believed. */
  secured: number;
  /** Topics with at least one answer. */
  touched: number;
  /** Topics the bank can serve, which is the denominator. */
  total: number;
};

export function readinessBand(percent: number): ReadinessBand {
  if (percent >= GREEN_BAND) return "green";
  if (percent >= AMBER_BAND) return "amber";
  return "red";
}

/**
 * Overall readiness, as one number out of a hundred.
 *
 * Two things have to be in it, and the earlier version only had one.
 * It averaged rolling accuracy across the practisable syllabus, so a
 * candidate who had answered two topics well and never opened the
 * other thirty-three was being scored on the two. Accuracy alone says
 * how well someone does the questions they choose; readiness has to
 * say whether they are ready for a paper drawn from the whole
 * syllabus, so breadth counts.
 *
 * Each topic therefore earns a fraction of one mark:
 *
 *   accuracy      the rolling figure itself, with no ceiling. Answer
 *                 everything in every topic correctly and this reads
 *                 100, because a candidate who has done that has
 *                 earned the number.
 *   confidence    scaled by answers up to SURE_ATTEMPTS, so a topic
 *                 answered once cannot count as mastered.
 *
 * Readiness is the mean of those marks. A topic never opened scores
 * zero and pulls the mean down, which is the arithmetic saying the
 * true thing: an unopened topic is not readiness, it is risk.
 *
 * Seventy is the line, not the ceiling. The exam needs 70%, so the
 * score turns green there and `secured` counts the topics at or above
 * it, but the number itself keeps climbing: being ready and being
 * finished are different, and a score that stopped rewarding work at
 * the pass mark would tell a candidate their last three weeks were
 * worth nothing.
 *
 * The denominator is the topics the bank can actually serve. Sections
 * with no questions written yet are left out rather than counted as
 * zeroes: a candidate cannot practise what does not exist, and
 * counting it would make everyone's readiness fall on the day the
 * syllabus grew.
 *
 * `available` is the number of approved questions per section, used
 * only to forgive the confidence floor in sections holding fewer
 * questions than it asks for. Omit it and the floor applies flatly.
 */
export function readiness(
  units: PlanUnit[],
  available?: Map<number, number>
): Readiness {
  const scored = units.filter((u) => u.covered !== false);
  if (scored.length === 0) {
    return { percent: 0, band: "red", secured: 0, touched: 0, total: 0 };
  }

  const confidenceOf = (u: PlanUnit) => {
    const held = available?.get(u.section_id);
    const needed = Math.max(1, Math.min(SURE_ATTEMPTS, held ?? SURE_ATTEMPTS));
    return Math.min(1, (u.attempts ?? 0) / needed);
  };

  const marks = scored.map((u) => (u.accuracy / 100) * confidenceOf(u));

  const percent = Math.round(
    (marks.reduce((s, m) => s + m, 0) / scored.length) * 100
  );

  return {
    percent,
    band: readinessBand(percent),
    secured: scored.filter(
      (u) => u.accuracy >= PASS_THRESHOLD && confidenceOf(u) === 1
    ).length,
    touched: scored.filter((u) => (u.attempts ?? 0) > 0).length,
    total: scored.length,
  };
}
