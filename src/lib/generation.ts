import Anthropic from "@anthropic-ai/sdk";
import { PROMPT_G, PROMPT_Q, PROMPT_Q_EMQ } from "@/lib/prompts";
import type { QuestionFormat, QuestionOption } from "@/lib/types";
import type { RetrievedChunk } from "@/lib/retrieval";

/**
 * Question generation service + verification layer (PROJECT.md
 * sections 2 and 7, AI-PROMPTS.md prompts G and Q). Server only.
 */

export type GeneratedExplanation = {
  key: string;
  verdict: "correct" | "incorrect";
  text: string;
  citation_chunk_ids: number[];
  source_reference: string;
};

export type GeneratedQuestion = {
  stem: string;
  options: QuestionOption[];
  correct_key: string;
  /** The combined paragraph shown on the card. */
  explanation: string;
  explanations: GeneratedExplanation[];
  difficulty: number;
  citation_chunk_ids: number[];
  coverage_note: string;
};

export type StyleExample = {
  format: QuestionFormat;
  stem: string;
  options: QuestionOption[];
  correct_key: string;
  lead_in: string | null;
  rationale: string | null;
};

// UK-English lint list (PROJECT.md section 7). RCOG house style is
// "fetal"/"fetus", so the o-spellings are flagged alongside the
// American forms. Whole-word, case-insensitive.
const AMERICANISMS: { term: string; uk: string }[] = [
  { term: "labor", uk: "labour" },
  { term: "cesarean", uk: "caesarean" },
  { term: "estrogen", uk: "oestrogen" },
  { term: "anesthesia", uk: "anaesthesia" },
  { term: "counseling", uk: "counselling" },
  { term: "counselor", uk: "counsellor" },
  { term: "foetus", uk: "fetus" },
  { term: "foetal", uk: "fetal" },
];

export function ukEnglishProblems(text: string): string[] {
  const problems: string[] = [];
  for (const { term, uk } of AMERICANISMS) {
    const re = new RegExp(`\\b${term}\\b`, "i");
    if (re.test(text)) problems.push(`americanism "${term}" (use "${uk}")`);
  }
  return problems;
}

/**
 * Phrases that report on the source instead of explaining the
 * medicine. An explanation is written for a candidate who wants to
 * know why the answer is right; the guidance that establishes it is
 * already named under the card, so prose that narrates the passage
 * adds nothing and reads like a machine reading aloud.
 */
const SOURCE_NARRATION: RegExp[] = [
  /according to the (source |given |provided )?(passage|passages|text|material|extract)/i,
  /\bthe (source )?passages? (states?|says?|describes?|notes?|mentions?|confirms?)/i,
  /as (stated|described|noted|set out|outlined) in the (passage|text|source|extract|material)/i,
  /\bin the (source|provided|given) material\b/i,
  /\bthe (guideline|guidance|document) (states?|says?|presents?|provides?|describes?|notes?|mentions?|cites?)\b/i,
  /\btable \d+ of the (guideline|guidance)\b/i,
  /\bthe (above|given|provided) passages?\b/i,
  // Where inside a document a fact sits is of no use to a candidate.
  // "The figures marked with an asterisk in Appendix V" is a filing
  // reference, not medicine.
  /\b(appendix|annex|asterisk|footnote)\b/i,
  // Capitalised, because that is how a cross-reference is written and
  // obstetrics is full of the lower-case kind: a figure 8 suture is a
  // suture, and "a caesarean section 2 years ago" is a vignette.
  /\b(Table|Figure|Box) \d+\b/,
];

/**
 * Naming the evidence — kept out of the question, allowed in the answer.
 *
 * A stem that opens "According to the AHRQ meta-analysis data..." asks
 * about provenance. The guidance has adopted the figure, so the
 * guidance is what the candidate answers from, and the study name is
 * wordage to read past.
 *
 * Under the answer it can earn its place. A trial a recommendation
 * actually rests on is worth knowing by name — a senior trainee should
 * recognise the evidence their practice is built on. A small cohort a
 * guideline cites in passing and draws nothing from is not, and neither
 * is the size of an evidence base standing in for the number itself.
 * That distinction is a judgement about the guidance rather than a
 * pattern, so the prompts carry it and this list guards only the stem.
 */
const STUDY_ATTRIBUTION: RegExp[] = [
  /\b(meta-?analysis|systematic review|cohort study|case series|randomi[sz]ed controlled trials?)\b/i,
  /\bRCTs?\b/,
  /\bthe [A-Z][A-Za-z-]{2,} (trial|study|cohort|review)\b/,
  /\b(AHRQ|Cochrane|MBRRACE|CEMACH|CMACE)\b/,
  /\bet al\b/i,
  /\b\d[\d,]*\s+studies\b/i,
  /\bstudies (have\s+)?(shown|found|demonstrated|reported|suggest)\b/i,
  /\ba (large |small |recent |single |multicentre )*stud(y|ies) (found|showed|reported|demonstrated)\b/i,
];

/** Evidence named in a stem or its options, where it does not belong. */
export function studyAttributionProblems(text: string): string[] {
  for (const re of STUDY_ATTRIBUTION) {
    const found = text.match(re);
    if (found) {
      return [
        `the question names the evidence ("${found[0]}") — ask what the guidance recommends; the study belongs under the answer, if anywhere`,
      ];
    }
  }
  return [];
}

export function sourceNarrationProblems(text: string): string[] {
  for (const re of SOURCE_NARRATION) {
    const found = text.match(re);
    if (found) {
      return [
        `narrates the source ("${found[0]}") — explain the clinical reasoning and let source_reference name the guidance`,
      ];
    }
  }
  return [];
}

/**
 * A stem that asks which item "is cited as" or "is listed among" the
 * guidance's bullet points tests whether the candidate has memorised a
 * list, not whether they can manage the woman in front of them. The
 * knowledge is usually the same; the question has to be put clinically
 * — what is her risk, what would you do next, what figure would you
 * quote her.
 */
