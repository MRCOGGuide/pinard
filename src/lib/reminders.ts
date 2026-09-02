/**
 * Daily reminders and milestones (PROJECT.md items 9 and 10).
 *
 * Pure functions only — no IO — so the tone bands, the "is this person
 * due?" test and the milestone rules can be reasoned about on their own.
 * The cron route does the fetching and sending.
 */

/** Tone bands from prompt M, by days remaining. */
export type ToneBand = "building" | "momentum" | "confidence" | "consolidating";

export function toneBand(daysRemaining: number): ToneBand {
  if (daysRemaining > 60) return "building";
  if (daysRemaining >= 15) return "momentum";
  if (daysRemaining >= 4) return "confidence";
  return "consolidating";
}

export const TONE_GUIDANCE: Record<ToneBand, string> = {
  building: "steady and habit-building — consistency beats intensity",
  momentum: "purposeful momentum; celebrate secured topics by name",
  confidence:
    "confidence-building; emphasise how much is now secure, keep the session sounding light",
  consolidating:
    "calm and consolidating; short sessions, rest, logistics — they have done the work",
};

/** The calendar day in the candidate's timezone. This audience is UK. */
export const TIMEZONE = "Europe/London";

export function localDate(now: Date, timeZone = TIMEZONE): string {
  // en-CA gives yyyy-mm-dd, which is what the database stores.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function localHour(now: Date, timeZone = TIMEZONE): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(now)
  );
}

/**
 * Is this person due their reminder?
 *
 * Their hour having *passed* counts, not just matching it. The cron may
 * run once a day, may be late, and may miss an hour entirely; someone
 * who asked for 07:00 should still hear from us at 09:00 rather than
 * losing the day. The once-per-day rule is what stops that becoming a
 * second email.
 */
export function isDue(input: {
  reminderHour: number;
  currentHour: number;
  sentToday: boolean;
  enabled: boolean;
}): boolean {
  if (!input.enabled || input.sentToday) return false;
  return input.currentHour >= input.reminderHour;
}

/** Roughly a minute and a quarter a question, rounded to five. */
export function minutesFor(questions: number): number {
  if (questions <= 0) return 0;
  return Math.max(5, Math.round((questions * 1.25) / 5) * 5);
}

export type MilestoneInput = {
  diagnosticDone: boolean;
  securedCount: number;
  totalSections: number;
  streak: number;
  /** Milestone types already celebrated, from notifications_log. */
  alreadySent: Set<string>;
};

export type Milestone = { type: string; description: string };

/**
 * The one milestone worth mentioning in today's reminder, if any.
 *
 * Ordered by how much it earns a mention, and each fires once ever —
 * a streak of 7 is worth saying the day it happens and never again.
 */
export function detectMilestone(input: MilestoneInput): Milestone | null {
  const { alreadySent } = input;
  const unsent = (type: string) => !alreadySent.has(type);

  if (input.diagnosticDone && unsent("milestone:diagnostic")) {
    return {
      type: "milestone:diagnostic",
      description: "they have completed the diagnostic and their plan is live",
    };
  }

  if (input.securedCount >= 1 && unsent("milestone:first-topic")) {
    return {
      type: "milestone:first-topic",
      description: "their first topic is now secure, at or above 70%",
    };
  }

  if (
    input.totalSections > 0 &&
    input.securedCount / input.totalSections >= 0.5 &&
    unsent("milestone:half-syllabus")
  ) {
    return {
      type: "milestone:half-syllabus",
      description: `half the syllabus is secure — ${input.securedCount} of ${input.totalSections} topics`,
    };
  }

  for (const days of [30, 14, 7, 3]) {
    const type = `milestone:streak-${days}`;
    if (input.streak >= days && unsent(type)) {
      return {
        type,
        description: `they have revised ${days} days running`,
      };
    }
  }

  return null;
}

export type ReminderFacts = {
  name: string;
  examLabel: string;
  daysRemaining: number;
  topics: string[];
  questionTarget: number;
  streak: number;
  milestone: Milestone | null;
};

/**
 * Deterministic copy, used when the model is unavailable. Same rules as
 * prompt M — UK English, no clinical content, no guilt — so a failed
 * API call still sends something a candidate would recognise as Pinard.
 */
export function fallbackCopy(facts: ReminderFacts): {
  push: string;
  email: string;
} {
  const minutes = minutesFor(facts.questionTarget);
  const topicList =
    facts.topics.length > 0 ? facts.topics.slice(0, 2).join(" and ") : null;

  const push = topicList
    ? `${facts.daysRemaining} days to ${facts.examLabel}. Today: ${topicList} — ${facts.questionTarget} questions, about ${minutes} minutes.`
    : `${facts.daysRemaining} days to ${facts.examLabel}. A short session today keeps the plan on track.`;

  const opening = topicList
    ? `Today's session is ${topicList} — ${facts.questionTarget} questions, about ${minutes} minutes.`
    : `There is no session scheduled today, so practise off-plan if you have a spare fifteen minutes.`;

  const streakLine =
    facts.streak >= 3 ? ` You are ${facts.streak} days running.` : "";

  const close =
    facts.daysRemaining <= 3
      ? "Keep it short and rest well — you have done the work."
      : facts.daysRemaining <= 14
        ? "Steady sessions from here; most of the ground is already covered."
        : "Consistency beats intensity.";

  return {
    push: push.slice(0, 140),
    email: `${opening}${streakLine} ${close}`,
  };
}
