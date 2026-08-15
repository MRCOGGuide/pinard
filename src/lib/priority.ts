/**
 * Source-material priority, and how it steers what a candidate sees.
 *
 * Not all guidance carries equal exam weight. RCOG Green-top Guidelines,
 * NICE, FSRH and BASHH guidance and Scientific Impact Papers are the
 * examined core; TOG articles and governance material support them;
 * patient leaflets and corrections are background. When a candidate is
 * close to their exam there isn't time for everything, so sessions lean
 * hard on the core and widen out as the runway lengthens.
 *
 * Pure functions only — unit-tested, no I/O.
 */

export type Priority = 1 | 2 | 3;

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: "Core guidance (GTG, NICE, FSRH, BASHH, SIP)",
  2: "Supporting (TOG, societies, governance)",
  3: "Background (leaflets, corrections)",
};

export const PRIORITY_SHORT: Record<Priority, string> = {
  1: "core",
  2: "supporting",
  3: "background",
};

const CORE_PATTERNS = [
  /green[\s-]?top/i,
  /\bGTG\b/i,
  /\bNICE\b/i,
  /\bFSRH\b/i,
  /\bBASHH\b/i,
  /\bUKMEC\b/i,
  /scientific impact/i,
  /\bSIP\s*(no\.?|\d)/i,
  /\bRCOG\b/i,
];

const BACKGROUND_PATTERNS = [
  /patient information/i,
  /\bleaflet\b/i,
  /^correction to/i,
  /^re:\s/i,
  /^author'?s reply/i,
  /^spotlight on/i,
];

/**
 * Best-guess tier for a newly uploaded document. Deliberately
 * conservative: anything unrecognised lands in "supporting" rather
 * than being promoted into the examined core. Always editable.
 */
export function classifyPriority(input: {
  sourceReference?: string | null;
  title?: string | null;
  togCategory?: string | null;
}): Priority {
  const haystack = `${input.sourceReference ?? ""} ${input.title ?? ""}`.trim();

  // Background beats everything: a "Correction to <GTG>" is not core.
  if (BACKGROUND_PATTERNS.some((re) => re.test(haystack))) return 3;

  // TOG issue content is supporting by definition, whatever it cites.
  if (input.togCategory) {
    return input.togCategory === "update" || input.togCategory === "article"
      ? 2
      : 3;
  }

  if (CORE_PATTERNS.some((re) => re.test(haystack))) return 1;
  return 2;
}

/**
 * Share of a session that should come from core material, by how long
 * is left. Short runway → concentrate on what the exam actually tests;
 * long runway → broader reading, since there is time to cover it.
 */
export function corePriorityShare(daysRemaining: number): number {
  if (daysRemaining <= 42) return 0.85; // ≤ 6 weeks
  if (daysRemaining <= 84) return 0.65; // ≤ 12 weeks
  return 0.5;
}

export type Selectable = { id: number; priority: Priority };

/**
 * Choose questions for a session.
 *
 * Two rules, in order:
 * 1. Never repeat a question the candidate has already answered while
 *    unseen ones remain — repetition is the thing we're avoiding.
 * 2. Fill the core share from priority-1 material first, then take the
 *    remainder in priority order, so weaker runways spend their time
 *    on the most examinable guidance.
 *
 * Falls back gracefully: if unseen material runs out, previously seen
 * questions are used (oldest-seen first, decided by the caller's
 * ordering) rather than returning a short session.
 */
export function selectForSession<T extends Selectable>(
  pool: T[],
  options: { size: number; seenIds: Set<number>; coreShare: number }
): T[] {
  const { size, seenIds, coreShare } = options;
  if (size <= 0 || pool.length === 0) return [];

  const byPriority = (a: T, b: T) => a.priority - b.priority;
  const unseen = pool.filter((q) => !seenIds.has(q.id));
  const seen = pool.filter((q) => seenIds.has(q.id));

  const picked: T[] = [];
  const take = (from: T[], n: number) => {
    for (const item of from) {
      if (picked.length >= size || n <= 0) return;
      if (picked.includes(item)) continue;
      picked.push(item);
      n--;
    }
  };

  // Core first, up to its share of the session. The share is a floor,
  // not a ceiling — but the rest of the session deliberately goes to
  // wider reading, so a long runway genuinely broadens instead of
  // serving core all the way down.
  const coreWanted = Math.ceil(size * coreShare);
  take(unseen.filter((q) => q.priority === 1), coreWanted);

  // Remainder: supporting and background material, most important first.
  take(unseen.filter((q) => q.priority !== 1).sort(byPriority), size - picked.length);

  // Short on wider material — top up with whatever core is left.
  take([...unseen].sort(byPriority), size - picked.length);

  // Only then repeat previously answered questions.
  take([...seen].sort(byPriority), size - picked.length);

  return picked;
}
