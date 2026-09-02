import Anthropic from "@anthropic-ai/sdk";
import {
  citedChunkIds,
  dedupeSources,
  type ChatMessage,
  type ChatSource,
  CHAT_HISTORY_TURNS,
} from "@/lib/chat";
import { extractJson, formatPassages, ukEnglishProblems } from "@/lib/generation";
import { PROMPT_A, PROMPT_C, PROMPT_G } from "@/lib/prompts";
import { formatReference } from "@/lib/reference";
import {
  getChunksByIds,
  retrieveChunks,
  type RetrievedChunk,
} from "@/lib/retrieval";
import type { QuestionOption } from "@/lib/types";

/**
 * "Ask Pinard" — the follow-up tutor chat behind a question card
 * (PROJECT.md item 7, prompt C). SERVER ONLY.
 *
 * Grounded the same way generation is: the model sees the question it
 * is being asked about, the passages that question was written from,
 * and fresh passages retrieved for whatever the candidate just typed —
 * and nothing else. Every passage id it cites back is checked against
 * that set before the reply is shown, so a citation to a passage the
 * model never saw can never reach a candidate.
 */

/** What the model is told about the question under discussion. */
export type ChatQuestionContext = {
  id: number;
  section_id: number;
  stem: string;
  lead_in: string | null;
  options: QuestionOption[];
  correct_key: string;
  explanation: string | null;
  citation_chunk_ids: number[];
};

export type ChatOutcome =
  | {
      ok: true;
      /** Raw reply, still carrying its [chunk:N] markers. */
      reply: string;
      sources: ChatSource[];
      /** The candidate found a genuine inconsistency in the question. */
      flagged: boolean;
    }
  | { ok: false; reason: string; raw: string };

/** Fresh passages retrieved for the candidate's own words each turn. */
const FOLLOW_UP_PASSAGES = 8;

/**
 * Passages for an open question on Today. Higher than the follow-up
 * count: nothing else grounds the answer — there is no question whose
 * own citations come with it.
 */
const LIBRARY_PASSAGES = 12;

/** Ceiling on passages sent, cited ones first. */
const MAX_PASSAGES = 16;

/** One first attempt, then the two retries PROJECT.md section 7 allows. */
const MAX_ATTEMPTS = 3;

function questionBlock(question: ChatQuestionContext): string {
  const options = question.options
    .map((o: QuestionOption) => `${o.key}. ${o.text}`)
    .join("\n");
  const leadIn = question.lead_in ? `Lead-in: ${question.lead_in}\n` : "";
  const explanation = question.explanation
    ? `\nExplanation the candidate has already read: ${question.explanation}`
    : "";

  return `EXAM QUESTION (the candidate has just answered this and read its feedback)
${leadIn}Stem: ${question.stem}

Options:
${options}

Correct answer: ${question.correct_key}${explanation}`;
}

function withProblems(message: string, problems: string[]): string {
  if (problems.length === 0) return message;
  return `${message}\n\nYOUR PREVIOUS REPLY WAS REJECTED: ${problems.join(
    "; "
  )}. Cite only passage ids that appear in the SOURCE PASSAGES above, write UK English, and respond with the JSON object only.`;
}

function parseReply(
  raw: string
): { reply: string; flag: boolean } | { parseError: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return { parseError: "reply was not JSON" };
  }
  const obj = parsed as { reply?: unknown; flag_for_review?: unknown };
  if (typeof obj.reply !== "string" || obj.reply.trim() === "") {
    return { parseError: "reply field missing or empty" };
  }
  return { reply: obj.reply.trim(), flag: obj.flag_for_review === true };
}

/**
 * History as the API needs it: alternating, starting with the
 * candidate. Stored rows are already in that shape — this only guards
 * against a half-written exchange (a reply that failed to save) making
 * the next turn unsendable.
 */
function normaliseHistory(history: ChatMessage[]): ChatMessage[] {
  const trimmed = history.slice(-CHAT_HISTORY_TURNS);
  const out: ChatMessage[] = [];
  for (const message of trimmed) {
    if (out.length === 0 && message.role !== "user") continue;
    if (out.length > 0 && out[out.length - 1].role === message.role) {
      out[out.length - 1] = message;
      continue;
    }
    out.push(message);
  }
  // A trailing assistant turn would leave two assistant messages either
  // side of nothing once this turn's user message is appended.
  return out;
}

/** Name a cited passage the way the question card names its sources. */
async function sourcesFor(ids: number[]): Promise<ChatSource[]> {
  const chunks = await getChunksByIds(ids);
  return dedupeSources(
    chunks.map((chunk) => ({
      chunk_id: chunk.chunk_id,
      title: chunk.document_title,
      reference: formatReference({
        reference: chunk.source_reference,
        year: chunk.source_year,
        togYear: chunk.tog_year,
        togIssue: chunk.tog_issue,
      }),
    }))
  );
}

