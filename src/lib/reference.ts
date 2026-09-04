/**
 * How a source is named to a candidate.
 *
 * A reference without a date is not much use for revision: guidance is
 * reissued, thresholds move, and "RCOG GTG No. 37a" alone gives no way
 * to tell a 2015 edition from its replacement. So every reference the
 * app writes carries its year when the document has one.
 *
 * TOG articles additionally carry the issue. They are cited by issue
 * rather than by a guideline number, and the raw source_reference on a
 * TOG document is a DOI URL, which reads as noise under an answer.
 *
 * Pure formatting — no I/O, so it can be used from server and client.
 */

export type ReferenceParts = {
  /** The document's own reference string, e.g. "RCOG GTG No. 37a". */
  reference: string | null;
  year: number | null;
  /** TOG issue identity; both set together, or both null. */
  togYear?: number | null;
  togIssue?: number | null;
};

/**
 * One line naming a source: "RCOG GTG No. 37a, 2015", or
 * "TOG 2024, Issue 3" for a TOG article. Returns "" when there is
 * nothing to name, so callers can skip the element entirely.
 */
export function formatReference(parts: ReferenceParts): string {
  const { reference, year, togYear, togIssue } = parts;

  // A TOG article is cited by its issue. Its stored reference is a DOI
  // URL, so it is deliberately not repeated here.
  if (togYear && togIssue) return `TOG ${togYear}, Issue ${togIssue}`;

  const ref = reference?.trim() ?? "";
  if (!ref) return year ? String(year) : "";
  // Some references already end in their year ("... 2015"); don't
  // append it twice.
  // \b needs escaping inside a template literal — unescaped it is a
  // backspace character, so the guard never matched and the year was
  // appended even to a reference that already ended in it.
  if (year && !new RegExp(`\\b${year}\\b`).test(ref)) return `${ref}, ${year}`;
  return ref;
}
