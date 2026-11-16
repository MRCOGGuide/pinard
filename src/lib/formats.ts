/**
 * SBA and EMQ kept apart (Phase C proposal 5, approved by the owner on
 * 16 November 2026).
 *
 * The paper sets both, and they are different skills: an SBA asks for
 * the one best answer to one scenario, an EMQ for the right option from
 * a long list across several. A candidate can be sound on one and weak
 * on the other, and one score for both hid it: they were neither told
 * nor given more of the weaker kind.
 *
 * Scored on first answers only, as topics are. Each EMQ scenario is an
 * answer of its own. Pure functions.
 */

import { firstAttempts, type Attempt } from "@/lib/review";
import type { QuestionFormat } from "@/lib/types";

/** First answers of each kind before a difference between them is believed. */
export const FORMAT_MIN_ANSWERS = 20;

/** Points between the two before one is called the weaker. */
export const FORMAT_GAP = 10;

/** The weaker kind's share of a session's questions, when there is one. */
export const WEAKER_SHARE = 2 / 3;

export type FormatRecord = { answered: number; correct: number };
export type FormatStanding = Record<QuestionFormat, FormatRecord>;

export function formatStanding(attempts: Attempt[]): FormatStanding {
  const out: FormatStanding = { sba: { answered: 0, correct: 0 }, emq: { answered: 0, correct: 0 } };
  for (const a of firstAttempts(attempts)) {
    if (a.format !== "sba" && a.format !== "emq") continue;
    out[a.format].answered += 1;
    if (a.is_correct) out[a.format].correct += 1;
  }
  return out;
}

export function formatPercent(r: FormatRecord): number | null {
  return r.answered > 0 ? Math.round((r.correct / r.answered) * 100) : null;
}

/** The weaker kind, once both have enough answers and the gap is real; otherwise null. */
export function weakerFormat(s: FormatStanding): QuestionFormat | null {
  if (s.sba.answered < FORMAT_MIN_ANSWERS || s.emq.answered < FORMAT_MIN_ANSWERS) return null;
  const sba = (s.sba.correct / s.sba.answered) * 100;
  const emq = (s.emq.correct / s.emq.answered) * 100;
  if (Math.abs(sba - emq) < FORMAT_GAP) return null;
  return sba < emq ? "sba" : "emq";
}

/**
 * A session's questions, in the order given, tilted so the weaker kind
 * makes up about WEAKER_SHARE of them. An EMQ set moves as one, so the
 * share is kept set by set, as near as whole sets allow. With no weaker
 * kind the order is unchanged.
 */
export function tiltToward<T extends { format: QuestionFormat; emq_group_id: string | null }>(
  rows: T[],
  weaker: QuestionFormat | null
): T[] {
  if (!weaker) return rows;
  const units: T[][] = [];
  const setAt = new Map<string, number>();
  for (const r of rows) {
    if (r.emq_group_id) {
      const at = setAt.get(r.emq_group_id);
      if (at !== undefined) {
        units[at].push(r);
        continue;
      }
      setAt.set(r.emq_group_id, units.length);
    }
    units.push([r]);
  }
  const mine = units.filter((u) => u[0].format === weaker);
  const other = units.filter((u) => u[0].format !== weaker);
  const out: T[] = [];
  let weak = 0;
  let rest = 0;
  while (mine.length || other.length) {
    const wantWeak = weak <= WEAKER_SHARE * (weak + rest);
    const next = (wantWeak && mine.length) || !other.length ? mine.shift()! : other.shift()!;
    if (next[0].format === weaker) weak += next.length;
    else rest += next.length;
    out.push(...next);
  }
  return out;
}
