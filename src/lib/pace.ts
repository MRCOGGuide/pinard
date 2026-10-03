import { PASS_THRESHOLD } from "@/lib/performance";

/**
 * "Am I on track?", answered in a line.
 *
 * Readiness says where a candidate stands; the countdown says how long
 * is left. Neither answers the question they are actually asking, which
 * joins the two: at this many topics still to secure and this many days
 * left, what has to happen per week for the exam to go well.
 *
 * Nothing here models a learning curve or predicts a result. It is
 * division, stated plainly, because the useful thing is the rate and
 * the useful tone is flat: a candidate with eleven topics and twelve
 * days does not need to be told they are "behind", they need to see
 * one topic a day and decide what that means for them.
 */

export type Pace = {
  toSecure: number;
  daysRemaining: number;
  /** Days available per remaining topic, one decimal. Null if nothing left. */
  daysEach: number | null;
  /** How it reads: comfortable, tight, or past the point of arithmetic. */
  standing: "done" | "comfortable" | "tight" | "very tight" | "no date";
  sentence: string;
};

export function pace(input: {
  secured: number;
  total: number;
  daysRemaining: number | null;
}): Pace {
  const { secured, total } = input;
  const toSecure = Math.max(0, total - secured);
  const daysRemaining = input.daysRemaining ?? 0;

  if (total === 0 || input.daysRemaining === null) {
    return {
      toSecure,
      daysRemaining,
      daysEach: null,
      standing: "no date",
      sentence: "Set your exam date and this becomes a plan.",
    };
  }

  if (toSecure === 0) {
    return {
      toSecure: 0,
      daysRemaining,
      daysEach: null,
      standing: "done",
      sentence: `Every topic is at ${PASS_THRESHOLD}% or above. From here it is keeping them there.`,
    };
  }

  if (daysRemaining <= 0) {
    return {
      toSecure,
      daysRemaining,
      daysEach: null,
      standing: "very tight",
      sentence: `${toSecure} topic${toSecure === 1 ? "" : "s"} still below ${PASS_THRESHOLD}%, and the date has passed.`,
    };
  }

  const daysEach = Math.round((daysRemaining / toSecure) * 10) / 10;
  const standing =
    daysEach >= 4 ? "comfortable" : daysEach >= 1.5 ? "tight" : "very tight";

  const rate =
    daysEach >= 1
      ? `about ${daysEach === Math.round(daysEach) ? daysEach : daysEach.toFixed(1)} day${daysEach === 1 ? "" : "s"} for each`
      : `more than one a day`;

  return {
    toSecure,
    daysRemaining,
    daysEach,
    standing,
    sentence: `${toSecure} topic${toSecure === 1 ? "" : "s"} to bring up to ${PASS_THRESHOLD}%, ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left: ${rate}.`,
  };
}

/**
 * What a candidate is working towards next, and how far it is.
 *
 * The milestones already exist, and they are only ever said in an
 * email the morning after. A target in front of someone is worth more
 * than a congratulation behind them.
 */
export function nextMilestone(input: {
  secured: number;
  total: number;
  streak: number;
}): { label: string; remaining: number } | null {
  const { secured, total, streak } = input;

  if (total > 0 && secured === 0) {
    return { label: `your first topic at ${PASS_THRESHOLD}%`, remaining: 1 };
  }
  const half = Math.ceil(total / 2);
  if (total > 0 && secured < half) {
    return { label: "half the syllabus secure", remaining: half - secured };
  }
  if (total > 0 && secured < total) {
    return { label: "every topic secure", remaining: total - secured };
  }
  for (const days of [3, 7, 14, 30]) {
    if (streak < days) {
      return { label: `${days} days running`, remaining: days - streak };
    }
  }
  return null;
}

/**
 * How a milestone reads on a screen rather than in an email.
 *
 * The reminder describes one to the model that writes the morning
 * email ("they have revised 7 days running"); a card says it to the
 * candidate. Same events, different voice, so the wording lives here
 * rather than being reused from the prompt.
 */
export function milestoneLabel(type: string): string | null {
  if (type === "milestone:diagnostic") return "Diagnostic done, plan live";
  if (type === "milestone:first-topic") return `First topic at ${PASS_THRESHOLD}%`;
  if (type === "milestone:half-syllabus") return "Half the syllabus secure";
  const streak = /^milestone:streak-(\d+)$/.exec(type);
  if (streak) return `${streak[1]} days running`;
  return null;
}
