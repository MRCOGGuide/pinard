/**
 * Superseded-guidance detection.
 *
 * Guidelines are re-issued: the 2006 edition and the 2026 edition of
 * the same guideline both sit in the library, and a question written
 * from the old one teaches guidance that has since changed. This finds
 * documents that look like editions of the same thing so the admin can
 * check which is current before approving questions from either.
 *
 * Deterministic and cheap — no AI, no embeddings. Title similarity
 * plus the guideline number where one exists.
 *
 * Pure functions only — unit-tested, no I/O.
 */

/**
 * Words that appear across most guidance and so carry no signal about
 * which topic a document covers. Removing them stops every guideline
 * matching every other one.
 */
const STOPWORDS = new Set([
  "the", "of", "and", "in", "a", "an", "for", "on", "to", "with", "its",
  "at", "by", "from", "or", "no", "nos", "part", "vol", "volume",
  "guideline", "guidelines", "guidance", "green", "top", "greentop",
  "rcog", "nice", "clinical", "practice", "recommendations", "statement",
  "update", "updated", "version", "edition", "management", "care",
]);

const MIN_SIGNIFICANT_TOKENS = 2;
const TITLE_SIMILARITY = 0.6;
/** Near-identical titles: treat as the same document even without years. */
const NEAR_IDENTICAL = 0.85;
/** Years apart before guidance is worth re-checking. */
const MIN_YEAR_GAP = 2;
/**
 * A guideline realistically has a handful of editions. A far larger
 * cluster means formulaic titles have chained together rather than a
 * genuine set of editions, and reporting it would only waste attention.
 */
const MAX_GROUP_SIZE = 8;

export type DuplicateDoc = {
  id: number;
  title: string;
  sourceReference: string;
  year: number | null;
  sectionTitle: string;
  approvedQuestions: number;
  priority: number;
};

export function significantTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  Array.from(a).forEach((token) => {
    if (b.has(token)) shared++;
  });
  return shared / (a.size + b.size - shared);
}

/** "Green-top Guideline No. 27b" → "27b"; null when absent. */
export function guidelineNumber(text: string): string | null {
  const match = text.match(
    /(?:green[\s-]?top|gtg|guideline)[^0-9a-z]{0,14}(?:no\.?\s*)?(\d{1,3}[a-z]?)\b/i
  );
  return match ? match[1].toLowerCase() : null;
}

type Prepared = DuplicateDoc & {
  tokens: Set<string>;
  gtg: string | null;
};

function prepare(doc: DuplicateDoc): Prepared {
  const haystack = `${doc.title} ${doc.sourceReference}`;
  return {
    ...doc,
    tokens: significantTokens(doc.title),
    gtg: guidelineNumber(haystack),
  };
}

/** Do these two look like editions of the same guidance? */
function sameTopic(a: Prepared, b: Prepared): boolean {
  // Same guideline number is decisive, whatever the wording.
  if (a.gtg && b.gtg && a.gtg === b.gtg) return true;
  // Different explicit numbers means genuinely different guidance.
  if (a.gtg && b.gtg && a.gtg !== b.gtg) return false;
  if (
    a.tokens.size < MIN_SIGNIFICANT_TOKENS ||
    b.tokens.size < MIN_SIGNIFICANT_TOKENS
  ) {
    return false;
  }
  return jaccard(a.tokens, b.tokens) >= TITLE_SIMILARITY;
}

export type DuplicateGroup = {
  /** Newest first; the first entry is the one to keep. */
  documents: DuplicateDoc[];
  /** Years between newest and oldest, when both are known. */
  yearGap: number | null;
  /** Older editions that already have approved questions. */
  staleQuestions: number;
};

/**
 * Group documents that look like editions of the same guidance.
 * Reported only when it's actionable: a meaningful year gap, or
 * near-identical titles (a likely re-upload).
 */
export function findSupersededGroups(
  docs: DuplicateDoc[]
): DuplicateGroup[] {
  const prepared = docs.map(prepare);

  // Union-find over "same topic" pairs.
  const parent = prepared.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i: number, j: number) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[b] = a;
  };

  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      if (sameTopic(prepared[i], prepared[j])) union(i, j);
    }
  }

  const clusters = new Map<number, Prepared[]>();
  for (let i = 0; i < prepared.length; i++) {
    const root = find(i);
    const list = clusters.get(root) ?? [];
    list.push(prepared[i]);
    clusters.set(root, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const cluster of Array.from(clusters.values())) {
    if (cluster.length < 2 || cluster.length > MAX_GROUP_SIZE) continue;

    const sorted = [...cluster].sort(
      (a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title)
    );
    const years = sorted
      .map((d) => d.year)
      .filter((y): y is number => typeof y === "number");
    const yearGap =
      years.length >= 2 ? Math.max(...years) - Math.min(...years) : null;

    // Only surface what's worth acting on.
    const nearIdentical =
      jaccard(sorted[0].tokens, sorted[1].tokens) >= NEAR_IDENTICAL;
    if (!(yearGap !== null && yearGap >= MIN_YEAR_GAP) && !nearIdentical) {
      continue;
    }

    // Questions already approved from anything but the newest edition.
    const staleQuestions = sorted
      .slice(1)
      .reduce((sum, d) => sum + d.approvedQuestions, 0);

    groups.push({
      documents: sorted.map((d) => ({
        id: d.id,
        title: d.title,
        sourceReference: d.sourceReference,
        year: d.year,
        sectionTitle: d.sectionTitle,
        approvedQuestions: d.approvedQuestions,
        priority: d.priority,
      })),
      yearGap,
      staleQuestions,
    });
  }

  // Most urgent first: stale questions, then the widest year gap.
  return groups.sort(
    (a, b) =>
      b.staleQuestions - a.staleQuestions || (b.yearGap ?? 0) - (a.yearGap ?? 0)
  );
}
