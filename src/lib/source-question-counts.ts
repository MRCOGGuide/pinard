/**
 * How many questions each source has (owner, 5 November 2026), to show
 * in Admin > Sources where more could be generated.
 *
 * An EMQ is stored as one row per scenario, so a set is counted once, by
 * its group. A question that rests on two documents counts for both.
 * Rejected questions count for nothing.
 */
export type QuestionCounts = {
  /** Approved SBAs and approved EMQ sets. */
  sba: number;
  emq: number;
  /** SBAs and EMQ sets still in the review queue. */
  waiting: number;
};

type QuestionRow = {
  id: number;
  format: string;
  status: string;
  emq_group_id: string | number | null;
  source_document_ids: number[] | null;
};

export function questionCountsByDocument(rows: QuestionRow[]): Record<number, QuestionCounts> {
  const counts: Record<number, QuestionCounts> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.status !== "approved" && row.status !== "pending") continue;
    const unit = row.format === "emq" ? `set ${row.emq_group_id ?? row.id}` : `question ${row.id}`;
    for (const id of new Set(row.source_document_ids ?? [])) {
      const key = `${id} ${row.status} ${unit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts[id] ??= { sba: 0, emq: 0, waiting: 0 };
      if (row.status === "pending") counts[id].waiting += 1;
      else if (row.format === "emq") counts[id].emq += 1;
      else counts[id].sba += 1;
    }
  }
  return counts;
}

/** All of a source's questions, for putting the sources in order. */
export function questionTotal(counts: QuestionCounts | undefined): number {
  return counts ? counts.sba + counts.emq + counts.waiting : 0;
}
