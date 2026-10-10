/**
 * The mock paper: shaped, timed and marked like the real one.
 *
 * MRCOG Part 2 is two papers of three hours, each 50 SBAs and 50 EMQs.
 *
 * An EMQ is ONE QUESTION: one scenario, answered from an option list it
 * shares with the other scenarios of its set. The RCOG numbers the EMQ
 * answers 1 to 50 and groups them under option lists of one to five
 * (rcog.org.uk, "EMQs (extended matching questions)"), so fifty EMQs is
 * fifty scenarios, in however many sets that takes. This file counted
 * sets for a while (5 October 2026), which put about 150 scenarios into
 * the 110 minutes the RCOG allows for 50; the owner confirmed the RCOG's
 * reading on 10 October 2026. Everything named `emq` here is a count of
 * scenarios. Sets are still taken whole.
 * The RCOG recommends 70 minutes for the SBAs and 110 for the EMQs, and
 * the two formats are not worth the same: SBAs carry 40% of the marks
 * and EMQs 60%.
 *
 * Three consequences, and they are the whole of this file.
 *
 *   1. An EMQ is worth half as much again as an SBA. Marking by raw
 *      count would tell a candidate they had passed when the paper
 *      says otherwise.
 *
 *   2. The clock follows the paper. Rather than fixing three hours and
 *      hoping the bank can fill a hundred questions, the recommendation is
 *      per question — 84 seconds an SBA, 132 an EMQ, which is exactly
 *      the RCOG's 70 and 110 minutes over fifty of each. A paper built
 *      from a thinner bank is shorter and paced identically.
 *
 *   3. The SBA time is a milestone inside the paper, not a barrier.
 *      The RCOG recommends moving on at 70 minutes but leaves time
 *      management to the candidate, so the paper says so when the
 *      moment comes and lets it be ignored.
 *
 * Pure functions — no I/O, no clock of their own.
 */

/** A full paper, when the bank can fill one. */
export const FULL_PAPER = { sba: 50, emq: 50 } as const;

/**
 * Seconds per question, from the RCOG's own recommendation: 70 minutes
 * for the SBAs and 110 for the EMQs, over fifty of each.
 *
 * The EMQ figure is per scenario: a set of three gets three times 132
 * seconds.
 */
export const SECONDS_PER_SBA = (70 * 60) / 50; // 84
export const SECONDS_PER_EMQ = (110 * 60) / 50; // 132 per scenario

/** Share of the total mark each format carries. */
export const SBA_MARK_SHARE = 0.4;
export const EMQ_MARK_SHARE = 0.6;

/** SBA questions, and EMQ questions (scenarios). */
export type PaperShape = { sba: number; emq: number };

/**
 * How long a paper of this shape runs, in seconds.
 *
 * A paper with no EMQs is all SBA time, and vice versa — the shares are
 * per question, so nothing needs special-casing.
 */
export function paperSeconds(shape: PaperShape): number {
  return Math.round(
    shape.sba * SECONDS_PER_SBA + shape.emq * SECONDS_PER_EMQ
  );
}

/**
 * When to suggest moving to the EMQs: the recommended SBA time for this
 * paper's SBA count. Null when there is nothing to move on to.
 */
export function sbaAdviceSeconds(shape: PaperShape): number | null {
  if (shape.emq === 0 || shape.sba === 0) return null;
  return Math.round(shape.sba * SECONDS_PER_SBA);
}

export type MarkedPaper = {
  sbaCorrect: number;
  sbaTotal: number;
  /** EMQ scenarios answered correctly, and EMQ scenarios sat. */
  emqCorrect: number;
  emqTotal: number;
  /** Weighted percentage, 0–100, to one decimal place. */
  percent: number;
  passed: boolean;
  passMark: number;
};

/**
 * Mark a paper the way it is weighted, not the way it is counted.
 *
 * Each format contributes its full share regardless of how many
 * questions carry it, so a shortened paper is marked on the same scale
 * as a full one: 40% of the marks ride on the SBAs whether there are
 * fifty of them or twelve.
 *
 * A paper missing a format entirely gives the whole mark to the one it
 * has, otherwise a bank with no EMQs would cap every candidate at 40%
 * and fail all of them.
 */