const LIST_RECALL: RegExp[] = [
  /\b(is|are) (cited|listed|named|mentioned|specified|identified|included) as\b/i,
  /\b(is|are) (cited|listed|named|mentioned) (among|within|in the list)\b/i,
  /\baccording to the (list|table)\b/i,
  /\bwhich .{0,50}\bdoes the (guideline|guidance|document) (list|name|cite|mention)\b/i,
];

export function listRecallProblems(stem: string): string[] {
  for (const re of LIST_RECALL) {
    const found = stem.match(re);
    if (found) {
      return [
        `stem asks which item "${found[0]}" — put the question clinically (her risk, the next step, the figure to quote her) instead of asking which items appear in a list`,
      ];
    }
  }
  return [];
}

/**
 * Lint an admin's edit field by field.
 *
 * The checks themselves are the same ones generation runs, but a
 * reviewer needs to be told where the problem is. Run over one blob of
 * every field, a match reports the phrase and leaves the reviewer to
 * find it — which on a twelve-option EMQ with a per-option explanation
 * each means reading the whole question looking for four words.
 */
export type LintField = {
  label: string;
  text: string;
  /** Does a candidate read this, or is it the admin's working? */
  candidateFacing: boolean;
};

/**
 * The narration rule is scoped exactly as generation scopes it: to what
 * a candidate reads. The per-option working is admin-only, and a stray
 * "the passage notes" there must not block an edit any more than it
 * blocks generation — the card never shows it. UK English applies
 * everywhere, since the owner may paste the working into a question.
 */
export function questionEditProblems(fields: LintField[]): string | null {
  for (const field of fields) {
    const uk = ukEnglishProblems(field.text);
    if (uk.length > 0) return `${field.label} — UK-English: ${uk.join("; ")}`;
  }
  for (const field of fields) {
    if (!field.candidateFacing) continue;
    const narration = sourceNarrationProblems(field.text);
    if (narration.length > 0) return `${field.label} ${narration[0]}`;
  }
  return null;
}

/**
 * The editable fields of a question, labelled as the form shows them.
 */
export function questionLintFields(input: {
  stem: string;
  options: { key: string; text: string }[];
  explanation: string;
  explanations: { key: string; text: string }[];
}): LintField[] {
  return [
    { label: "Stem", text: input.stem, candidateFacing: true },
    ...input.options.map((op) => ({
      label: `Option ${op.key}`,
      text: op.text,
      candidateFacing: true,
    })),
    { label: "Explanation", text: input.explanation, candidateFacing: true },
    ...input.explanations.map((e) => ({
      label: `Working for option ${e.key}`,
      text: e.text,
      candidateFacing: false,
    })),
  ];
}

/** Build the SOURCE PASSAGES block: [chunk:ID] (Source: reference). */
export function formatPassages(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c) =>
        `[chunk:${c.chunk_id}] (Source: ${c.source_reference})\n${c.text}`
    )
    .join("\n\n");
}

/**
 * A complete EMQ exemplar. Examples are stored one row per scenario
 * sharing emq_group_id; rendering those rows individually shows the
 * model an SBA with a long option list, which is precisely the wrong
 * lesson. They must be reassembled into whole sets first.
 */
export type StyleEmqSet = {
  lead_in: string;
  options: QuestionOption[];
  scenarios: { stem: string; correct_key: string; rationale: string | null }[];
};

/** Rebuild EMQ example rows into whole sets, newest group first. */
export function groupEmqExamples(
  rows: {
    stem: string;
    options: QuestionOption[];
    correct_key: string;
    lead_in: string | null;
    rationale: string | null;
    emq_group_id: string | null;
  }[]
): StyleEmqSet[] {
  const byGroup = new Map<string, StyleEmqSet>();
  for (const row of rows) {
    if (!row.emq_group_id) continue; // a lone row is not a set
    const existing = byGroup.get(row.emq_group_id);
    if (existing) {
      existing.scenarios.push({
        stem: row.stem,
        correct_key: row.correct_key,
        rationale: row.rationale ?? null,
      });
    } else {
      byGroup.set(row.emq_group_id, {
        lead_in: row.lead_in ?? "",
        options: row.options,
        scenarios: [
          {
            stem: row.stem,
            correct_key: row.correct_key,
            rationale: row.rationale ?? null,
          },
        ],
      });
    }
  }
  // Only genuine sets teach the format.
  return Array.from(byGroup.values()).filter((s) => s.scenarios.length >= 2);
}

/** Build the EMQ STYLE EXAMPLES block — whole sets, form only. */
export function formatEmqStyleSets(sets: StyleEmqSet[]): string {
  return sets
    .map((set, i) => {
      const opts = set.options.map((o) => `  ${o.key}. ${o.text}`).join("\n");
      const scenarios = set.scenarios
        .map((s, n) => {
          const lines = [
            `  Scenario ${n + 1}: ${s.stem}`,
            `  Answer: ${s.correct_key}`,
          ];
          if (s.rationale?.trim()) {
            lines.push(`  Explanation: ${s.rationale.trim()}`);
          }
          return lines.join("\n");
        })
        .join("\n\n");
      return [
        `EXAMPLE EMQ SET ${i + 1} — ${set.options.length} shared options, ${set.scenarios.length} scenarios`,
        `Option list (shared by every scenario):\n${opts}`,
        `Lead-in: ${set.lead_in}`,
        `Scenarios:\n${scenarios}`,
      ].join("\n");
    })
    .join("\n\n");
}

/** Build the STYLE EXAMPLES block — form only, never a source of facts. */
export function formatStyleExamples(examples: StyleExample[]): string {
  return examples
    .map((ex, i) => {
      const opts = ex.options
        .map((o) => `  ${o.key}. ${o.text}`)
        .join("\n");
      const parts = [`EXAMPLE ${i + 1} (${ex.format.toUpperCase()})`];
      if (ex.lead_in) parts.push(`Lead-in: ${ex.lead_in}`);
      parts.push(
        `Stem: ${ex.stem}`,
        `Options:\n${opts}`,
        `Answer: ${ex.correct_key}`
      );
      // The exemplar's own explanation is the style to imitate. It was
      // fetched from the bank and then dropped here, so the model had
      // never seen how these are written and fell back on narrating
      // its sources instead.
      if (ex.rationale?.trim()) {
        parts.push(`Explanation: ${ex.rationale.trim()}`);
      }
      return parts.join("\n");
    })
    .join("\n\n");
}

