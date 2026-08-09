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
- If the document indicates correct answers (an answer key, marked answers, or true/false statements), use them and set "inferred": false.
- If not, choose the single best answer yourself and set "inferred": true.
- Option keys are capital letters in order: A, B, C, ...
- Ignore non-question content (prose, references, adverts, instructions).

Respond ONLY with JSON, no markdown fences:
{
  "sba": [
    { "stem": "...", "options": [{"key": "A", "text": "..."}, ...],
      "correct_key": "A", "inferred": false, "rationale": "one short sentence or empty string" }
  ],
  "emq_groups": [
    { "lead_in": "...", "options": [{"key": "A", "text": "..."}, ...],
      "scenarios": [
        { "stem": "...", "correct_key": "C", "inferred": true, "rationale": "" }
      ] }
  ]
}
If the document contains no questions at all, respond with {"sba": [], "emq_groups": []}.`;

export const BOOK_PART_NOTE = `

This text is ONE PART of a larger book, split at page boundaries:
- It may begin or end mid-question. Skip incomplete fragments — the neighbouring part handles them. Extract only questions whose stem and every option are fully visible.
- Answer keys usually appear at the end of each set of questions (often numbered). Match answers to questions by their numbers. If a question's answer is not visible in this part, set "inferred": true and answer it yourself.`;

type ParsedOption = { key?: unknown; text?: unknown };
export type ParsedSba = {
  stem?: unknown;
  options?: ParsedOption[];
  correct_key?: unknown;
  inferred?: unknown;
  rationale?: unknown;
};
export type ParsedEmqGroup = {
  lead_in?: unknown;
  options?: ParsedOption[];
  scenarios?: ParsedSba[];
};
export type ParsedImport = { sba?: ParsedSba[]; emq_groups?: ParsedEmqGroup[] };

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
  if (item.inferred === true) {
    return `[AI-inferred answer — verify] ${base}`.trim();
  }
  return base || null;
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
};

/**
 * Validate parsed questions and build example_questions rows. When
 * `existingStems` is given (multi-part book imports), questions whose
 * normalised stem is already present are skipped as duplicates — this
 * absorbs the page overlap between parts.
 */
export function buildExampleRows(
  data: ParsedImport,
  sectionId: number,
  sourceNote: string,
  existingStems?: Set<string>
): BuiltRows {
  const skipped: string[] = [];
  const sbaRows: Record<string, unknown>[] = [];

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

  return { sbaRows, emqRows, emqGroupCount, skipped };
}
