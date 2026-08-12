import type { QuestionOption } from "@/lib/types";

/**
 * Shared parsing for example-question imports (single PDFs like a TOG
 * CPD set, and multi-part question books). Server only.
 */

export const PARSE_PROMPT = `You convert exam-question documents into structured JSON. The document contains single-best-answer (SBA) questions and/or extended-matching question (EMQ) sets, e.g. a TOG CPD set or an exam revision book.

Rules:
- Extract EVERY question in the document. Preserve wording verbatim (UK English); do not paraphrase or fix the questions.
- SBA: a stem with its own lettered options.
- EMQ set: one shared lettered option list + a lead-in instruction + several numbered scenario vignettes answered from that list.
- NEVER guess, infer or reason out an answer. The ONLY acceptable source for a correct answer is the document itself: an answer key, a marked/highlighted answer, or an explicit statement of the answer in the text.
- If a question's answer is NOT stated in the document, OMIT that question entirely. A missing question is always better than a guessed answer.
- Answer keys usually sit at the end of a block of questions and refer to question numbers. Match them by number, carefully. If you cannot match a question to its stated answer with certainty, omit the question.
- Set "answer_source" to a short verbatim snippet of the document text you took the answer from (e.g. "12. C" or "Answer: C"). If you cannot quote it, omit the question.
- Option keys are capital letters in order: A, B, C, ...
- Ignore non-question content (prose, references, adverts, instructions).

Respond ONLY with JSON, no markdown fences:
{
  "sba": [
    { "stem": "...", "options": [{"key": "A", "text": "..."}, ...],
      "correct_key": "A", "answer_source": "12. C",
      "rationale": "one short sentence quoted or closely paraphrased from the document's own explanation, or empty string" }
  ],
  "emq_groups": [
    { "lead_in": "...", "options": [{"key": "A", "text": "..."}, ...],
      "scenarios": [
        { "stem": "...", "correct_key": "C", "answer_source": "3. C", "rationale": "" }
      ] }
  ]
}
Also report how many questions you omitted because their answer was not stated: {"omitted_no_answer": 0}.
If the document contains no questions at all, respond with {"sba": [], "emq_groups": [], "omitted_no_answer": 0}.`;

export const BOOK_PART_NOTE = `

This text is ONE PART of a larger book, split at page boundaries:
- It may begin or end mid-question. Skip incomplete fragments — the neighbouring part handles them. Extract only questions whose stem and every option are fully visible.
- Answer keys usually appear at the end of each set of questions (often numbered). Match answers to questions by their numbers, within THIS text only.
- If a question's answer key is not present in this part, OMIT that question and count it in "omitted_no_answer". Do NOT answer it yourself — another part will contain it alongside its key.`;

type ParsedOption = { key?: unknown; text?: unknown };
export type ParsedSba = {
  stem?: unknown;
  options?: ParsedOption[];
  correct_key?: unknown;
  answer_source?: unknown;
  rationale?: unknown;
};
export type ParsedEmqGroup = {
  lead_in?: unknown;
  options?: ParsedOption[];
  scenarios?: ParsedSba[];
};
export type ParsedImport = {
  sba?: ParsedSba[];
  emq_groups?: ParsedEmqGroup[];
  omitted_no_answer?: unknown;
};

function cleanOptions(raw: ParsedOption[] | undefined): QuestionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((o) =>
    typeof o?.key === "string" && typeof o?.text === "string" && o.text.trim()
      ? [{ key: o.key.trim().toUpperCase(), text: o.text.trim() }]
      : []
  );
}

function noteRationale(item: ParsedSba): string | null {
  const base = typeof item.rationale === "string" ? item.rationale.trim() : "";
  return base || null;
}

/** Loose comparison text: lowercase, punctuation and spacing flattened. */
function flatten(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * An answer is only accepted when the model can point at document text
 * that states it, AND that text really occurs in the document. This is
 * the hard stop against invented answers: a fabricated citation fails
 * the substring test and the question is dropped.
 */
function answerIsSourced(item: ParsedSba, haystack: string): boolean {
  const quote =
    typeof item.answer_source === "string" ? item.answer_source.trim() : "";
  if (!quote) return false;
  const flat = flatten(quote);
  // Too short to be meaningful (e.g. just "C") — can't verify it.
  if (flat.length < 2) return false;
  return haystack.includes(flat);
}

/**
 * Parse the model's reply: fences stripped; if prose surrounds the
 * JSON, the outermost object is salvaged. Truncation is reported via
 * the API's stop reason, and otherwise the reply's opening is echoed
 * so the real cause is visible.
 */
export function parseModelReply(
  raw: string,
  stopReason: string | null
): { data: ParsedImport } | { error: string } {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let data: ParsedImport | null = null;
  try {
    data = JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        data = JSON.parse(cleaned.slice(first, last + 1));
      } catch {
        data = null;
      }
    }
  }
  if (!data) {
    if (stopReason === "max_tokens") {
      return {
        error:
          "The set is too long for one pass — the model's output was cut off. Split the PDF and import it in parts.",
      };
    }
    return {
      error: `The model's reply was not valid JSON. It began: "${cleaned.slice(0, 250)}"`,
    };
  }
  return { data };
}

