import Anthropic from "@anthropic-ai/sdk";
import { PROMPT_G, PROMPT_Q } from "@/lib/prompts";
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

/** Build the SOURCE PASSAGES block: [chunk:ID] (Source: reference). */
export function formatPassages(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c) =>
        `[chunk:${c.chunk_id}] (Source: ${c.source_reference})\n${c.text}`
    )
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
      parts.push(`Stem: ${ex.stem}`, `Options:\n${opts}`, `Answer: ${ex.correct_key}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

function parseQuestion(raw: string):
  | { question: GeneratedQuestion }
  | { insufficient: true }
  | { parseError: string } {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
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

  // Every option has an explanation.
  for (const option of q.options) {
    if (!q.explanations.some((e) => e.key === option.key)) {
      problems.push(`option ${option.key} has no explanation`);
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

  // UK-English lint across all displayed text.
  const blob = [
    q.stem,
    ...q.options.map((o) => o.text),
    ...q.explanations.map((e) => e.text),
  ].join("\n");
  problems.push(...ukEnglishProblems(blob));

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

- Quote VERBATIM the sentence (or clause) from the passages that establishes it. Copy it exactly, character for character, from the passage text. Do not paraphrase, correct, translate or shorten it with ellipses.
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
      max_tokens: 1024,
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
    verdict = JSON.parse(
      raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    );
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
  const flatQuote = flatten(quote);
  if (flatQuote.length < MIN_QUOTE_CHARS) {
    return { ok: false, reason: "supporting quote too short to verify" };
  }

  // The decisive test: the quote must genuinely occur in a cited passage.
  const found = citedPassages.some((p) => flatten(p.text).includes(flatQuote));
  if (!found) {
    return {
      ok: false,
      reason: "supporting quote does not appear in the cited passages",
    };
  }

  return { ok: true };
}

export type GenerationOutcome =
  | { status: "ok"; question: GeneratedQuestion; attempts: number }
  | { status: "insufficient" }
  | { status: "flagged"; reason: string; raw: string };

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

  const userMessage = `SOURCE PASSAGES:\n${formatPassages(
    params.passages
  )}\n\nSTYLE EXAMPLES:\n${
    params.examples.length ? formatStyleExamples(params.examples) : "(none provided)"
  }${highYieldBlock}`;

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
        messages: [{ role: "user", content: userMessage }],
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
        return { status: "ok", question: parsed.question, attempts: attempt };
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