/**
 * Pull the JSON object out of a model response.
 *
 * The prompt asks for JSON and nothing else, and usually that is what
 * comes back. But when the model works the problem out in prose first —
 * most often to conclude the passages cannot support a question — the
 * object arrives after several paragraphs of reasoning. Parsing the
 * whole response then fails on the first letter of the prose, and a
 * correct "insufficient_source_material" is thrown away and counted as
 * a verification failure, which reads to the owner as a broken
 * generator rather than a thin section.
 *
 * So: try the response as it stands, and fall back to the outermost
 * braces.
 */
export function extractJson(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  if (cleaned.startsWith("{")) return cleaned;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

function parseQuestion(raw: string):
  | { question: GeneratedQuestion }
  | { insufficient: true }
  | { parseError: string } {
  const cleaned = extractJson(raw);
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : "bad JSON" };
  }
  if (typeof data !== "object" || data === null) {
    return { parseError: "response was not a JSON object" };
  }
  const obj = data as Record<string, unknown>;
  if (obj.error === "insufficient_source_material") return { insufficient: true };

  // Structural shape — defensive, so we never store garbage.
  const options = Array.isArray(obj.options)
    ? (obj.options as unknown[]).flatMap((o) => {
        if (typeof o !== "object" || o === null) return [];
        const oo = o as Record<string, unknown>;
        if (typeof oo.key !== "string" || typeof oo.text !== "string") return [];
        return [{ key: oo.key, text: oo.text }];
      })
    : [];
  const explanations = Array.isArray(obj.explanations)
    ? (obj.explanations as unknown[]).flatMap((e) => {
        if (typeof e !== "object" || e === null) return [];
        const ee = e as Record<string, unknown>;
        if (typeof ee.key !== "string" || typeof ee.text !== "string") return [];
        const cites = Array.isArray(ee.citation_chunk_ids)
          ? (ee.citation_chunk_ids as unknown[])
              .map((n) => Number(n))
              .filter((n) => Number.isFinite(n))
          : [];
        return [
          {
            key: ee.key,
            verdict: ee.verdict === "correct" ? "correct" : "incorrect",
            text: ee.text,
            citation_chunk_ids: cites,
            source_reference:
              typeof ee.source_reference === "string" ? ee.source_reference : "",
          } as GeneratedExplanation,
        ];
      })
    : [];

  const allCites = Array.from(
    new Set(explanations.flatMap((e) => e.citation_chunk_ids))
  );

  const question: GeneratedQuestion = {
    stem: typeof obj.stem === "string" ? obj.stem : "",
    options,
    correct_key: typeof obj.correct_key === "string" ? obj.correct_key : "",
    explanation: typeof obj.explanation === "string" ? obj.explanation.trim() : "",
    explanations,
    difficulty:
      typeof obj.difficulty === "number" ? Math.round(obj.difficulty) : 3,
    citation_chunk_ids: allCites,
    coverage_note:
      typeof obj.coverage_note === "string" ? obj.coverage_note : "",
  };
  return { question };
}

/**
 * Verification (PROJECT.md section 7): every citation ∈ retrieved set,
 * every option has an explanation, UK-English lint. Returns the list of
 * problems (empty = passes).
 */
export function verifyQuestion(
  q: GeneratedQuestion,
  retrievedIds: Set<number>
): string[] {
  const problems: string[] = [];

  if (!q.stem.trim()) problems.push("empty stem");
  if (q.options.length < 2) problems.push("fewer than two options");
  if (!q.options.some((o) => o.key === q.correct_key))
    problems.push("correct_key does not match any option");

  // One explanation, for the answer. Explaining four distractors taught
  // nothing a candidate carries into the exam, and the card never
  // showed it — the exemplars carry a single rationale, and so do we.
  if (!q.explanations.some((e) => e.key === q.correct_key)) {
    problems.push("the correct option has no explanation");
  }
  for (const e of q.explanations) {
    if (e.key !== q.correct_key) {
      problems.push(`option ${e.key} is not the answer and must not be explained`);
    }
  }

  // Every cited chunk id is in the retrieved set.
  const badCites = new Set<number>();
  for (const e of q.explanations) {
    for (const id of e.citation_chunk_ids) {
      if (!retrievedIds.has(id)) badCites.add(id);
    }
  }
  if (badCites.size > 0) {
    problems.push(`invalid citations: ${Array.from(badCites).join(", ")}`);
  }
  // Grounding: the correct option must cite at least one passage.
  const correct = q.explanations.find((e) => e.key === q.correct_key);
  if (!correct || correct.citation_chunk_ids.length === 0) {
    problems.push("correct option has no citation");
  }

  // The one explanation is what the candidate reads. Without it the
  // question reveals its answer and explains nothing.
  if (!correct?.text.trim()) {
    problems.push("the correct option's explanation is empty");
  }

  // Everything stored is now read by the candidate — there is no
  // admin-only working left to hold to a looser standard.
  const question = [q.stem, ...q.options.map((o) => o.text)].join("\n");
  const candidateText = [
    question,
    q.explanation,
    ...q.explanations.map((e) => e.text),
  ].join("\n");

  problems.push(...ukEnglishProblems(candidateText));
  problems.push(...sourceNarrationProblems(candidateText));
  problems.push(...listRecallProblems(q.stem));
  // The evidence may be named under the answer, never in the question
  // being asked.
  problems.push(...studyAttributionProblems(question));

  return problems;
}

/**
 * Independent grounding check (verification layer, not one of the
 * canonical AI-PROMPTS.md prompts). A second pass must point at the
 * exact sentence in the cited passages that establishes the correct
 * answer. The quote is then checked by literal substring match against
 * the passage text, so an invented justification cannot pass: the
 * model would have to quote words that genuinely appear in the source.
 */