export function normaliseStem(stem: string): string {
  return stem.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160);
}

export type BuiltRows = {
  sbaRows: Record<string, unknown>[];
  emqRows: Record<string, unknown>[];
  emqGroupCount: number;
  skipped: string[];
  /** Questions dropped because their answer wasn't sourced in the text. */
  unsourced: number;
};

/**
 * Validate parsed questions and build example_questions rows. When
 * `existingStems` is given (multi-part book imports), questions whose
 * normalised stem is already present are skipped as duplicates — this
 * absorbs the page overlap between parts.
 */
export function buildExampleRows(
  data: ParsedImport,
  /** null = a global exemplar, applying to every section. */
  sectionId: number | null,
  sourceNote: string,
  existingStems?: Set<string>,
  /** The document text these questions came from, for answer sourcing. */
  documentText?: string
): BuiltRows {
  const skipped: string[] = [];
  const sbaRows: Record<string, unknown>[] = [];
  let unsourced = 0;

  // Flattened once; every answer citation is checked against it.
  const haystack = documentText ? flatten(documentText) : "";

  const seen = existingStems ?? new Set<string>();

  const sbaItems = data.sba ?? [];
  for (let i = 0; i < sbaItems.length; i++) {
    const item = sbaItems[i];
    const stem = typeof item.stem === "string" ? item.stem.trim() : "";
    const options = cleanOptions(item.options);
    const correctKey =
      typeof item.correct_key === "string"
        ? item.correct_key.trim().toUpperCase()
        : "";
    if (!stem || options.length < 2) {
      skipped.push(`SBA ${i + 1}: missing stem or options`);
      continue;
    }
    if (!options.some((o) => o.key === correctKey)) {
      skipped.push(`SBA ${i + 1}: no valid correct answer`);
      continue;
    }
    // Hard rule: the answer must be sourced from the document itself.
    if (haystack && !answerIsSourced(item, haystack)) {
      unsourced++;
      continue;
    }
    if (existingStems) {
      const key = normaliseStem(stem);
      if (seen.has(key)) continue; // silent duplicate (overlap)
      seen.add(key);
    }
    sbaRows.push({
      section_id: sectionId,
      format: "sba",
      stem,
      options,
      correct_key: correctKey,
      rationale: noteRationale(item),
      source_note: sourceNote || null,
    });
  }

  const emqRows: Record<string, unknown>[] = [];
  let emqGroupCount = 0;
  const emqGroups = data.emq_groups ?? [];
  for (let g = 0; g < emqGroups.length; g++) {
    const group = emqGroups[g];
    const leadIn = typeof group.lead_in === "string" ? group.lead_in.trim() : "";
    const options = cleanOptions(group.options);
    const scenarios = Array.isArray(group.scenarios) ? group.scenarios : [];
    if (!leadIn || options.length < 4 || scenarios.length === 0) {
      skipped.push(`EMQ set ${g + 1}: incomplete lead-in, options or scenarios`);
      continue;
    }
    const groupId = crypto.randomUUID();
    let added = 0;
    for (let s = 0; s < scenarios.length; s++) {
      const scenario = scenarios[s];
      const stem =
        typeof scenario.stem === "string" ? scenario.stem.trim() : "";
      const correctKey =
        typeof scenario.correct_key === "string"
          ? scenario.correct_key.trim().toUpperCase()
          : "";
      if (!stem || !options.some((o) => o.key === correctKey)) {
        skipped.push(
          `EMQ set ${g + 1}, scenario ${s + 1}: missing stem or valid answer`
        );
        continue;
      }
      if (haystack && !answerIsSourced(scenario, haystack)) {
        unsourced++;
        continue;
      }
      if (existingStems) {
        const key = normaliseStem(stem);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      emqRows.push({
        section_id: sectionId,
        format: "emq",
        stem,
        options,
        correct_key: correctKey,
        rationale: noteRationale(scenario),
        source_note: sourceNote || null,
        lead_in: leadIn,
        emq_group_id: groupId,
      });
      added++;
    }
    if (added > 0) emqGroupCount++;
  }

  return { sbaRows, emqRows, emqGroupCount, skipped, unsourced };
}
