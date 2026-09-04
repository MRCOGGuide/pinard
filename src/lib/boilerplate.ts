/**
 * Page furniture, and why it has to go before chunking.
 *
 * A guideline PDF carries the same running header on every page, a
 * publisher's terms-of-use line down the margin, a licence notice, and
 * a page number. Extraction lifts all of it into the text, where it
 * lands mid-sentence and is then chunked, embedded and cited like
 * anything else.
 *
 * It is not harmless. One approved question was grounded on a chunk
 * whose entire content was a Wiley terms-and-conditions line and an
 * appendix title — so the grounding check, which asks only whether a
 * question's citation supports it, had nothing to contradict and passed
 * a question whose marked answer was the opposite of the guideline's.
 * Another produced a 900-character "sentence" with page furniture run
 * through it, which overran the checker's token limit.
 *
 * Two passes, because the two kinds of rubbish are found differently:
 *
 *   1. Anything repeating across pages is furniture by definition. No
 *      pattern list needed and no guideline-specific tuning: a running
 *      header is a line that appears on page after page, and a sentence
 *      of clinical guidance is not.
 *
 *   2. Publisher and download boilerplate, which appears once or twice
 *      and so escapes the first pass, but is recognisable by what it
 *      says.
 *
 * Pure functions — no I/O.
 */

/** Lines shorter than this are page numbers and fragments, not prose. */
const SHORT_LINE = 80;

/**
 * A line must appear on at least this share of pages to count as
 * running furniture, and on at least MIN_PAGES pages regardless.
 *
 * Set high because the cost is asymmetric: dropping a header costs
 * nothing, dropping a recommendation loses examinable content the
 * owner paid to ingest. A genuine sentence repeating on a third of a
 * guideline's pages does not happen.
 */
const REPEAT_SHARE = 0.34;
const MIN_PAGES = 3;

/** Publisher, licence and download furniture, wherever it appears. */
const BOILERPLATE: RegExp[] = [
  // "Downloaded from https://obgyn.onlinelibrary.wiley.com/doi/... by
  // HEALTH RESEARCH..., Wiley Online Library on [date]. See the Terms
  // and Conditions..."
  /downloaded from\s+https?:\/\/\S+[\s\S]{0,400}?(?=\.\s|$)/gi,
  // The URL sits in brackets and carries no full stop, so this cannot
  // be anchored on one.
  /see the terms and conditions\s*(\([^)]*\))?/gi,
  // Bounded to the phrase itself. "Everything up to the next full
  // stop" looks equivalent and is not: an appendix care pathway
  // extracted from a flowchart can run 1400 characters without one, and
  // a greedy [^.]* swallowed the whole pathway.
  /on wiley online library for rules of use;?\s*/gi,
  /oa articles are governed by the applicable creative commons licen[cs]e\.?/gi,
  /this article is protected by copyright(\.| and all rights reserved\.?)?/gi,
  /all rights reserved\.?/gi,
  // Bare DOI and URL runs left stranded by extraction.
  /https?:\/\/doi\.org\/\S+/gi,
  /\bdoi:\s*10\.\d{4,}\/\S+/gi,
  // "14710528, 2022, 13, Downloaded from" — the journal's own tracking
  // string, which extraction drops into the middle of paragraphs.
  /\b\d{7,},\s*\d{4},\s*\d+,?/g,
];

/** Collapse the whitespace a strip leaves behind. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+| +$/gm, "")
    .trim();
}

/**
 * Remove lines that repeat across pages — running headers and footers.
 *
 * Comparison ignores digits, so "Page 4 of 61" and "Page 5 of 61" count
 * as the same line. Only short lines are considered: a header is a
 * header because it is a fragment, and a long paragraph that happens to
 * recur is likelier to be a genuine repeated recommendation.
 */
export function stripRunningFurniture(pages: string[]): string[] {
  if (pages.length < MIN_PAGES) return pages;

  const key = (line: string) =>
    line.replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();

  const pagesContaining = new Map<string, Set<number>>();
  pages.forEach((page, i) => {
    for (const raw of page.split("\n")) {
      const line = raw.trim();
      if (!line || line.length > SHORT_LINE) continue;
      const k = key(line);
      if (!k) continue;
      (pagesContaining.get(k) ?? pagesContaining.set(k, new Set()).get(k)!).add(i);
    }
  });

  const threshold = Math.max(MIN_PAGES, Math.ceil(pages.length * REPEAT_SHARE));
  const furniture = new Set<string>();
  pagesContaining.forEach((seen, k) => {
    if (seen.size >= threshold) furniture.add(k);
  });
  if (furniture.size === 0) return pages;

  return pages.map((page) =>
    page
      .split("\n")
      .filter((raw) => {
        const line = raw.trim();
        if (!line || line.length > SHORT_LINE) return true;
        return !furniture.has(key(line));
      })
      .join("\n")
  );
}

/** Remove publisher, licence and download furniture from a text. */
export function stripBoilerplate(text: string): string {
  let out = text;
  for (const re of BOILERPLATE) out = out.replace(re, " ");
  return tidy(out);
}

/**
 * Everything above, in order: running furniture found by repetition,
 * then boilerplate found by what it says.
 *
 * `pages` is one string per page where the extractor can provide it. A
 * single-element array simply skips the first pass, which needs pages
 * to compare.
 */
export function cleanExtractedText(pages: string[]): string {
  return stripBoilerplate(stripRunningFurniture(pages).join("\n\n"));
}
