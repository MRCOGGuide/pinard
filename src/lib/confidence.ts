/**
 * What a candidate tells Pinard about themselves at the start (owner,
 * 16 November 2026): how confident they feel in each topic, and how much
 * time they have each week. The plan follows the first until their answers
 * speak for themselves, and the second sets how many questions a day it
 * asks of them. Stored by phase55-confidence.sql.
 *
 * No server-only import: the survey's form reads these labels too.
 */

export type Confidence = "confident" | "unsure" | "not_confident";

export const CONFIDENCE_ORDER: Confidence[] = ["not_confident", "unsure", "confident"];

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  not_confident: "Not confident",
  unsure: "Unsure",
  confident: "Confident",
};

export function isConfidence(value: unknown): value is Confidence {
  return value === "confident" || value === "unsure" || value === "not_confident";
}

/**
 * A rating stands in for a score until there are answers: what the plan
 * and the session read as the topic's accuracy while the candidate has
 * answered fewer than RATING_GIVES_WAY questions in it. Not confident is
 * treated as most in need, confident as at the pass mark, to be checked.
 */
export const RATING_PRIOR: Record<Confidence, number> = {
  not_confident: 0,
  unsure: 45,
  confident: 70,
};

/**
 * Answers needed before a weak showing overrides a rating. Five answers
 * (SURE_ATTEMPTS) always override; three that are mostly wrong are
 * already enough to say a "confident" was mistaken.
 */
export const RATING_GIVES_WAY = 3;

/** The weekly time a candidate can choose, and the questions a day each stands for. */
export const WEEKLY_HOURS: { hours: number; label: string; daily: number }[] = [
  { hours: 2, label: "Up to 3 hours", daily: 10 },
  { hours: 4, label: "3 to 5 hours", daily: 15 },
  { hours: 6, label: "5 to 8 hours", daily: 20 },
  { hours: 10, label: "8 to 12 hours", daily: 30 },
  { hours: 14, label: "More than 12 hours", daily: 40 },
];

/** Questions a day for a candidate who has not said: the session size before this. */
export const DEFAULT_DAILY = 10;

export function isWeeklyHours(value: unknown): value is number {
  return typeof value === "number" && WEEKLY_HOURS.some((w) => w.hours === value);
}

/**
 * Questions a day for the hours a week they gave. About 25 questions an
 * hour with the explanations read, spread over seven days, kept on the
 * low side to leave time for reading the guidance itself, and never
 * fewer than the ten a day the plan asked before.
 */
export function dailyQuestionsFor(hours: number | null | undefined): number {
  if (!hours || hours <= 0) return DEFAULT_DAILY;
  const exact = WEEKLY_HOURS.find((w) => w.hours === hours);
  if (exact) return exact.daily;
  const nearest = [...WEEKLY_HOURS].sort((a, b) => Math.abs(a.hours - hours) - Math.abs(b.hours - hours))[0];
  return nearest.daily;
}