const GROUNDING_PROMPT = `You are a strict fact-checker for exam questions. You are given SOURCE PASSAGES, a question, and the answer marked correct.

Decide ONE thing: do the passages explicitly establish that the marked answer is correct?

Work in this order.

1. Say to yourself exactly what the question asks for — which quantity, in which direction, about whom. "What percentage will become pregnant" and "what percentage will not become pregnant" are different questions with different answers.
2. Find the sentence in the passages that gives THAT.
3. Check the marked answer is what that sentence gives.

The commonest way a question is wrong is that the number is in the passages but attached to the opposite quantity. Watch for: effectiveness against failure rate, survival against mortality, sensitivity against specificity, continuation against discontinuation, a risk against a risk reduction, and any pair that sums to 100%. A table headed "Typical use effectiveness (%)" does not answer "what percentage become pregnant" — the answer to that is what is left when you take the figure from 100, and unless the passages state that remainder themselves, they do not establish it. Answer supported: false.

- Quote VERBATIM the sentence (or clause) from the passages that establishes it. Copy it exactly, character for character, from the passage text. Do not paraphrase, correct, translate or shorten it with ellipses.
- Quote the sentence or clause that carries the point and stop there — at most about 300 characters. Some passages are poorly extracted and run headings and page furniture into the prose; take the part that establishes the answer, not everything that follows it.
- If the passages only imply it, require outside clinical knowledge, or do not address it at all, answer supported: false.
- Being clinically true is NOT enough. It must be stated in these passages.

Respond with ONLY this JSON, no fences:
{"supported": true, "chunk_id": 12, "quote": "exact sentence copied from the passage"}
or
{"supported": false, "reason": "one short sentence"}`;

