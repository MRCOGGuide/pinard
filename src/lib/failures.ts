/**
 * What a logged failure actually was, and how many times.
 *
 * Everything that goes wrong is written to one table and the review
 * screen listed the fifty most recent under one heading: "Questions the
 * generator could not verify against its sources". That heading was
 * true of about one row in a hundred.
 *
 * When Ask Pinard started timing out, both attempts were logged
 * faithfully and neither was findable: 390 copies of "this organization
 * has been disabled" stood between the owner and them, all filed as
 * verification failures, none of which they were. The owner went
 * looking for a CMV guideline instead, because the app had told them
 * the source material was the problem.
 *
 * So: group identical faults instead of listing them, and say which
 * kind each is. A service that is down needs one line, not four
 * hundred.
 */

export type FailureKind =
  /** Something outside the question is broken: the model is
   *  unreachable, the vector search timed out. Candidates are hitting
   *  this now, and no amount of reviewing questions will help. */
  | "service"
  /** The generator could not ground a question in its sources. This is
   *  the list's original purpose and the one that wants judgement. */
  | "verification"
  /** Logged, but not recognised. Shown rather than hidden — an
   *  unclassified fault is still a fault. */
  | "other";

/**
 * Classified from the reason text, which this codebase writes itself.
 * A column would be sturdier, but every row already in the table
 * predates it and those are exactly the rows worth reading.
 */
export function failureKind(reason: string): FailureKind {
  const r = reason.toLowerCase();
  if (
    r.includes("api error") ||
    r.includes("model call failed") ||
    r.includes("retrieval failed") ||
    r.includes("timeout") ||
    r.includes("econnreset") ||
    r.includes("fetch failed")
  ) {
    return "service";
  }
  if (
    r.includes("verification failed") ||
    r.includes("grounding") ||
    r.includes("not in the passages") ||
    r.includes("no source passages") ||
    r.includes("returned no passages") ||
    r.includes("stem's subject") ||
    r.includes("parse error")
  ) {
    return "verification";
  }
  return "other";
}

/**
 * What makes two failures the same failure.
 *
 * Request ids, timings and row ids differ on every occurrence of one
 * fault, so they are flattened out. What survives is the shape of the
 * complaint, which is what a reader needs to see once.
 */
export function failureSignature(reason: string): string {
  return reason
    .replace(/"request_id":"[^"]*"/g, '"request_id":"…"')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "…")
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** A readable first line for a group, without the JSON a log carries. */
export function failureHeadline(reason: string): string {
  const detail = reason.match(/"message":"([^"]+)"/);
  if (detail) return detail[1];
  return reason.replace(/\s+/g, " ").slice(0, 160);
}

export type FailureRecord = {
  id: number;
  reason: string;
  format: string | null;
  created_at: string;
  sections: { title: string } | null;
};

export type FailureGroup = {
  signature: string;
  kind: FailureKind;
  headline: string;
  /** Every row in the group, so resolving one resolves all of them. */
  ids: number[];
  count: number;
  latest: string;
  /** Where it came from, when the rows agree on that. */
  sections: string[];
};

/** Newest first within a kind, because a fault that stopped mattering
 *  is one you scroll past rather than one you act on. */
export function groupFailures(rows: FailureRecord[]): FailureGroup[] {
  const groups = new Map<string, FailureGroup>();
  for (const row of rows) {
    const signature = failureSignature(row.reason ?? "");
    let group = groups.get(signature);
    if (!group) {
      group = {
        signature,
        kind: failureKind(row.reason ?? ""),
        headline: failureHeadline(row.reason ?? ""),
        ids: [],
        count: 0,
        latest: row.created_at,
        sections: [],
      };
      groups.set(signature, group);
    }
    group.ids.push(row.id);
    group.count += 1;
    if (row.created_at > group.latest) group.latest = row.created_at;
    const title = row.sections?.title;
    if (title && !group.sections.includes(title)) group.sections.push(title);
  }

  const order: Record<FailureKind, number> = {
    service: 0,
    verification: 1,
    other: 2,
  };
  return Array.from(groups.values()).sort(
    (a, b) => order[a.kind] - order[b.kind] || b.latest.localeCompare(a.latest)
  );
}
