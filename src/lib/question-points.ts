import type Anthropic from "@anthropic-ai/sdk";

/**
 * Keeping a new question off a point already tested (owner, 6 November
 * 2026): "ideally test other points, if exhausted, then the same point can
 * be retested but in a different scenario or by different view."
 *
 * Telling the writer was not enough. On one guideline it wrote the cord
 * platelet threshold twice in two minutes with the first in its list. So
 * every finished question is also compared with what exists, across both
 * formats, and goes back if it repeats a point.
 */

export type AskedRow = {
  id: number;
  format: string;
  stem: string;
  coverage_note: string | null;
  correct_key: string;
  options: { key: string; text: string }[] | null;
  source_document_ids: number[] | null;
};

export type AskedPoint = {
  id: number;
  format: "SBA" | "EMQ";
  /** What it tests: its coverage note, or its stem where it has none. */
  point: string;
  stem: string;
  answer: string;
  /** From the source being written from, rather than elsewhere in its section. */
  sameSource: boolean;
};

export function askedPoints(rows: AskedRow[], documentId: number | null): AskedPoint[] {
  return rows.map((row) => ({
    id: row.id,
    format: row.format === "emq" ? "EMQ" : "SBA",
    point: row.coverage_note?.trim() || row.stem,
    stem: row.stem,
    answer: row.options?.find((o) => o.key === row.correct_key)?.text ?? "",
    sameSource: documentId !== null && (row.source_document_ids ?? []).includes(documentId),
  }));
}

const wordsIn = (text: string) => new Set(text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []);

/**
 * The points nearest to some text: everything from the same source first,
 * then the rest of the section by the words they share, a rare word counting
 * for more than a common one. A section can hold hundreds of questions, and
 * only the few on the same subject matter.
 */
export function nearestPoints(points: AskedPoint[], text: string, limit: number): AskedPoint[] {
  const own = points.filter((p) => p.sameSource);
  const others = points.filter((p) => !p.sameSource);
  const wanted = wordsIn(text);
  const words = others.map((p) => wordsIn(`${p.point} ${p.answer}`));
  const seenIn = new Map<string, number>();
  for (const set of words) for (const word of set) seenIn.set(word, (seenIn.get(word) ?? 0) + 1);
  const scored = others
    .map((point, i) => ({
      point,
      score: [...words[i]].reduce((sum, word) => sum + (wanted.has(word) ? 1 / (seenIn.get(word) ?? 1) : 0), 0),
    }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((p) => p.point);
  return [...own, ...scored].slice(0, limit);
}

/** For the writer's prompt. A set's scenarios can share one note, so a note is listed once. */
export function pointLines(points: AskedPoint[]): string[] {
  return Array.from(new Set(points.map((p) => `${p.format}: ${p.point}`)));
}

const LINE_LIMIT = 400;

export function alreadyAskedBlock(lines: string[], allowRetest: boolean): string {
  if (lines.length === 0) return "";
  const list = lines.map((line, i) => `${i + 1}. ${line.slice(0, LINE_LIMIT)}${line.length > LINE_LIMIT ? "…" : ""}`).join("\n");
  const insufficient = `respond with {"error": "insufficient_source_material"}`;
  const rule = allowRetest
    ? `Test a knowledge point that is not listed if the passages hold one. If they do not, you may test a listed point again, but only in a clinically different scenario, or from a different view: the exception rather than the rule, a complication rather than the treatment, counselling rather than the decision. Rewording, changing the numbers, or the same decision in a similar patient is not a different view. If neither is possible, ${insufficient}.`
    : `Test a DIFFERENT knowledge point from every one of these. A point tested in an EMQ counts as asked for an SBA, and the other way round. Rewording an existing question, changing its numbers, or asking the same fact from another angle all count as duplicates. Reusing a clinical situation is fine, asking the same fact about it is not. If the passages only support points already asked, ${insufficient} rather than producing a near-duplicate.`;
  return `\n\nALREADY ASKED: the knowledge points that existing questions on this material test:\n${list}\n\n${rule}`;
}

const REPEAT = "repeats a point already asked";
export const isRepeatProblem = (problem: string) => problem.includes(REPEAT);

const COMPARE_PROMPT = `You compare new MRCOG exam questions with questions already in the bank, and say which new ones test a knowledge point that is already tested.

Two questions test the SAME point when a candidate who knows the fact needed for one would, from that fact alone, answer the other. The format (single best answer or extended matching), the wording, and details such as the woman's age, parity or exact gestation do not make a point different. Answering the same decision for a similar patient is the same point.

Two questions on one topic that need different facts are DIFFERENT points: the dose of a drug and when to give it; the threshold for treating and the threshold for delivery.

For each repeat, say whether the new question comes at the point from a genuinely different view. That means the clinical scenario differs in kind and the reasoning asked for differs: the exception rather than the rule, a complication rather than the treatment, counselling rather than the decision. A similar patient with changed numbers is not a different view.

Return ONLY a JSON object: {"repeats": [{"new": 1, "existing": 2128, "shared_fact": "a cord platelet count of 150 or below triggers daily monitoring", "different_view": false}]}
"shared_fact" is the one fact both answers rest on. If you cannot name one, it is not a repeat: leave it out. List real repeats only, and never list a question to explain why it differs.
Use the numbers given. If nothing repeats, return {"repeats": []}.`;

export type NewQuestion = { stem: string; answer: string; point: string };

type Repeat = { new?: unknown; existing?: unknown; different_view?: unknown; shared_fact?: unknown };

/** One problem for each new question that repeats a point. A failed check finds none: it must not cost a sound question. */
export async function repeatProblems(
  questions: NewQuestion[],
  points: AskedPoint[],
  allowRetest: boolean,
  client: Anthropic,
  model: string,
  options: object = {}
): Promise<{ index: number; problem: string }[]> {
  const text = questions.map((q) => `${q.stem} ${q.answer} ${q.point}`).join(" ");
  const existing = nearestPoints(points, text, 80);
  if (existing.length === 0) return [];
  const message = `EXISTING QUESTIONS:\n${existing
    .map((p) => `#${p.id} (${p.format}) ${p.stem.slice(0, 260)}\nAnswer: ${p.answer}\nTests: ${p.point.slice(0, 300)}`)
    .join("\n\n")}\n\nNEW QUESTIONS:\n${questions
    .map((q, i) => `${i + 1}. ${q.stem}\nAnswer: ${q.answer}\nTests: ${q.point}`)
    .join("\n\n")}`;
  try {
    const response = await client.messages.create(
      { model, max_tokens: 800, system: COMPARE_PROMPT, messages: [{ role: "user", content: message }] },
      options
    );
    const block = response.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const found = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { repeats?: Repeat[] };
    return (found.repeats ?? []).flatMap((r) => {
      const index = Number(r.new) - 1;
      if (!questions[index] || (allowRetest && r.different_view === true)) return [];
      const why = typeof r.shared_fact === "string" ? `: ${r.shared_fact}` : "";
      const next = allowRetest ? "Test another point, or this one in a clinically different scenario or from a different view." : "Test another point from the passages.";
      return [{ index, problem: `this ${REPEAT} by question #${r.existing}${why}. ${next}` }];
    });
  } catch {
    return [];
  }
}