/** Comparison form: lowercase, punctuation and spacing flattened. */
function flatten(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Shortest quote we'll accept as real evidence. */
const MIN_QUOTE_CHARS = 25;
/** Words a quote must share with the passage to count as quoted. */
const QUOTE_OVERLAP = 0.8;
const MIN_QUOTE_WORDS = 6;

/**
 * Does this quote genuinely come from the passage?
 *
 * An exact substring match is the ideal, but PDF-extracted guidance is
 * full of hyphenation, ligatures, table spacing and line breaks that
 * survive flattening, so a faithful quote often fails it. The fallback
 * keeps the guarantee that matters:
 *
 * - EVERY number in the quote must appear in the passage. Invented
 *   figures — the dangerous hallucination in clinical revision — are
 *   rejected outright, however well the prose matches.
 * - The wording must overlap heavily, so a plausible-sounding sentence
 *   assembled from the model's own knowledge cannot pass.
 */
export function quoteIsFromPassage(quote: string, passage: string): boolean {
  const flatQuote = flatten(quote);
  const flatPassage = flatten(passage);
  if (flatQuote.length < MIN_QUOTE_CHARS) return false;

  if (flatPassage.includes(flatQuote)) return true;

  const quoteWords = flatQuote.split(" ").filter(Boolean);
  if (quoteWords.length < MIN_QUOTE_WORDS) return false;
  const passageWords = new Set(flatPassage.split(" ").filter(Boolean));

  // Any figure the passage doesn't contain means the quote is invented
  // or altered — exactly the failure this check exists to catch.
  for (const word of quoteWords) {
    if (/\d/.test(word) && !passageWords.has(word)) return false;
  }

  const shared = quoteWords.filter((w) => passageWords.has(w)).length;
  return shared / quoteWords.length >= QUOTE_OVERLAP;
}

export async function checkGrounding(
  question: GeneratedQuestion,
  passages: RetrievedChunk[],
  client: Anthropic,
  model: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const correctOption = question.options.find(
    (o) => o.key === question.correct_key
  );
  if (!correctOption) return { ok: false, reason: "no correct option" };

  const cited = new Set(
    question.explanations.find((e) => e.key === question.correct_key)
      ?.citation_chunk_ids ?? []
  );
  const citedPassages = passages.filter((p) => cited.has(p.chunk_id));
  if (citedPassages.length === 0) {
    return { ok: false, reason: "correct option cites no passage" };
  }

  const userMessage = `SOURCE PASSAGES:\n${formatPassages(citedPassages)}\n\nQUESTION:\n${question.stem}\n\nMARKED CORRECT ANSWER:\n${correctOption.key}. ${correctOption.text}`;

  let raw = "";
  try {
    const response = await client.messages.create({
      model,
      // Enough for a long quote out of a badly chunked document. At
      // 1024 a quote from OCR that runs page furniture into the prose
      // ("...a 1 Scheduled care STANDARD 30 16 STANDARD 38...") ran the
      // JSON past the limit, and a truncated verdict was being read as
      // a failed one.
      max_tokens: 2048,
      system: GROUNDING_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = response.content.find((b) => b.type === "text");
    raw = block && block.type === "text" ? block.text : "";
  } catch (error) {
    return {
      ok: false,
      reason: `grounding check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let verdict: { supported?: unknown; quote?: unknown; reason?: unknown };
  try {
    verdict = JSON.parse(extractJson(raw));
  } catch {
    return { ok: false, reason: "grounding check returned unreadable JSON" };
  }

  if (verdict.supported !== true) {
    const why =
      typeof verdict.reason === "string" && verdict.reason.trim()
        ? verdict.reason.trim()
        : "the passages do not establish the marked answer";
    return { ok: false, reason: `not grounded — ${why}` };
  }

  const quote = typeof verdict.quote === "string" ? verdict.quote.trim() : "";
  if (flatten(quote).length < MIN_QUOTE_CHARS) {
    return { ok: false, reason: "supporting quote too short to verify" };
  }

  // The decisive test: the quote must genuinely come from a cited
  // passage — every figure present, and the wording overlapping.
  const found = citedPassages.some((p) => quoteIsFromPassage(quote, p.text));
  if (!found) {
    return {
      ok: false,
      reason: "supporting quote does not appear in the cited passages",
    };
  }

  return { ok: true };
}

/** A, B, C … for however many options a set needs. */
export function optionKey(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * Put the options in the order the exam puts them.
 *
 * The RCOG spec is explicit: options "will nearly always be listed in
 * alphabetical or numerical order for ease of reference". The exemplar
 * bank follows that 84% of the time. This used to shuffle instead,
 * which served the same purpose — the correct answer must not sit on a
 * predictable letter — but produced lists no real paper would print,
 * and made a twelve-option EMQ list harder to scan than the real thing.
 *
 * Sorting achieves the anti-bias goal just as well, and for the same
 * reason: a letter is decided by the option's own text, which has
 * nothing to do with whether it is the answer.
 *
 * Numerical when every option carries a number — "10 mg", "2%",
 * "34 weeks" — because alphabetising those puts 10 before 9.
 *
 * Returns the new options and an old-key → new-key map.
 */
export function orderOptions(options: QuestionOption[]): {
  options: QuestionOption[];
  remap: Map<string, string>;
} {
  const leadingNumber = (text: string): number | null => {
    const m = text.match(/-?\d+(?:[.,]\d+)?/);
    if (!m) return null;
    const n = Number(m[0].replace(",", ""));
    return Number.isFinite(n) ? n : null;
  };

  const numbers = options.map((o) => leadingNumber(o.text));
  const allNumeric = numbers.every((n) => n !== null);

  const sorted = options
    .map((option, i) => ({ option, i }))
    .sort((a, b) => {
      if (allNumeric) {
        const d = (numbers[a.i] as number) - (numbers[b.i] as number);
        if (d !== 0) return d;
      }
      return a.option.text.localeCompare(b.option.text, "en", {
        sensitivity: "base",
      });
    });

  const remap = new Map<string, string>();
  const ordered = sorted.map(({ option }, position) => {
    const newKey = optionKey(position);
    remap.set(option.key, newKey);
    return { key: newKey, text: option.text };
  });

  return { options: ordered, remap };
}

/** Apply a key remap to one question's answer and explanations. */
function applyRemap<T extends { key: string }>(
  correctKey: string,
  explanations: T[],
  remap: Map<string, string>
): { correctKey: string; explanations: T[] } {
  return {
    correctKey: remap.get(correctKey) ?? correctKey,
    explanations: explanations.map((e) => ({
      ...e,
      key: remap.get(e.key) ?? e.key,
    })),
  };
}

/** Letter an SBA's options in the exam's order. */
export function orderQuestionOptions(
  question: GeneratedQuestion
): GeneratedQuestion {
  const { options, remap } = orderOptions(question.options);
  const { correctKey, explanations } = applyRemap(
    question.correct_key,
    question.explanations,
    remap
  );
  return { ...question, options, correct_key: correctKey, explanations };
}

/* ===================== EMQ sets ===================== */

export type GeneratedEmqScenario = {
  stem: string;
  correct_key: string;
  /**
   * The correct option's explanation, and nothing else — an EMQ has one
   * per scenario, and it is what the candidate reads. SBAs carry a
   * separate combined paragraph because they explain five options; an
   * EMQ explaining one would only say the same thing twice.
   */
  explanations: GeneratedExplanation[];
  citation_chunk_ids: number[];
};

export type GeneratedEmqSet = {
  lead_in: string;
  options: QuestionOption[];
  scenarios: GeneratedEmqScenario[];
  difficulty: number;
  coverage_note: string;
};

/** A real EMQ has a long shared list, not five options. */
export const EMQ_MIN_OPTIONS = 8;
export const EMQ_MAX_OPTIONS = 18;
export const EMQ_MIN_SCENARIOS = 3;

function parseEmqSet(raw: string):
  | { set: GeneratedEmqSet }
  | { insufficient: true }
  | { parseError: string } {
  const cleaned = extractJson(raw);
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : "bad JSON" };
  }
  if (typeof data !== "object" || data === null) {
    return { parseError: "response was not a JSON object" };
  }
  const obj = data as Record<string, unknown>;
  if (obj.error === "insufficient_source_material") return { insufficient: true };

  const options = Array.isArray(obj.options)
    ? (obj.options as unknown[]).flatMap((o) => {
        if (typeof o !== "object" || o === null) return [];
        const oo = o as Record<string, unknown>;
        if (typeof oo.key !== "string" || typeof oo.text !== "string") return [];
        return [{ key: oo.key.trim().toUpperCase(), text: oo.text.trim() }];
      })
    : [];

  const scenarios = Array.isArray(obj.scenarios)
    ? (obj.scenarios as unknown[]).flatMap((s) => {
        if (typeof s !== "object" || s === null) return [];
        const ss = s as Record<string, unknown>;
        if (typeof ss.stem !== "string" || typeof ss.correct_key !== "string") {
          return [];
        }
        const explanations = Array.isArray(ss.explanations)
          ? (ss.explanations as unknown[]).flatMap((e) => {
              if (typeof e !== "object" || e === null) return [];
              const ee = e as Record<string, unknown>;
              if (typeof ee.key !== "string" || typeof ee.text !== "string") {
                return [];
              }
              const cites = Array.isArray(ee.citation_chunk_ids)
                ? (ee.citation_chunk_ids as unknown[])
                    .map((n) => Number(n))
                    .filter((n) => Number.isFinite(n))
                : [];
              return [
                {
                  key: ee.key.trim().toUpperCase(),
                  verdict:
                    ee.verdict === "correct"
                      ? ("correct" as const)
                      : ("incorrect" as const),
                  text: ee.text,
                  citation_chunk_ids: cites,
                  source_reference:
                    typeof ee.source_reference === "string"
                      ? ee.source_reference
                      : "",
                },
              ];
            })
          : [];
        return [
          {
            stem: ss.stem,
            correct_key: ss.correct_key.trim().toUpperCase(),
            explanations,
            citation_chunk_ids: Array.from(
              new Set(explanations.flatMap((e) => e.citation_chunk_ids))
            ),
          },
        ];
      })
    : [];

  return {
    set: {
      lead_in: typeof obj.lead_in === "string" ? obj.lead_in : "",
      options,
      scenarios,
      difficulty:
        typeof obj.difficulty === "number" ? Math.round(obj.difficulty) : 3,
      coverage_note:
        typeof obj.coverage_note === "string" ? obj.coverage_note : "",
    },
  };
}

type PublicationPattern = { re: RegExp; label: string };

/**
 * Words that mark a publication rather than a clinical item. Matched
 * against the lead-in, every option and every stem.
 */
const PUBLICATION_PATTERNS: PublicationPattern[] = [
  { re: /\barticles?\b/i, label: "article" },
  { re: /\bjournals?\b/i, label: "journal" },
  { re: /\bpublications?\b/i, label: "publication" },
  { re: /\beditorials?\b/i, label: "editorial" },
  { re: /\bchapters?\b/i, label: "chapter" },
  { re: /\btextbooks?\b/i, label: "textbook" },
  { re: /\bTOG\b/, label: "TOG" },
];

/**
 * Additionally banned in options, where naming a guidance document is
 * the same defect. Not applied to the lead-in or stems, where "as per
 * RCOG guidance" is ordinary exam phrasing.
 */
const GUIDANCE_TITLE_PATTERNS: PublicationPattern[] = [
  { re: /\bguidelines?\b/i, label: "guideline" },
  { re: /\bguidance\b/i, label: "guidance" },
  { re: /green[\s-]?top/i, label: "Green-top" },
  { re: /\bGTG\b/, label: "GTG" },
];

/**
 * Reject a set that tests which publication covers a subject instead
 * of clinical knowledge.
 *
 * TOG is legitimate source material (priority 2), but some TOG pieces —
 * "Spotlight on..." editorials, correspondence, contents summaries —
 * are little more than annotated lists of article titles. Given those
 * passages the model builds an option list out of the titles and asks
 * which article covers what, which is not examined in MRCOG and is not
 * salvageable by regenerating from the same material.
 */
export function publicationReferenceProblems(set: GeneratedEmqSet): string[] {
  const problems: string[] = [];
  const match = (patterns: PublicationPattern[], text: string) =>
    patterns.find((p) => p.re.test(text))?.label;

  const inLeadIn = match(PUBLICATION_PATTERNS, set.lead_in);
  if (inLeadIn) {
    problems.push(
      `lead-in refers to a "${inLeadIn}": it must ask for a clinical decision, not for a publication`
    );
  }

  for (const option of set.options) {
    const term = match(
      [...PUBLICATION_PATTERNS, ...GUIDANCE_TITLE_PATTERNS],
      option.text
    );
    if (term) {
      problems.push(
        `option ${option.key} refers to a "${term}": options must be clinical items — diagnoses, investigations, drugs, management steps, thresholds — never document titles`
      );
    }
  }

  set.scenarios.forEach((scenario, i) => {
    const term = match(PUBLICATION_PATTERNS, scenario.stem);
    if (term) {
      problems.push(
        `scenario ${i + 1} refers to a "${term}": the vignette must be about managing a patient, not about choosing something to read`
      );
    }
  });

  return problems;
}

/**
 * Verify an EMQ set is genuinely an EMQ: a long shared option list, a
 * lead-in, and several scenarios answered from that list — not an SBA
 * wearing more options.
 */
export function verifyEmqSet(
  set: GeneratedEmqSet,
  retrievedIds: Set<number>
): string[] {
  const problems: string[] = [];

  if (!set.lead_in.trim()) problems.push("missing lead-in");
  if (set.options.length < EMQ_MIN_OPTIONS) {
    problems.push(
      `only ${set.options.length} options (an EMQ needs at least ${EMQ_MIN_OPTIONS})`
    );
  }
  if (set.options.length > EMQ_MAX_OPTIONS) {
    problems.push(`${set.options.length} options exceeds ${EMQ_MAX_OPTIONS}`);
  }
  if (set.scenarios.length < EMQ_MIN_SCENARIOS) {
    problems.push(
      `only ${set.scenarios.length} scenario(s) (an EMQ set needs at least ${EMQ_MIN_SCENARIOS})`
    );
  }

  const keys = new Set(set.options.map((o) => o.key));
  if (keys.size !== set.options.length) problems.push("duplicate option keys");

  const usedAnswers = new Set<string>();
  for (let i = 0; i < set.scenarios.length; i++) {
    const scenario = set.scenarios[i];
    const label = `scenario ${i + 1}`;
    if (!scenario.stem.trim()) problems.push(`${label}: empty stem`);
    if (!keys.has(scenario.correct_key)) {
      problems.push(`${label}: answer is not in the option list`);
    }
    if (usedAnswers.has(scenario.correct_key)) {
      problems.push(`${label}: repeats an earlier scenario's answer`);
    }
    usedAnswers.add(scenario.correct_key);

    const correct = scenario.explanations.find(
      (e) => e.key === scenario.correct_key
    );
    if (!correct) {
      problems.push(`${label}: correct option has no explanation`);
    } else if (correct.citation_chunk_ids.length === 0) {
      problems.push(`${label}: correct option has no citation`);
    }
    const bad = scenario.explanations
      .flatMap((e) => e.citation_chunk_ids)
      .filter((id) => !retrievedIds.has(id));
    if (bad.length > 0) {
      problems.push(`${label}: invalid citations ${Array.from(new Set(bad)).join(", ")}`);
    }
  }

  // As for SBAs: house style is judged on what the candidate reads,
  // while the per-option working only has to be UK English.
  const candidateText = [
    set.lead_in,
    ...set.options.map((o) => o.text),
    ...set.scenarios.flatMap((s) => [
      s.stem,
      // The correct option's explanation is what the candidate reads on
      // an EMQ, so it is held to house style, not merely to UK English.
      s.explanations.find((e) => e.key === s.correct_key)?.text ?? "",
    ]),
  ].join("\n");
  const blob = [
    candidateText,
    ...set.scenarios.flatMap((s) => s.explanations.map((e) => e.text)),
  ].join("\n");
  problems.push(...ukEnglishProblems(blob));
  problems.push(...sourceNarrationProblems(candidateText));
  problems.push(...publicationReferenceProblems(set));
  const asked = [
    set.lead_in,
    ...set.options.map((o) => o.text),
    ...set.scenarios.map((s) => s.stem),
  ].join("\n");
  problems.push(...listRecallProblems(asked));
  // Named evidence belongs under the answer, not in what is asked.
  problems.push(...studyAttributionProblems(asked));

  return problems;
}

/** Order the shared list, remapping every scenario's answer to match. */
export function orderEmqOptions(set: GeneratedEmqSet): GeneratedEmqSet {
  const { options, remap } = orderOptions(set.options);
  return {
    ...set,
    options,
    scenarios: set.scenarios.map((s) => {
      const { correctKey, explanations } = applyRemap(
        s.correct_key,
        s.explanations,
        remap
      );
      return { ...s, correct_key: correctKey, explanations };
    }),
  };
}

export type EmqOutcome =
  | { status: "ok"; set: GeneratedEmqSet; attempts: number }
  | { status: "insufficient" }
  | { status: "flagged"; reason: string; raw: string };

export type GenerationOutcome =
  | { status: "ok"; question: GeneratedQuestion; attempts: number }
  | { status: "insufficient" }
  | { status: "flagged"; reason: string; raw: string };

/**
 * A retry that re-sends the same prompt is an independent roll of the
 * dice: the model has no idea what was wrong last time. Handing back
 * the verifier's problems turns three attempts into three corrections.
 */
function withPreviousProblems(message: string, problems: string[]): string {
  if (problems.length === 0) return message;
  return `${message}\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED BY THE VERIFIER:\n${problems
    .map((p) => `- ${p}`)
    .join(
      "\n"
    )}\n\nWrite a fresh response that fixes every one of these. Do not defend the previous attempt or comment on it — just produce a correct one.`;
}

/**
 * Generate one verified question with the regenerate-then-flag policy:
 * up to 1 initial + 2 retries (3 attempts), then flag for admin.
 */
export async function generateVerifiedQuestion(params: {
  examPart: string;
  sectionTitle: string;
  format: QuestionFormat;
  difficulty: number;
  passages: RetrievedChunk[];
  examples: StyleExample[];
  /**
   * Optional topic guide (e.g. the TOG CPD questions for an issue):
   * shows the model WHICH knowledge points are high-yield. Never a
   * source of facts — facts and citations come from passages only.
   */
  highYieldGuide?: string;
  /**
   * Stems already in the bank for this section or document. The new
   * question must test a DIFFERENT point — not merely be reworded.
   */
  alreadyAsked?: string[];
}): Promise<GenerationOutcome> {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const system =
    PROMPT_G +
    "\n\n" +
    PROMPT_Q.replace("{{format}}", params.format.toUpperCase())
      .replace("{{exam_part}}", params.examPart)
      .replace("{{section_title}}", params.sectionTitle)
      .replace("{{difficulty}}", String(params.difficulty));

  const highYieldBlock = params.highYieldGuide
    ? `\n\nHIGH-YIELD TOPIC GUIDE (TOG CPD questions for this material):\n${params.highYieldGuide}\n\nThese CPD questions show which knowledge points the examiners consider high-yield. Prefer targeting the SAME knowledge points (e.g. if a CPD question asks about the risk of X, write a question testing the risk of X), but write a NEW ${params.format.toUpperCase()} question in the exam style with a different scenario and different options. Do NOT copy their wording, and do NOT treat them as a source of facts — every fact and citation must come from SOURCE PASSAGES. If the passages do not cover a guide topic, fall back to what the passages do support.`
    : "";

  // These are coverage notes — one line each on what a question tests —
  // so a whole section's history fits where thirty vignettes did not. A
  // stem is several hundred characters of which most is the woman
  // rather than the knowledge; at the tier-1 target of 30 questions a
  // section costs a few hundred tokens here. The cap is therefore set
  // well past anything a section will reach, rather than at what a
  // prompt could afford.
  const ALREADY_ASKED_LIMIT = 200;
  const NOTE_PREVIEW = 220;
  const asked = (params.alreadyAsked ?? []).slice(-ALREADY_ASKED_LIMIT);
  const alreadyAskedBlock = asked.length
    ? `\n\nALREADY ASKED — the knowledge points that existing questions on this material already test:\n${asked
        .map(
          (note, i) =>
            `${i + 1}. ${note.slice(0, NOTE_PREVIEW)}${note.length > NOTE_PREVIEW ? "…" : ""}`
        )
        .join(
          "\n"
        )}\n\nYour question must test a DIFFERENT knowledge point from every one of these. Rewording an existing question, changing its numbers, or asking the same fact from another angle all count as duplicates. Reusing a clinical situation is fine — asking the same fact about it is not. If the source passages only support points that have already been asked, respond with {"error": "insufficient_source_material"} rather than producing a near-duplicate.`
    : "";

  const userMessage = `SOURCE PASSAGES:\n${formatPassages(
    params.passages
  )}\n\nSTYLE EXAMPLES:\n${
    params.examples.length ? formatStyleExamples(params.examples) : "(none provided)"
  }${highYieldBlock}${alreadyAskedBlock}`;

  const retrievedIds = new Set(params.passages.map((p) => p.chunk_id));

  let lastRaw = "";
  let lastProblems: string[] = [];
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw = "";
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system,
        messages: [
          {
            role: "user",
            content: withPreviousProblems(userMessage, lastProblems),
          },
        ],
      });
      const text = response.content.find((b) => b.type === "text");
      raw = text && text.type === "text" ? text.text : "";
    } catch (error) {
      lastRaw = error instanceof Error ? error.message : String(error);
      lastProblems = ["api error"];
      // API errors (e.g. no credit) won't fix on retry — flag immediately.
      return { status: "flagged", reason: `API error: ${lastRaw}`, raw: lastRaw };
    }

    lastRaw = raw;
    const parsed = parseQuestion(raw);
    if ("insufficient" in parsed) return { status: "insufficient" };
    if ("parseError" in parsed) {
      lastProblems = [`parse error: ${parsed.parseError}`];
      continue;
    }

    const problems = verifyQuestion(parsed.question, retrievedIds);
    if (problems.length === 0) {
      // Structurally sound — now prove the answer is actually in the
      // sources before it can reach the review queue.
      const grounding = await checkGrounding(
        parsed.question,
        params.passages,
        client,
        model
      );
      if (grounding.ok) {
        // Only now randomise: the grounding check must see the same
        // letters the model reasoned about.
        return {
          status: "ok",
          question: orderQuestionOptions(parsed.question),
          attempts: attempt,
        };
      }
      lastProblems = [grounding.reason];
      continue;
    }
    lastProblems = problems;
  }

  return {
    status: "flagged",
    reason: `verification failed after ${MAX_ATTEMPTS} attempts: ${lastProblems.join("; ")}`,
    raw: lastRaw,
  };
}