/**
 * One verified exchange: send the passages and the question, then hold
 * the reply to PROJECT.md section 7 — every passage id it cites must be
 * one it was actually given, and it must be UK English — retrying, then
 * failing, rather than showing a candidate an unverifiable answer.
 */
async function runGroundedChat(params: {
  system: string;
  userMessage: string;
  history: ChatMessage[];
  retrievedIds: Set<number>;
}): Promise<
  | { ok: true; reply: string; flagged: boolean }
  | { ok: false; reason: string; raw: string }
> {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const history = normaliseHistory(params.history);

  let lastRaw = "";
  let lastProblems: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw = "";
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 1500,
        system: params.system,
        messages: [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          {
            role: "user" as const,
            content: withProblems(params.userMessage, lastProblems),
          },
        ],
      });
      raw = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: `chat: model call failed — ${detail}`, raw: "" };
    }

    lastRaw = raw;
    const parsed = parseReply(raw);
    if ("parseError" in parsed) {
      lastProblems = [parsed.parseError];
      continue;
    }

    // A reply with no citations at all is legitimate — the refusal line
    // cites nothing — so only what IS cited is checked.
    const problems: string[] = [];
    const invalid = citedChunkIds(parsed.reply).filter(
      (id) => !params.retrievedIds.has(id)
    );
    if (invalid.length > 0) {
      problems.push(
        `cited passages not in the retrieved set: ${invalid.join(", ")}`
      );
    }
    problems.push(...ukEnglishProblems(parsed.reply));

    if (problems.length > 0) {
      lastProblems = problems;
      continue;
    }

    return { ok: true, reply: parsed.reply, flagged: parsed.flag };
  }

  return {
    ok: false,
    reason: `chat: verification failed after ${MAX_ATTEMPTS} attempts — ${lastProblems.join(
      "; "
    )}`,
    raw: lastRaw,
  };
}

/**
 * The Ask box on Today: an open revision question, answered from the
 * whole library (prompt A). Nothing scopes retrieval here — the
 * candidate has asked about whatever they have asked about, and the
 * sources either cover it or the answer says they do not.
 */
export async function answerFromLibrary(params: {
  history: ChatMessage[];
  message: string;
}): Promise<ChatOutcome> {
  let passages: RetrievedChunk[] = [];
  try {
    passages = await retrieveChunks(params.message, null, LIBRARY_PASSAGES);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `chat: retrieval failed — ${detail}`, raw: "" };
  }
  if (passages.length === 0) {
    return {
      ok: false,
      reason: "chat: retrieval returned no passages",
      raw: "",
    };
  }

  const outcome = await runGroundedChat({
    system: PROMPT_G + "\n\n" + PROMPT_A,
    userMessage: `SOURCE PASSAGES:\n${formatPassages(passages)}\n\nCANDIDATE'S QUESTION:\n${params.message}`,
    history: params.history,
    retrievedIds: new Set(passages.map((p) => p.chunk_id)),
  });
  if (!outcome.ok) return outcome;

  return {
    ok: true,
    reply: outcome.reply,
    sources: await sourcesFor(citedChunkIds(outcome.reply)),
    flagged: false,
  };
}

export async function answerFollowUp(params: {
  question: ChatQuestionContext;
  history: ChatMessage[];
  message: string;
}): Promise<ChatOutcome> {
  // The passages the question was written from, plus whatever matches
  // what the candidate actually asked. Retrieval is deliberately not
  // restricted to this question's section: "is that the same as in
  // twins?" is a fair follow-up, and the sources either cover it or
  // the model says they don't.
  const cited = await getChunksByIds(params.question.citation_chunk_ids);
  let retrieved: RetrievedChunk[] = [];
  try {
    retrieved = await retrieveChunks(params.message, null, FOLLOW_UP_PASSAGES);
  } catch {
    // Retrieval is the extra, not the floor: without it the question's
    // own passages still answer most follow-ups.
    retrieved = [];
  }

  const passages: RetrievedChunk[] = [...cited];
  for (const chunk of retrieved) {
    if (passages.length >= MAX_PASSAGES) break;
    if (passages.some((p) => p.chunk_id === chunk.chunk_id)) continue;
    passages.push(chunk);
  }
  if (passages.length === 0) {
    return {
      ok: false,
      reason: "chat: no source passages available for this question",
      raw: "",
    };
  }

  const outcome = await runGroundedChat({
    system: PROMPT_G + "\n\n" + PROMPT_C,
    userMessage: `${questionBlock(params.question)}

SOURCE PASSAGES:
${formatPassages(passages)}

CANDIDATE'S FOLLOW-UP QUESTION:
${params.message}`,
    history: params.history,
    retrievedIds: new Set(passages.map((p) => p.chunk_id)),
  });
  if (!outcome.ok) return outcome;

  return {
    ok: true,
    reply: outcome.reply,
    sources: await sourcesFor(citedChunkIds(outcome.reply)),
    flagged: outcome.flagged,
  };
}
