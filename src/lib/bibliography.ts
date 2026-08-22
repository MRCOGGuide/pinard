/**
 * Reference lists, and why they are kept out of the retrieval pool.
 *
 * Roughly a fifth of ingested chunks are the back matter of a
 * guideline: numbered citations, author contribution statements, URL
 * lists. They are correctly ingested — they are part of the document —
 * but they can never ground a question, because they state no clinical
 * fact. Drawn into a generation batch they waste the draw, and enough
 * of them in one batch makes the model report the section as having
 * insufficient source material when the guidance itself is perfectly
 * substantial.
 *
 * Detection is by citation apparatus per 1000 characters rather than by
 * any single marker, since guideline prose legitimately cites as it
 * goes. The threshold is set high on purpose: dropping a page of
 * references costs nothing, while dropping a page of recommendations
 * loses examinable content the owner paid to ingest. Chunks that mix a
 * page footer with real content — a charity number above a paragraph on
 * Number Needed to Harm — sit around 8 and are deliberately kept.
 */

/** Citation markers per 1000 characters above which a chunk is back matter. */
const DENSITY_THRESHOLD = 10;

/** Below this many markers the text is too short to judge. */
const MIN_MARKERS = 4;

export function citationDensity(text: string): number {
  const etAl = (text.match(/\bet al\b/gi) || []).length;
  // "12. Author A, ..." — a numbered reference entry.
  const numbered = (text.match(/(?:^|\s)\d{1,3}\.\s+[A-Z]/g) || []).length;
  // "(2019)" or "2019;34:19" — journal-style dating.
  const yearCite = (text.match(/\((?:19|20)\d\d\)|\b(?:19|20)\d\d;\s*\d/g) || [])
    .length;
  const links = (text.match(/\bdoi\b|https?:\/\/|www\./gi) || []).length;
  // "34:19–24" — volume and page range.
  const volumePages = (text.match(/\d+\s*[:(]\s*\d+\s*[-–]\s*\d+/g) || []).length;
  // "Tabor A," — surname followed by initials. Halved: ordinary prose
  // throws a few of these from sentence-initial capitals.
  const authors = (text.match(/[A-Z][a-z]+\s+[A-Z]{1,3}(?:,|\s|\.)/g) || [])
    .length;

  const total =
    etAl + numbered + yearCite + links + volumePages + Math.floor(authors / 2);
  if (total < MIN_MARKERS) return 0;
  return total / Math.max(1, text.length / 1000);
}

/** Is this chunk a reference list or other citation back matter? */
export function isReferenceList(text: string | null | undefined): boolean {
  if (!text) return false;
  return citationDensity(text) >= DENSITY_THRESHOLD;
}

/**
 * Drop reference lists from a retrieval pool, but never starve it.
 *
 * A section whose ingested text really is mostly back matter should
 * still be attempted with what it has: a thin batch that the model
 * declines is a better outcome than a batch of nothing, which reads as
 * a broken generator rather than a thin section.
 */
export function withoutReferenceLists<T extends { text: string }>(
  chunks: T[],
  floor: number
): T[] {
  const kept = chunks.filter((c) => !isReferenceList(c.text));
  return kept.length >= floor ? kept : chunks;
}