/**
 * Generate one verified EMQ SET (shared option list + lead-in +
 * several scenarios), with the same regenerate-then-flag policy and
 * per-scenario grounding as SBAs.
 */
export async function generateVerifiedEmqSet(params: {
  examPart: string;
  sectionTitle: string;
  difficulty: number;
  optionCount: number;
  scenarioCount: number;
  passages: RetrievedChunk[];
  exampleSets: StyleEmqSet[];
  highYieldGuide?: string;
  alreadyAsked?: string[];
}): Promise<EmqOutcome> {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const system =
    PROMPT_G +
    "\n\n" +
    PROMPT_Q_EMQ.replace("{{exam_part}}", params.examPart)
      .replace("{{section_title}}", params.sectionTitle)
      .replace("{{difficulty}}", String(params.difficulty))
      .replace(/\{\{option_count\}\}/g, String(params.optionCount))
      .replace(/\{\{scenario_count\}\}/g, String(params.scenarioCount));

  const highYieldBlock = params.highYieldGuide
    ? `\n\nHIGH-YIELD TOPIC GUIDE (TOG CPD questions for this material):\n${params.highYieldGuide}\n\nThese show which knowledge points are high-yield. Target the SAME points with new scenarios and different options. Never copy their wording, and never treat them as a source of facts.`
    : "";

  const asked = (params.alreadyAsked ?? []).slice(-30);
  const alreadyAskedBlock = asked.length
    ? `\n\nALREADY ASKED — scenarios that already exist for this material:\n${asked
        .map((stem, i) => `${i + 1}. ${stem.slice(0, 220)}${stem.length > 220 ? "…" : ""}`)
        .join("\n")}\n\nEvery scenario you write must test a DIFFERENT knowledge point from all of these. If the passages only support points already asked, respond with {"error": "insufficient_source_material"}.`
    : "";

  const userMessage = `SOURCE PASSAGES:\n${formatPassages(
    params.passages
  )}\n\nSTYLE EXAMPLES — copy this SHAPE. Note that ONE option list serves EVERY scenario in a set; the scenarios do not each carry their own options:\n${
    params.exampleSets.length
      ? formatEmqStyleSets(params.exampleSets)
      : "(none provided)"
  }${highYieldBlock}${alreadyAskedBlock}`;

  const retrievedIds = new Set(params.passages.map((p) => p.chunk_id));

  let lastRaw = "";
  let lastProblems: string[] = [];
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw = "";
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 8192,
        system,
        messages: [
          {
            role: "user",
            content: withPreviousProblems(userMessage, lastProblems),
          },
        ],
      });
      const text = response.content.find((b) => b.type === "text");
      raw = text && text.type === "text" ? text.text : "";
    } catch (error) {
      lastRaw = error instanceof Error ? error.message : String(error);
      return { status: "flagged", reason: `API error: ${lastRaw}`, raw: lastRaw };
    }

    lastRaw = raw;
    const parsed = parseEmqSet(raw);
    if ("insufficient" in parsed) return { status: "insufficient" };
    if ("parseError" in parsed) {
      lastProblems = [`parse error: ${parsed.parseError}`];
      continue;
    }

    const problems = verifyEmqSet(parsed.set, retrievedIds);
    if (problems.length > 0) {
      lastProblems = problems;
      continue;
    }

    // Every scenario's answer must be provable from the passages. The
    // checks are independent, so run them together — sequentially this
    // is the slowest part of generating a set.
    const groundingResults = await Promise.all(
      parsed.set.scenarios.map((scenario) =>
        checkGrounding(
          {
            stem: scenario.stem,
            options: parsed.set.options,
            correct_key: scenario.correct_key,
            // checkGrounding only reads the stem, options and citations;
            // an EMQ scenario has no combined paragraph to give it.
            explanation: "",
            explanations: scenario.explanations,
            difficulty: parsed.set.difficulty,
            citation_chunk_ids: scenario.citation_chunk_ids,
            coverage_note: parsed.set.coverage_note,
          },
          params.passages,
          client,
          model
        )
      )
    );
    const groundingProblems = groundingResults.flatMap((g, i) =>
      g.ok ? [] : [`scenario ${i + 1}: ${g.reason}`]
    );
    if (groundingProblems.length > 0) {
      // One scenario reaching past the passages should not cost the
      // whole set. Retry while attempts remain — a full set is better —
      // but on the last one, keep the scenarios that did ground if
      // enough are left to still be an EMQ. An unused option is normal:
      // the lead-in already says options may be used once, more than
      // once or not at all.
      const grounded = parsed.set.scenarios.filter(
        (_, i) => groundingResults[i].ok
      );
      if (attempt === MAX_ATTEMPTS && grounded.length >= EMQ_MIN_SCENARIOS) {
        return {
          status: "ok",
          set: orderEmqOptions({ ...parsed.set, scenarios: grounded }),
          attempts: attempt,
        };
      }
      lastProblems = groundingProblems;
      continue;
    }

    return {
      status: "ok",
      set: orderEmqOptions(parsed.set),
      attempts: attempt,
    };
  }

  return {
    status: "flagged",
    reason: `EMQ verification failed after ${MAX_ATTEMPTS} attempts: ${lastProblems.join("; ")}`,
    raw: lastRaw,
  };
}
