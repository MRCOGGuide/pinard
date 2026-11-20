/**
 * A question no firmer than its guidance (owner, 20 November 2026:
 * "Questions accuracy is the single most important feature and it affect
 * trust"; "any issues make sure it never recurs").
 *
 * The commonest fault the audits of the bank found was an explanation
 * firmer than the guidance it cites: "must" where the guideline says
 * "should", "contraindicated" where it says "should be avoided",
 * "mandatory" where it says "recommended", "never" where it says "do not".
 * The independent audit model catches most of them but not every time,
 * so this is a check made in code, the same on every draft: a strong word
 * a question uses must be one its cited passages use too. Where they do
 * not, the writer is told to use the guidance's own wording.
 *
 * Pure functions, no I/O.
 */

type StrongTerm = {
  /** What the draft says. */
  draft: RegExp;
  /** What the passages must contain for it to stand. */
  passage: RegExp;
  label: string;
  /** Also read in a stem, which mostly states her facts ("she has never smoked"). */
  inStem?: boolean;
};

export const STRONG_TERMS: StrongTerm[] = [
  { label: "must", draft: /\bmust\b/i, passage: /\bmust\b/i, inStem: true },
  { label: "mandatory", draft: /\bmandat(?:ory|ed|es|e)\b/i, passage: /\bmandat/i, inStem: true },
  { label: "contraindicated", draft: /\bcontra-?indicat\w*/i, passage: /\bcontra-?indicat/i, inStem: true },
  { label: "prohibited", draft: /\bprohibit(?:s|ed|ion)?\b/i, passage: /\bprohibit/i },
  // The instruction, not the quantity ("an absolute figure of 3 kg", "absolute risk").
  { label: "absolute", draft: /\babsolute(?:ly)?\s+(?:contra-?indicat\w*|requirement|necessity|rule|must|not|never|essential|required)\b/i, passage: /\babsolute/i },
  { label: "never", draft: /\bnever\b/i, passage: /\bnever\b/i },
  { label: "always", draft: /\balways\b/i, passage: /\balways\b/i },
  { label: "invariably", draft: /\binvariabl[ey]\b/i, passage: /\binvariabl/i },
  // Not "essential hypertension" or "essential thrombocythaemia".
  { label: "essential", draft: /\bessential\b(?!\s+(?:hypertension|thrombocyth\w*|tremor|amino|fatty|oils?))/i, passage: /\bessential\b/i },
  { label: "is indicated", draft: /\b(?:is|are) (?:always |specifically |clearly )?indicated\b/i, passage: /\bindicat/i },
];

export type WordingPart = { label: string; text: string | null | undefined; stem?: boolean };

/**
 * The passages as one text, with words a PDF line break split rejoined:
 * the OHSS guideline prints "no manda- tory reporting", and read as it
 * stands that hid a faithful "mandatory" (#197, 20 November 2026). Both
 * forms are kept, so a real hyphen is still read as written.
 */
function sourceOf(passages: string[]): string {
  const joined = passages.join("\n");
  return `${joined}\n${joined.replace(/(\p{L})-\s+(\p{Ll})/gu, "$1$2")}`;
}

/** One problem per strong word a part uses that none of its passages does. */
export function strengthProblems(parts: WordingPart[], passages: string[]): string[] {
  const source = sourceOf(passages);
  const problems: string[] = [];
  for (const part of parts) {
    if (!part.text) continue;
    for (const term of STRONG_TERMS) {
      if (part.stem && !term.inStem) continue;
      const found = part.text.match(term.draft);
      if (found && !term.passage.test(source)) {
        problems.push(
          `the ${part.label} says "${found[0]}", which the cited passages never say: keep the guidance's own strength ("should", "consider", "may", "should be avoided", "do not"), so the question is no firmer than the guideline`
        );
      }
    }
  }
  return problems;
}
