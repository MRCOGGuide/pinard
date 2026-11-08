import type { QuestionFormat, QuestionOption } from "@/lib/types";

/**
 * EMQ sets, reassembled for display.
 *
 * A real MRCOG Part 2 EMQ is presented as one unit: a lead-in naming the
 * theme, then a shared option list of roughly 10, then 3-4 scenarios
 * answered from that same list. Storage cannot hold it that way — each
 * scenario is its own row in `generated_questions` so it can carry its
 * own answer, explanations and citations — so the rows share an
 * `emq_group_id` and every screen must put them back together.
 *
 * Rendering a row on its own shows a stem followed by ten options, which
 * is an SBA with a long option list: precisely the format the exam does
 * not use. Every surface that shows EMQs (review queue, bank, session,
 * diagnostic) groups through this module.
 *
 * Pure functions only — no I/O, no React.
 */

export type EmqGroupable = {
  id: number;
  format: QuestionFormat;
  stem: string;
  options: QuestionOption[];
  correct_key: string;
  lead_in: string | null;
  emq_group_id: string | null;
};

/** One reviewable/answerable unit: a lone question, or a whole EMQ set. */
export type QuestionItem<T> =
  | { kind: "single"; key: string; question: T }
  | {
      kind: "emq_set";
      key: string;
      groupId: string;
      leadIn: string;
      /** The shared list. Identical on every row; taken from the first. */
      options: QuestionOption[];
      scenarios: T[];
    };

/** Every question id in an item, in display order. */
export function itemIds<T extends EmqGroupable>(item: QuestionItem<T>): number[] {
  return item.kind === "single"
    ? [item.question.id]
    : item.scenarios.map((s) => s.id);
}

/** How many answerable questions an item holds. */
export function itemSize<T extends EmqGroupable>(item: QuestionItem<T>): number {
  return item.kind === "single" ? 1 : item.scenarios.length;
}

/**
 * The fewest scenarios an EMQ set is ever shown to a candidate with.
 *
 * The owner, 8 November 2026: "No such thing as orphan scenario - No
 * EMQ should be released if not in a set of at least 2 questions." A
 * scenario on its own is an SBA with a long option list, the format the
 * exam does not use. Generation already writes no set smaller than this
 * (EMQ_MIN_SCENARIOS is this number).
 */
export const EMQ_MIN_SET = 2;

/**
 * What a candidate may be shown from a list of rows: every SBA, and an
 * EMQ scenario only where at least EMQ_MIN_SET scenarios of its set are
 * in the same list. A scenario left alone (its siblings rejected, or
 * never fetched) is held back, not shown as a single, and comes back by
 * itself once another scenario of its set is approved. Order is kept.
 *
 * Every candidate screen passes through this (session's attachSources),
 * so no builder has to remember the rule. Admin screens do not: Review
 * and the Bank show everything, a lone scenario included, so it can be
 * seen and dealt with.
 */
export function wholeSetsOnly<T extends Pick<EmqGroupable, "format" | "emq_group_id">>(
  rows: T[]
): T[] {
  const size = new Map<string, number>();
  for (const row of rows) {
    if (row.format !== "emq" || !row.emq_group_id) continue;
    size.set(row.emq_group_id, (size.get(row.emq_group_id) ?? 0) + 1);
  }
  return rows.filter(
    (row) =>
      row.format !== "emq" ||
      (row.emq_group_id !== null && (size.get(row.emq_group_id) ?? 0) >= EMQ_MIN_SET)
  );
}

/**
 * Group rows into display items, preserving the order in which each
 * group is first seen so callers keep control of sequencing.
 *
 * A grouped EMQ row whose siblings are absent (a partial set, one
 * scenario approved while the rest were rejected, say) falls back to a
 * single. Only the admin screens can meet one now: a candidate's list
 * has been through wholeSetsOnly, which holds such a scenario back.
 */
export function groupIntoItems<T extends EmqGroupable>(
  rows: T[]
): QuestionItem<T>[] {
  const setRows = new Map<string, T[]>();
  for (const row of rows) {
    if (row.format !== "emq" || !row.emq_group_id) continue;
    const list = setRows.get(row.emq_group_id);
    if (list) list.push(row);
    else setRows.set(row.emq_group_id, [row]);
  }

  const items: QuestionItem<T>[] = [];
  const emitted = new Set<string>();

  for (const row of rows) {
    const groupId = row.format === "emq" ? row.emq_group_id : null;
    const scenarios = groupId ? setRows.get(groupId) : undefined;

    if (!groupId || !scenarios || scenarios.length < EMQ_MIN_SET) {
      items.push({ kind: "single", key: `q${row.id}`, question: row });
      continue;
    }
    if (emitted.has(groupId)) continue;
    emitted.add(groupId);
    items.push({
      kind: "emq_set",
      key: `set${groupId}`,
      groupId,
      leadIn: scenarios[0].lead_in ?? "",
      options: scenarios[0].options,
      scenarios,
    });
  }

  return items;
}
