/**
 * How close a generated question is to one of the style examples
 * (Phase 11, intellectual property).
 *
 * The examples are questions from a published revision book, given to
 * the model to show the MRCOG form and register only. The prompt says
 * never to reuse their content; this checks that it did not, so a
 * question that echoes an example is caught before anyone reviews it.
 *
 * The measure is shared phrasing, not shared medicine. Two questions on
 * the same guideline will share facts and terms; what a copied question
 * shares is runs of the same words in the same order. So each text is
 * reduced to its meaningful words, cut into overlapping runs of
 * SHINGLE words, and compared with each example in turn: the score is
 * the share of the question's runs that also appear in that one
 * example. Runs found in several examples are exam boilerplate ("most
 * appropriate next step in management") and are not counted.
 *
 * Pure functions only, no I/O.
 */

const SHINGLE = 4;

/** A run seen in this many examples or more is boilerplate. */
const COMMON_IN = 3;

/** Flagged when both hold: enough runs shared with ONE example, and
 *  enough of the question made of them. Calibrated on the bank as it
 *  stood on 9 October 2026 (scripts/audit-example-similarity.mts). */
export const SIMILAR_MIN_SHARED = 4;
export const SIMILAR_MIN_SHARE = 0.3;

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "by", "from", "as", "is", "are", "was", "were", "be", "been",
  "being", "has", "have", "had", "her", "she", "his", "he", "it", "its",
  "this", "that", "these", "those", "which", "who", "what", "when", "where",
  "how", "there", "their", "they", "them", "than", "then", "into", "after",
  "before", "any", "all", "no", "not", "also", "only", "would", "should",
  "could", "may", "might", "will", "can", "do", "does", "did", "your", "you",
  "following", "most", "appropriate", "likely",
]);

export function meaningfulWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9.%/]+/g, " ")
    .split(" ")
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w && !STOPWORDS.has(w));
}

export function shingles(text: string): Set<string> {
  const words = meaningfulWords(text);
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= words.length; i++) {
    out.add(words.slice(i, i + SHINGLE).join(" "));
  }
  return out;
}

export type ExampleText = { id: number; text: string };

export type ExampleIndex = {
  byShingle: Map<string, Set<number>>;
  common: Set<string>;
};

export function buildExampleIndex(examples: ExampleText[]): ExampleIndex {
  const byShingle = new Map<string, Set<number>>();
  for (const ex of examples) {
    for (const s of shingles(ex.text)) {
      const ids = byShingle.get(s) ?? new Set<number>();
      ids.add(ex.id);
      byShingle.set(s, ids);
    }
  }
  const common = new Set<string>();
  for (const [s, ids] of byShingle) if (ids.size >= COMMON_IN) common.add(s);
  return { byShingle, common };
}

export type Closeness = {
  exampleId: number | null;
  /** Runs shared with that one example. */
  shared: number;
  /** shared / the question's own (non-boilerplate) runs. */
  share: number;
};

export function closestExample(text: string, index: ExampleIndex): Closeness {
  const own = [...shingles(text)].filter((s) => !index.common.has(s));
  if (own.length === 0) return { exampleId: null, shared: 0, share: 0 };
  const counts = new Map<number, number>();
  for (const s of own) {
    for (const id of index.byShingle.get(s) ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best: Closeness = { exampleId: null, shared: 0, share: 0 };
  for (const [id, n] of counts) {
    if (n > best.shared) best = { exampleId: id, shared: n, share: n / own.length };
  }
  return best;
}

export function tooClose(c: Closeness): boolean {
  return c.shared >= SIMILAR_MIN_SHARED && c.share >= SIMILAR_MIN_SHARE;
}

/** The text of a question that is compared: what a candidate reads. */
export function questionText(q: {
  stem?: string | null;
  lead_in?: string | null;
  explanation?: string | null;
  explanations?: { text?: string | null }[] | null;
}): { stem: string; explanation: string } {
  return {
    stem: [q.lead_in ?? "", q.stem ?? ""].join(" ").trim(),
    explanation: [q.explanation ?? "", ...(q.explanations ?? []).map((e) => e.text ?? "")].join(" ").trim(),
  };
}
