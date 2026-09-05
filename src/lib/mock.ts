/**
 * The mock paper: shaped, timed and marked like the real one.
 *
 * MRCOG Part 2 is two papers of three hours, each 50 SBAs and 50 EMQs.
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

/** Seconds per question, from the RCOG's own recommendation. */
export const SECONDS_PER_SBA = (70 * 60) / 50; // 84
export const SECONDS_PER_EMQ = (110 * 60) / 50; // 132

/** Share of the total mark each format carries. */
export const SBA_MARK_SHARE = 0.4;
export const EMQ_MARK_SHARE = 0.6;

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
 * has — otherwise a bank with no EMQs would cap every candidate at 40%
 * and fail all of them.
 */
export function markPaper(input: {
  sbaCorrect: number;
  sbaTotal: number;
  emqCorrect: number;
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
    emqCorrect,
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
