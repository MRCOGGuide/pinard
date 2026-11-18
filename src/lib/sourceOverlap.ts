/**
 * Wording taken from a source (L7.2, "facts, not text").
 *
 * A question states the guidance's facts in Pinard's own words. What a
 * copied sentence shares with its source is a long run of the same words
 * in the same order, so each text is reduced to its plain words (every
 * word counts here, "the" and "of" included, since a copied sentence
 * copies those too) and searched for runs of COPIED_RUN words or more
 * that also appear in a passage. Ten words is longer than any stock
 * clinical phrase ("should be offered low-molecular-weight heparin") and
 * shorter than a copied recommendation.
 *
 * Pure functions only, no I/O: used by the generator, which asks the
 * writer to say it in its own words, and by scripts/audit-overlap.mts.
 */

export const COPIED_RUN = 10;

export function plainWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export type SourceText = { chunk_id: number; text: string };

export type CopiedRun = {
  /** Length of the run, in words. */
  words: number;
  /** The run itself, in plain words. */
  text: string;
  /** The passage it was found in (the first, where several hold it). */
  chunkId: number;
};

export type OverlapIndex = Map<string, number>;

/** Every run of `size` words in the passages, with the passage holding it. */
export function overlapIndex(passages: SourceText[], size = COPIED_RUN): OverlapIndex {
  const index: OverlapIndex = new Map();
  for (const p of passages) {
    const w = plainWords(p.text);
    for (let i = 0; i + size <= w.length; i++) {
      const key = w.slice(i, i + size).join(" ");
      if (!index.has(key)) index.set(key, p.chunk_id);
    }
  }
  return index;
}

/** A figure, not a word: "12.6–21.0" becomes four of these. */
const NUMBER = /^\d+$/;

/**
 * The longest run the text shares with the passages that holds `size`
 * or more words, or null. Figures are matched but not counted: every
 * figure must be the passage's own, so a run is long because of its
 * words, not because "12.6–21.0 in women aged 40" splits into many.
 */
export function longestCopiedRun(text: string, index: OverlapIndex, size = COPIED_RUN): CopiedRun | null {
  const own = plainWords(text);
  let best: CopiedRun | null = null;
  let i = 0;
  while (i + size <= own.length) {
    const chunkId = index.get(own.slice(i, i + size).join(" "));
    if (chunkId === undefined) {
      i++;
      continue;
    }
    // Extend while the next window also appears: a longer copied run.
    let j = i + 1;
    while (j + size <= own.length && index.has(own.slice(j, j + size).join(" "))) j++;
    const run = own.slice(i, j + size - 1);
    const words = run.filter((w) => !NUMBER.test(w)).length;
    if (words >= size && (!best || words > best.words)) best = { words, text: run.join(" "), chunkId };
    i = j + size - 1;
  }
  return best;
}

/**
 * The generator's check: one problem per piece of text that copies a run
 * from the passages, worded so the writer can put it right.
 */
export function copiedWordingProblems(parts: { label: string; text: string | null | undefined }[], passages: SourceText[]): string[] {
  const index = overlapIndex(passages);
  const problems: string[] = [];
  for (const part of parts) {
    if (!part.text) continue;
    const run = longestCopiedRun(part.text, index);
    if (run) {
      problems.push(
        `the ${part.label} copies ${run.words} words in a row from [chunk:${run.chunkId}] ("${run.text}"): state the same fact in your own words, keeping every figure and qualifier`
      );
    }
  }
  return problems;
}