export function markPaper(input: {
  sbaCorrect: number;
  sbaTotal: number;
  /** EMQ scenarios answered correctly. */
  emqCorrect: number;
  /** EMQ scenarios sat. */
  emqTotal: number;
  passMark: number;
}): MarkedPaper {
  const { sbaCorrect, sbaTotal, emqCorrect, emqTotal, passMark } = input;

  const sbaShare = sbaTotal > 0 ? (emqTotal > 0 ? SBA_MARK_SHARE : 1) : 0;
  const emqShare = emqTotal > 0 ? (sbaTotal > 0 ? EMQ_MARK_SHARE : 1) : 0;

  const sbaPart = sbaTotal > 0 ? (sbaCorrect / sbaTotal) * sbaShare : 0;
  const emqPart = emqTotal > 0 ? (emqCorrect / emqTotal) * emqShare : 0;

  const percent = Math.round((sbaPart + emqPart) * 1000) / 10;

  return {
    sbaCorrect,
    sbaTotal,
    /* Rounded for display and for the one integer column it is stored
       in. The percentage above is computed from the exact figure, so
       the mark never moves because of how the tally is printed. */
    emqCorrect: Math.round(emqCorrect * 10) / 10,
    emqTotal,
    percent,
    passed: percent >= passMark,
    passMark,
  };
}

/** "1:47:05" while it matters, "09:59" once it does not. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Which EMQ sets make up a paper: whole sets, in the order given (the
 * caller's shuffle, so papers vary), until their scenarios add up to
 * `want`. A set that would overshoot, or leave a gap of one that no set
 * could fill, is passed over for a later one; so with sets of two to
 * five scenarios the paper lands exactly on fifty.
 */
export function packEmqSets<T>(sets: T[][], want: number): T[][] {
  const picked: T[][] = [];
  let left = want;
  for (const set of sets) {
    if (left <= 0) break;
    const n = set.length;
    if (n === 0 || n > left) continue;
    // Leaving exactly one is a dead end unless a one-scenario set exists.
    if (left - n === 1 && !sets.some((s) => s.length === 1 && !picked.includes(s) && s !== set)) continue;
    picked.push(set);
    left -= n;
  }
  return picked;
}

/**
 * How a candidate did in each topic, in the paper they just sat.
 *
 * Their performance in THIS paper, not their rolling topic map. A
 * mock is a sample of the whole syllabus taken in one sitting under
 * the clock, which is a different thing from an average built up over
 * weeks of practice, and the question it answers is the one asked at
 * the end of a mock: given how that went, what do I revise.
 *
 * Unanswered counts as wrong, which is what the real paper does with
 * it, so the denominator is every question in the topic that appeared.
 * Worst first, because that is the order someone with four evenings
 * left needs them in, and ties break on the larger topic, where the
 * same percentage rests on more evidence.
 */
export type SectionScore = {
  section_id: number;
  title: string;
  correct: number;
  total: number;
  percent: number;
};

export function sectionBreakdown(
  questions: { section_id: number; section_title: string; id: number }[],
  correctIds: Set<number>
): SectionScore[] {
  const by = new Map<number, { title: string; correct: number; total: number }>();
  for (const q of questions) {
    const row = by.get(q.section_id) ?? {
      title: q.section_title,
      correct: 0,
      total: 0,
    };
    row.total += 1;
    if (correctIds.has(q.id)) row.correct += 1;
    by.set(q.section_id, row);
  }

  const rows: SectionScore[] = [];
  by.forEach((row, section_id) => {
    rows.push({
      section_id,
      title: row.title,
      correct: row.correct,
      total: row.total,
      percent: Math.round((row.correct / row.total) * 100),
    });
  });

  return rows.sort((a, b) => a.percent - b.percent || b.total - a.total);
}
