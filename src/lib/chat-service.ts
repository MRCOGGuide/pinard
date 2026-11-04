import {
  citedAidIds,
  citedChunkIds,
  dedupeSources,
  stripCitations,
  type ChatMessage,
  type ChatSource,
  CHAT_HISTORY_TURNS,
} from "@/lib/chat";
import {
  cacheableSystem,
  extractJson,
  figureGroundingProblems,
  formatPassages,
  ukEnglishCorrected,
} from "@/lib/generation";
import { PROMPT_A, PROMPT_C, PROMPT_G } from "@/lib/prompts";
import { formatReference } from "@/lib/reference";
import {
  getChunksByIds,
  retrieveChunks,
  retrieveMany,
  type RetrievedChunk,
  withYears,
} from "@/lib/retrieval";
import type { QuestionOption } from "@/lib/types";
import { askModel, claudeClient, claudeModel, fastModel } from "@/lib/anthropic";
import { approvedAidCatalogue, formatAids, getApprovedAids, type ApprovedAid } from "@/lib/decision-aids";
import { approvedLegalEntries, formatLegal, legalCatalogue, legalPassages, type LegalEntry } from "@/lib/legal-index";

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

/**
 * What happened inside one answer, for the admin test bench (Admin >
 * Ask Pinard): how long each part took, what was retrieved, and what the
 * checks turned back. Filled in only when the caller passes one.
 */
export type AskTrace = {
  /** Planning and searching together; the planning step alone in planMs. */
  retrievalMs: number;
  planMs?: number;
  modelMs: number[];
  /** What each failed attempt was sent back for. */
  problems: string[][];
  passages: { chunk_id: number; title: string; reference: string; similarity: number }[];
  /** The issues the scenario was searched for, when it was planned. */
  issues?: string[];
  /** Tokens the answering model read and wrote, all attempts together. */
  inputTokens?: number;
  outputTokens?: number;
  /** Instructions read from, and written to, the prompt cache. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** The model that wrote the answer (Opus, or Sonnet on fallback). */
  model?: string;
  /** The line-by-line check: its tokens, and the lines it removed. */
  checkInputTokens?: number;
  checkOutputTokens?: number;
  removed?: string[];
};

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
  | { ok: false; reason: string; raw: string; kind: FailureKind };

/**
 * Why an answer did not arrive, in the only terms a candidate can act
 * on.
 *
 * "unavailable" is ours: the vector search timed out, the model was
 * unreachable. Nothing is wrong with the question and rephrasing it
 * will not help. "unsupported" means the library genuinely does not
 * carry it, where rephrasing is exactly the right advice.
 *
 * Told apart because saying the wrong one costs someone their time:
 * a search timeout reported as "not in the source material" sent the
 * owner looking for a CMV guideline that was there all along.
 */
export type FailureKind = "unavailable" | "unsupported";

/** Fresh passages retrieved for the candidate's own words each turn. */
const FOLLOW_UP_PASSAGES = 8;

/**
 * Passages for an open question on Today. Higher than the follow-up
 * count: nothing else grounds the answer — there is no question whose
 * own citations come with it.
 */
const LIBRARY_PASSAGES = 10;
/** Above this a reply goes back: the longest shape allows 500 words. */
const MAX_REPLY_WORDS = 400;

/** Ceiling on passages sent, cited ones first. */
const MAX_PASSAGES = 16;

/** One first attempt, then the two retries PROJECT.md section 7 allows. */
const MAX_ATTEMPTS = 3;

/**
 * How long the attempts together may take, and one attempt at most.
 *
 * Eight seconds an attempt was right when the route hosting this had
 * ten, and wrong since: every page that runs Ask Pinard now declares
 * maxDuration = 60. A management question is three hundred words, and
 * three hundred words do not generate in eight seconds.
 *
 * The attempts share one budget rather than each having a fixed
 * sixteen seconds. A fixed bound meant a slow first attempt failed the
 * whole answer while thirty seconds of the request were still unused
 * (3 October: "model call failed: Request timed out", once, and the
 * candidate was told Pinard was unavailable). Now a timed-out or
 * overloaded call is tried again for as long as the budget allows, and
 * an attempt may take up to thirty-six seconds when the budget has
 * them. Forty-eight seconds leaves the retrieval in front of it room
 * inside sixty.
 */
const CHAT_BUDGET_MS = 40000;
const CHAT_ATTEMPT_MAX_MS = 36000;
/** Not worth starting an attempt with less than this left. */
const CHAT_ATTEMPT_MIN_MS = 6000;
/** A scenario answer takes Opus twenty seconds or more; a retry for an
 *  unmanaged risk is not started with less than this left. */
const LOOSE_RETRY_MIN_MS = 18000;

/** A failure worth trying again: the model was slow or busy, not wrong. */
function isTransient(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 429 || status === 503 || status === 529 || (status !== undefined && status >= 500)) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return /timed out|timeout|econnreset|socket hang up|overloaded|unable to process/.test(message);
}

/**
 * The last pass over a reply before anyone reads it.
 *
 * The em dash is the one thing the model reaches for that this site
 * does not use anywhere — not in a question, not in an explanation,
 * not on a page. Asking for it again costs a whole second attempt and
 * sixteen seconds of a candidate's time for a punctuation mark, so it
 * is corrected here instead: between clauses it becomes a comma, which
 * is what it was standing in for.
 */
export function tidy(reply: string): string {
  return dropStagePreamble(reply)
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/([a-z])[—–]([a-z])/gi, "$1, $2")
    .replace(/,\s*,/g, ",");
}

/** The stage names prompt A lays a management answer out under. */
const STAGE =
  /^(Risks|Risk assessment|Risks to the mother|Risks to the baby|Effect of the condition on the pregnancy|Effect of pregnancy on the condition|Concern|Immediate management|Preconception|Booking|Antenatal|Watch for|Timing and mode of delivery|Intrapartum|Postpartum|Assessment|Investigations|Management|Follow-up|Where things stand|Options|Benefits|Alternatives|Supporting their decision|What applies|Applied to this case|What to do|Setting|Perception|Invitation|Knowledge|Emotions|Strategy and summary)$/;

/**
 * A management answer starts at its first stage.
 *
 * Told to choose its stages by where the question puts the woman, the
 * model announced the choice before every answer ("She is already in
 * the antenatal period, so the pathway runs from here forward"), and
 * kept doing it when told not to. The sentence carries nothing a
 * candidate needs, so a laid-out answer loses whatever comes before its
 * first stage name. An answer with no stage line is left alone.
 */
function dropStagePreamble(reply: string): string {
  const lines = reply.split("\n");
  const first = lines.findIndex((line) => STAGE.test(line.trim()));
  if (first <= 0) return reply;
  return lines.slice(first).join("\n");
}

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

/**
 * The reply's fixed shape: the same two fields prompts A and C ask for
 * as JSON, so the prompts stay as written in AI-PROMPTS.md.
 */
const REPLY_TOOL = {
  name: "give_reply",
  description:
    "Give your reply to the candidate. Put the whole answer, with its [chunk:N] citations, in reply.",
  input_schema: {
    type: "object" as const,
    properties: {
      reply: { type: "string", description: "The answer shown to the candidate, citing passages as [chunk:N]." },
      flag_for_review: {
        type: "boolean",
        description: "True only if the candidate has found a genuine inconsistency in the exam question.",
      },
    },
    required: ["reply", "flag_for_review"],
  },
};

/** A pregnancy answer's care stages, in the order of her journey (part 3). */
const JOURNEY = [
  "Preconception",
  "Booking",
  "Antenatal",
  "Timing and mode of delivery",
  "Intrapartum",
  "Postpartum",
] as const;
const NOT_COVERED = "not covered";

type ScenarioRisk = { risk: string; managed_in: string };

function riskItems(whose: "her" | "the baby") {
  return {
    type: "array",
    items: {
      type: "object",
      properties: {
        risk: {
          type: "string",
          description: `One short line: a risk factor or condition the question gives (age, BMI, smoking, ethnicity, parity, history, findings, a medical condition) and what it puts ${whose} at risk of, as the passages state, citing [chunk:N] or [aid:N]. NO FIGURES: name what it raises, not by how much (e.g. 'BMI 36: gestational diabetes, pre-eclampsia and VTE [chunk:12]'). No '- ' at the start.`,
        },
        managed_in: {
          type: "string",
          enum: [...JOURNEY, NOT_COVERED],
          description: `The stage of your reply that holds the action for this risk, or '${NOT_COVERED}' if the passages give no management for it (then name it in the closing line).`,
        },
      },
      required: ["risk", "managed_in"],
    },
  };
}

/**
 * The reply tool for a woman with risk factors or a medical condition
 * (shape 3). Told in words to open with her risk assessment, the model
 * went straight to Antenatal every time (owner's review, 10 October
 * 2026), so her risks are required fields of their own and the code puts
 * them first: risks to the mother apart from risks to the baby, as the
 * owner's brief sets out (part 3). Each names the stage where it is
 * managed, so a risk named and never acted on can be caught.
 */
const SCENARIO_REPLY_TOOL = {
  ...REPLY_TOOL,
  input_schema: {
    type: "object" as const,
    properties: {
      risks_to_mother: { ...riskItems("her"), minItems: 1 },
      risks_to_baby: riskItems("the baby"),
      reply: {
        type: "string",
        description:
          "The rest of the answer: every care stage from the one she is at through to Postpartum, by name, Intrapartum and Postpartum included, and Postpartum always giving contraception (or saying it is not covered). Do not repeat her risks. Every risk above gets its action in the stage you named for it.",
      },
      flag_for_review: REPLY_TOOL.input_schema.properties.flag_for_review,
    },
    required: ["risks_to_mother", "risks_to_baby", "reply", "flag_for_review"],
  },
};

/**
 * Close the loop (part 3): a risk said to be managed in a stage the
 * reply does not have was named and never acted on. A risk marked not
 * covered must be said to be so. Her overall management runs through
 * every stage from the one she is at (a booking answer with no
 * Intrapartum stage, in the first test), and contraception is always
 * given or said not to be covered.
 */
function openLoops(reply: string, risks: ScenarioRisk[], scenario: boolean): string[] {
  const stages = new Set(reply.split("\n").map((line) => line.trim()).filter((line) => STAGE.test(line)));
  const problems: string[] = [];
  if (!/contracepti/i.test(reply)) {
    problems.push("Postpartum gives no contraception: give it, or say in the closing line that it is not covered");
  }
  if (!scenario) return problems;
  const first = JOURNEY.findIndex((stage) => stages.has(stage));
  if (first >= 0) {
    const missing = JOURNEY.slice(Math.max(first, JOURNEY.indexOf("Antenatal"))).filter((stage) => !stages.has(stage));
    if (missing.length) {
      problems.push(`her overall management runs through every stage from hers, but your reply has no ${missing.join(" or ")} stage`);
    }
  }
  for (const { risk, managed_in } of risks) {
    const name = stripCitations(risk).slice(0, 80);
    if (!managed_in) continue;
    if (managed_in === NOT_COVERED) {
      if (!/not covered/i.test(reply)) problems.push(`"${name}" is marked not covered, but the closing line does not say so`);
    } else if (!stages.has(managed_in)) {
      problems.push(`"${name}" is managed in ${managed_in}, but your reply has no ${managed_in} stage: give its action there, or mark it not covered`);
    }
  }
  return problems;
}

function withProblems(message: string, problems: string[]): string {
  if (problems.length === 0) return message;
  return `${message}\n\nYOUR PREVIOUS REPLY WAS REJECTED: ${problems.join(
    "; "
  )}. Cite only passage ids that appear in the SOURCE PASSAGES above, write UK English, and respond with the JSON object only.`;
}

/**
 * A scenario's risks, as asked for: a list of {risk, managed_in}. Sometimes
 * sent as that list encoded as a string, or as plain lines.
 */
function riskList(value: unknown): ScenarioRisk[] {
  let list = value;
  if (typeof list === "string") {
    const text = list;
    try {
      list = JSON.parse(text);
    } catch {
      list = text.split(/\n+/);
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((item): ScenarioRisk | null => {
      if (typeof item === "string") return { risk: item, managed_in: "" };
      if (item && typeof item === "object" && typeof (item as ScenarioRisk).risk === "string") {
        const { risk, managed_in } = item as ScenarioRisk;
        return { risk, managed_in: typeof managed_in === "string" ? managed_in : "" };
      }
      return null;
    })
    .filter((r): r is ScenarioRisk => r !== null && r.risk.trim() !== "")
    .map((r) => ({ risk: r.risk.trim().replace(/^[-•]\s*/, ""), managed_in: r.managed_in.trim() }));
}

function parseReply(
  raw: string
): { reply: string; flag: boolean; risks: ScenarioRisk[] } | { parseError: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return { parseError: "reply was not JSON" };
  }
  const obj = parsed as {
    reply?: unknown;
    flag_for_review?: unknown;
    risks_to_mother?: unknown;
    risks_to_baby?: unknown;
  };
  if (typeof obj.reply !== "string" || obj.reply.trim() === "") {
    return { parseError: "reply field missing or empty" };
  }
  let reply = obj.reply.trim();
  const mother = riskList(obj.risks_to_mother);
  const baby = riskList(obj.risks_to_baby);
  const sections = [
    ["Risks to the mother", mother],
    ["Risks to the baby", baby],
  ] as const;
  const head = sections
    .filter(([, risks]) => risks.length > 0)
    .map(([name, risks]) => `${name}\n${risks.map((r) => `- ${r.risk}`).join("\n")}`)
    .join("\n\n");
  if (head) {
    // Drop any copy of the risk sections the model also put in the reply.
    const body = reply.replace(/^(?:Risks to the (?:mother|baby)\s*\n(?:- .*\n?)*\s*)+/i, "");
    reply = `${head}\n\n${body}`;
  }
  return { reply, flag: obj.flag_for_review === true, risks: [...mother, ...baby] };
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

/** A reply that failed only on figures or citations a line can be found by. */
export type Salvage = { reply: string; flagged: boolean; figures: string[]; chunks: number[]; aids: number[] };

/** More than this many lines at fault and the answer is not shown. */
const SALVAGE_MAX_LINES = 3;

/**
 * The last resort when there is no time for another attempt: the lines
 * carrying a figure no source states, or citing a passage or aid the
 * model was not given, are removed, never rewritten, as the line check
 * removes them. The owner's scenario was lost twice in the part 3 test
 * with every line but one sound ("1.5", in a 600-word answer, and no
 * time left to rewrite it).
 */
export function withoutUnsupportedLines(salvage: Salvage, trace: AskTrace | undefined): string {
  const figure = (f: string) => new RegExp(`(^|[^0-9.])${f.split(" ")[0].replace(/[.+%]/g, (c) => `\\${c}`)}($|[^0-9])`);
  const tests = salvage.figures.map(figure);
  const lines = salvage.reply.split("\n");
  const drop = new Set<number>();
  lines.forEach((line, at) => {
    const text = stripCitations(line);
    if (tests.some((t) => t.test(text))) drop.add(at);
    if (citedChunkIds(line).some((id) => salvage.chunks.includes(id))) drop.add(at);
    if (citedAidIds(line).some((id) => salvage.aids.includes(id))) drop.add(at);
  });
  if (drop.size === 0 || drop.size > SALVAGE_MAX_LINES) return "";
  for (const at of drop) trace?.removed?.push(`${lines[at].trim().slice(0, 120)}: no source states it, and there was no time to rewrite`);
  return withoutEmptyStages(lines.filter((_, at) => !drop.has(at)));
}

/** A stage left with nothing under it goes too. */
function withoutEmptyStages(lines: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (STAGE.test(line)) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j >= lines.length || STAGE.test(lines[j].trim())) continue;
    }
    out.push(lines[i]);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
  /** Decision aids the reply may cite as [aid:N] (Ask Pinard on Today). */
  aidIds?: Set<number>;
  /** The passages' text and what the candidate was shown or asked: the
   *  only places a figure in the reply may come from. */
  figureSources: string[];
  trace?: AskTrace;
  /** Longer than this goes back; the default suits the longest shapes. */
  maxWords?: number;
  /** A scenario's reply carries its risks as fields, each tied to a stage. */
  scenario?: boolean;
  /** How a condition is managed in pregnancy: contraception is still due. */
  pregnancy?: boolean;
  /** The answering model, when not the configured one (comparisons). */
  model?: string;
}): Promise<
  | { ok: true; reply: string; flagged: boolean }
  | { ok: false; reason: string; raw: string; kind: FailureKind }
> {
  /*
    Bounded for the same reason the plan narrative is: the SDK left
    alone will spend ten minutes and two retries before it reports
    anything. Failing inside the budget is what lets the honest
    "unavailable" message reach the candidate instead of a Gateway
    Timeout. The SDK's own retries stay off; the loop below retries,
    and knows how much time is left.
  */
  let model = params.model ?? askModel();
  const fallback = claudeModel();
  const history = normaliseHistory(params.history);
  const deadline = Date.now() + CHAT_BUDGET_MS;

  let lastRaw = "";
  let lastProblems: string[] = [];
  let lastError = "";
  /** A reply that passed every check but close-the-loop. */
  let acceptable: { reply: string; flagged: boolean } | null = null;
  /** A reply whose only faults are lines that can be named and removed. */
  let salvage: Salvage | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const left = deadline - Date.now();
    if (left < CHAT_ATTEMPT_MIN_MS) break;
    const client = claudeClient({
      maxRetries: 0,
      timeout: Math.min(CHAT_ATTEMPT_MAX_MS, left),
    });
    let raw = "";
    const started = Date.now();
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 2000,
        // The instructions are the same on every question: cached, they
        // are paid for in full once every few minutes, not every time.
        system: cacheableSystem(params.system, model),
        // The reply comes back through a forced tool call, so its shape
        // is the API's to guarantee (pricing fix A, 10 October 2026).
        // Asked for as text, the model often wrote a good answer in
        // plain prose, which failed JSON parsing and was paid for again:
        // half of all open questions took two calls.
        tools: [params.scenario ? SCENARIO_REPLY_TOOL : REPLY_TOOL],
        tool_choice: { type: "tool", name: REPLY_TOOL.name },
        messages: [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          {
            role: "user" as const,
            content: withProblems(params.userMessage, lastProblems),
          },
        ],
      });
      if (params.trace) {
        params.trace.inputTokens = (params.trace.inputTokens ?? 0) + (response.usage?.input_tokens ?? 0);
        params.trace.outputTokens = (params.trace.outputTokens ?? 0) + (response.usage?.output_tokens ?? 0);
        params.trace.cacheReadTokens = (params.trace.cacheReadTokens ?? 0) + (response.usage?.cache_read_input_tokens ?? 0);
        params.trace.cacheWriteTokens = (params.trace.cacheWriteTokens ?? 0) + (response.usage?.cache_creation_input_tokens ?? 0);
        params.trace.model = model;
      }
      const tool = response.content.find((block) => block.type === "tool_use");
      raw =
        tool && tool.type === "tool_use"
          ? JSON.stringify(tool.input)
          : response.content
              .map((block) => (block.type === "text" ? block.text : ""))
              .join("")
              .trim();
    } catch (error) {
      params.trace?.modelMs.push(Date.now() - started);
      lastError = error instanceof Error ? error.message : String(error);
      /* Opus has a small daily token quota on this account: refused or
         over it, the rest of the attempts go to Sonnet rather than the
         candidate being told Pinard is unavailable. */
      if (model !== fallback && /too many tokens|throttl|quota|rate.?limit|429|not available|403/i.test(lastError)) {
        model = fallback;
        continue;
      }
      // Slow or busy is worth another try while there is time for one;
      // anything else (a bad credential, a refused request) is not.
      if (isTransient(error)) continue;
      break;
    }

    params.trace?.modelMs.push(Date.now() - started);
    lastRaw = raw;
    const parsed = parseReply(raw);
    if ("parseError" in parsed) {
      lastProblems = [parsed.parseError];
      params.trace?.problems.push(lastProblems);
      continue;
    }

    // Spelling is corrected, not sent back: see ukEnglishCorrected.
    const reply = ukEnglishCorrected(parsed.reply);

    // A reply with no citations at all is legitimate — the refusal line
    // cites nothing — so only what IS cited is checked.
    const problems: string[] = [];
    const invalid = citedChunkIds(reply).filter(
      (id) => !params.retrievedIds.has(id)
    );
    if (invalid.length > 0) {
      problems.push(
        `cited passages not in the retrieved set: ${invalid.join(", ")}`
      );
    }
    const badAids = citedAidIds(reply).filter((id) => !params.aidIds?.has(id));
    if (badAids.length > 0) problems.push(`cited decision aids you were not given: ${badAids.join(", ")}`);
    /* A revision answer read on a phone between cases: the prompt sets
       300 or 500 words by kind of question, and the model will run to 750
       when it has two dozen passages in front of it (owner's review, 10
       October 2026). Far over the longest limit goes back. */
    const words = stripCitations(reply).split(/\s+/).filter(Boolean).length;
    const maxWords = params.maxWords ?? MAX_REPLY_WORDS;
    /* Too long goes back when there is time to shorten it, like a loop
       left open below, and otherwise stands: the owner's scenario, at
       691 words, was lost when its rewrite ran out of time (part 3
       test, 2 November 2026). */
    const loose: string[] = [];
    if (words > maxWords) {
      loose.push(
        `the answer is ${words} words, over the limit for this kind of question; cut it to about ${Math.round(maxWords * 0.75)} words, keeping only the points that would be marked for this question, one short sentence each`
      );
    }
    /*
      The same check every explanation in the bank passes: each figure
      in the answer must be in a passage it was given or in what the
      candidate was shown. A dose, a risk or a gestation the model
      supplied from memory is the hallucination most likely to be
      learned and repeated, and the citation check cannot see it, since
      a made-up figure can sit beside a perfectly real [chunk:N].
    */
    const figureProblems = figureGroundingProblems(stripCitations(reply), params.figureSources).map(
      (p) => p.replace("the explanation states", "the answer states")
    );
    problems.push(...figureProblems);

    if (params.scenario || params.pregnancy) loose.push(...openLoops(reply, parsed.risks, Boolean(params.scenario)));
    if (problems.length > 0 || loose.length > 0) {
      lastProblems = [...problems, ...loose];
      params.trace?.problems.push(lastProblems);
      if (problems.length === 0) {
        /* A risk left unmanaged, or an answer too long, is worth another
           attempt when there is time for one, never worth losing an
           otherwise sound answer. */
        acceptable = { reply: tidy(reply), flagged: parsed.flag };
        if (deadline - Date.now() < LOOSE_RETRY_MIN_MS) break;
      } else {
        const figures = figureProblems
          .map((p) => /states "([^"]+)"/.exec(p)?.[1])
          .filter((f): f is string => Boolean(f));
        // Only lines with a figure or a citation that can be pointed to.
        if (figures.length === figureProblems.length) {
          salvage = { reply, flagged: parsed.flag, figures, chunks: invalid, aids: badAids };
          if (deadline - Date.now() < LOOSE_RETRY_MIN_MS) break;
        }
      }
      continue;
    }

    return { ok: true, reply: tidy(reply), flagged: parsed.flag };
  }

  if (acceptable) return { ok: true, ...acceptable };
  if (salvage) {
    const pruned = withoutUnsupportedLines(salvage, params.trace);
    if (pruned) return { ok: true, reply: tidy(pruned), flagged: salvage.flagged };
  }
  if (lastError && !lastRaw) {
    return {
      ok: false,
      reason: `chat: model call failed: ${lastError}`,
      raw: "",
      kind: "unavailable",
    };
  }
  return {
    ok: false,
    kind: "unsupported" as const,
    reason: `chat: verification failed, ${lastProblems.join("; ") || lastError}`,
    raw: lastRaw,
  };
}

/**
 * Searching a scenario issue by issue (owner's review, 10 October 2026).
 *
 * One search for a whole scenario finds the passages nearest its most
 * obvious topic and nothing else: a 36-year-old smoker with a BMI of 36
 * and a previous DVT came back with twelve passages on VTE and age, and
 * so an answer on VTE alone, with pre-eclampsia, gestational diabetes,
 * smoking and haemorrhage never in front of the model. Now a short first
 * call lists the issues a complete answer must cover (each risk factor
 * and what it raises, each decision asked, any consent or legal frame)
 * with a search for each, and every search is run.
 *
 * The plan uses the model's knowledge only to decide WHAT TO LOOK UP.
 * Nothing it says reaches the candidate: the answer is still written
 * from the passages found, and every figure and citation checked.
 *
 * Only for questions long enough to be a scenario; a one-line question
 * has one issue, and the extra call would only add a second.
 */
const PLAN_MIN_WORDS = 18;
const PLAN_MAX_ISSUES = 7;
const PASSAGES_PER_ISSUE = 3;
const SCENARIO_PASSAGES = 16;
/** A long scenario's plan (seven issues and its aids) took 7.5 s in the part 3
 *  test; past this the answer loses its aids and its issue searches. */
const PLAN_TIMEOUT_MS = 10000;
/** Decision aids an answer may follow (owner's approved aids, part 3). */
const PLAN_MAX_AIDS = 5;
/** Entries of the legal index an answer may apply (part 4). */
const PLAN_MAX_LEGAL = 6;

const PLAN_TOOL = {
  name: "plan_search",
  description: "List the issues a complete answer must address, each with a search query.",
  input_schema: {
    type: "object" as const,
    properties: {
      kind: {
        type: "string",
        enum: ["single_fact", "condition_in_pregnancy", "scenario", "gynaecology", "presentation", "counselling", "bad_news", "legal"],
        description:
          "single_fact: one risk, threshold, dose or decision. condition_in_pregnancy: how a condition is managed in pregnancy, in general. scenario: how a PREGNANCY with several risk factors should be managed (e.g. at booking). gynaecology: how a gynaecological condition is assessed or managed, in general. presentation: a woman presenting with a symptom or finding, and what to do now (e.g. '46, heavy bleeding, BMI 40: appropriate management'). counselling: counselling, consent or discussing options or a result. bad_news: breaking bad news. legal: what the law or a professional regulator says, or the legal position in a case (e.g. 'a 15-year-old asks for contraception: what is the legal position?').",
      },
      issues: {
        type: "array",
        maxItems: PLAN_MAX_ISSUES,
        items: {
          type: "object",
          properties: {
            issue: { type: "string", description: "The issue in a few words, e.g. 'BMI 36: pre-eclampsia risk'." },
            query: { type: "string", description: "A search query in UK guideline language, e.g. 'aspirin prophylaxis pre-eclampsia risk factors'." },
          },
          required: ["issue", "query"],
        },
      },
      aids: {
        type: "array",
        maxItems: PLAN_MAX_AIDS,
        items: { type: "integer" },
        description: "The numbers of the DECISION AIDS (from the list) that apply to this question or to this woman's risk factors or condition, most important first. None if none applies.",
      },
      legal: {
        type: "array",
        maxItems: PLAN_MAX_LEGAL,
        items: { type: "integer" },
        description: "The numbers of the LEGAL INDEX entries (from the list) that bear on this question or this woman's case, most important first. None if no legal point arises.",
      },
    },
    required: ["kind", "issues", "aids", "legal"],
  },
};

const PLAN_PROMPT = `You plan the searches for an MRCOG Part 2 revision answer. You do not answer the question.

List the issues the answer must address, most important first, at most ${PLAN_MAX_ISSUES}, and ONLY within the step the question asks about. For a woman presenting with a symptom ("what is the appropriate management"), that is what the presentation raises and the first investigations, not treatment that depends on their results. For a result being discussed, it is the options now, not what follows them.

Within that scope:
- each risk factor the question gives (age, BMI, ethnicity, smoking, parity, history, findings) and what it puts her at risk of in UK guidance, e.g. "BMI 36: pre-eclampsia, gestational diabetes, VTE";
- each decision or management step the question asks about;
- when the question asks how a pregnancy with risk factors or a medical condition is managed: the effect of the condition on the pregnancy and of pregnancy on the condition; the timing and mode of birth; what her care in labour needs (e.g. anticoagulation timed around regional anaesthesia and birth, haemorrhage risk); and her follow-up after birth, with contraception;
- for counselling, consent or breaking bad news: the options to discuss, and any legal or professional frame that applies (e.g. GMC decision making and consent, grounds under the Abortion Act).

For each, write a short search query in the language of UK guidance (RCOG, NICE, GMC). Say also what kind of question it is.

Then choose the DECISION AIDS that apply: the flowcharts and tables, approved by a consultant, that decide something this question asks or that this woman's risk factors or condition call for (e.g. a VTE risk assessment for a woman with risk factors for VTE; the timing-of-birth table for pre-eclampsia; the UKMEC table for her contraception after birth when a condition or history bears on it). Where a guideline has both a list of risk factors and the chart or scoring table that turns them into a decision, choose the chart: it is the one that says what to do. Only aids that genuinely apply; none is a good answer when none does.

Then choose the LEGAL INDEX entries, if a list follows. When the question asks about legal or professional aspects, choose every entry that bears on it. When the case raises a legal point without asking (a woman declining blood, a girl under 16, doubt about capacity, a request for termination, FGM, safeguarding, a death to report), choose those entries too. A question with no legal point gets none. Respond only through the tool.`;

type PlannedIssue = { issue: string; query: string };
type QuestionKind =
  | "single_fact"
  | "condition_in_pregnancy"
  | "scenario"
  | "gynaecology"
  | "presentation"
  | "counselling"
  | "bad_news"
  | "legal";
type Plan = { kind: QuestionKind | null; issues: PlannedIssue[]; aids: number[]; legal: number[] };

/**
 * The answer's layout, chosen here rather than by the model, which left
 * to itself put a counselling question under headings of its own and a
 * many-sided scenario in the layout for one condition (owner's review).
 * A short question is not planned, so counselling and bad news are also
 * recognised from their wording.
 */
const SHAPES: Record<QuestionKind, { n: number; name: string; stages: string | null; maxWords: number }> = {
  /* Limits from the owner's second review (11 October 2026): "relevant,
     correct, concise". maxWords is where a reply goes back, about a
     third over the limit the prompt sets. */
  single_fact: { n: 1, name: "a single fact, threshold or decision", stages: null, maxWords: 140 },
  /* Shapes 2 and 3 follow the owner's brief (part 3, November 2026): the
     condition's effect both ways, risks to mother and baby apart, and
     the journey from preconception to postpartum. Two more stages
     (Booking, Timing and mode of delivery) and contraception always
     need more words than before. */
  condition_in_pregnancy: {
    n: 2,
    name: "how a condition is managed in pregnancy",
    stages: `Effect of the condition on the pregnancy, Effect of pregnancy on the condition, then those of ${JOURNEY.join(", ")} that apply`,
    maxWords: 400,
  },
  scenario: {
    n: 3,
    name: "a pregnancy with risk factors or a medical condition",
    stages: `${JOURNEY.join(", ")}, from the stage she is at (her risks go in their own fields)`,
    /* Not three bullets a stage: a complex pregnancy capped at three
       dropped the actions for risks it had named (owner's scenario, 11
       October 2026: diabetes, blood pressure and growth named, none
       managed). Sent back above 750; the prompt asks for 550, the journey's two
       extra stages and contraception included (part 3 test: 691 and 767
       words against a limit of 650). */
    maxWords: 750,
  },
  gynaecology: { n: 4, name: "a gynaecological condition", stages: "those of Assessment, Investigations, Management, Follow-up asked for", maxWords: 270 },
  presentation: {
    n: 5,
    name: "a woman presenting with a symptom or finding, what to do now",
    stages: "Concern, Investigations, and Immediate management only if something must be done now",
    maxWords: 270,
  },
  counselling: {
    n: 6,
    name: "counselling or consent",
    stages: "Where things stand, Options, Benefits, Risks, Alternatives, Supporting their decision",
    maxWords: 460,
  },
  bad_news: {
    n: 7,
    name: "breaking bad news",
    stages: "Setting, Perception, Invitation, Knowledge, Emotions, Strategy and summary",
    maxWords: 460,
  },
  legal: {
    n: 8,
    name: "a legal or professional question",
    stages: "What applies, Applied to this case, What to do",
    maxWords: 420,
  },
};

function kindFromWording(message: string): QuestionKind | null {
  if (/\b(break(ing)?\s+(the\s+)?(bad\s+)?news|bad news)\b/i.test(message)) return "bad_news";
  // "The legal position on consent" is a legal question: the plan decides.
  if (/\b(counsel|counselling|consent|what (would|should|do) you (discuss|say|tell))/i.test(message) && !/\b(legal|legally|lawful|the law)\b/i.test(message)) return "counselling";
  return null;
}

/*
 * Every question is planned now, short ones too: the plan also chooses the
 * decision aids the answer follows, and a one-line question ("when should
 * a woman with a mechanical valve switch to LMWH?") is often exactly what
 * an aid decides. A short question's issues are not searched separately;
 * its own search is enough.
 */
async function planSearches(message: string, legalIndex: LegalEntry[]): Promise<Plan> {
  const worded = kindFromWording(message);
  const short = message.trim().split(/\s+/).length < PLAN_MIN_WORDS;
  const { catalogue } = await approvedAidCatalogue();
  try {
    const client = claudeClient({ maxRetries: 0, timeout: PLAN_TIMEOUT_MS });
    const system = [
      PLAN_PROMPT,
      ...(catalogue ? [`DECISION AIDS (number. source: title — the decision it guides | who it applies to):\n${catalogue}`] : []),
      ...(legalIndex.length ? [`LEGAL INDEX (number. name — what it establishes | what it bears on):\n${legalCatalogue(legalIndex)}`] : []),
    ].join("\n\n");
    const response = await client.messages.create({
      model: fastModel(),
      max_tokens: 600,
      // The catalogue is the same on every question: cached, it is paid for in full once every few minutes.
      system: cacheableSystem(system, fastModel()),
      tools: [PLAN_TOOL],
      tool_choice: { type: "tool", name: PLAN_TOOL.name },
      messages: [{ role: "user", content: message }],
    });
    const tool = response.content.find((block) => block.type === "tool_use");
    const input = (tool && tool.type === "tool_use" ? tool.input : {}) as { kind?: string; issues?: PlannedIssue[]; aids?: unknown[]; legal?: unknown[] };
    const kind = (input.kind && input.kind in SHAPES ? input.kind : null) as QuestionKind | null;
    const issues = short
      ? []
      : (input.issues ?? [])
          .filter((i) => i && typeof i.query === "string" && i.query.trim())
          .slice(0, PLAN_MAX_ISSUES)
          .map((i) => ({ issue: String(i.issue ?? "").slice(0, 120), query: i.query.slice(0, 200) }));
    const aids = [...new Set((input.aids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, PLAN_MAX_AIDS);
    const legal = [...new Set((input.legal ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, PLAN_MAX_LEGAL);
    /* Contraception is always part of her postnatal care (part 3), and
       the plan seldom searched for it: both test scenarios came back
       with "contraception not covered" for want of a passage on it. */
    const journey = !worded && (kind === "scenario" || kind === "condition_in_pregnancy");
    if (journey && !issues.some((i) => /contracept/i.test(`${i.issue} ${i.query}`))) {
      /* Plainly worded: with her first issue appended ("...UKMEC: Rh D
         alloimmunisation") the search found five anti-D passages and no
         contraception at all. */
      issues.push({ issue: "contraception after birth", query: "contraception after childbirth: which methods and when to start after birth" });
    }
    // Wording that plainly says counselling or bad news wins.
    return { kind: worded ?? kind, issues, aids, legal };
  } catch {
    // A plan is a help, not a dependency: without one, the single
    // search runs as it always has.
    return { kind: worded, issues: [], aids: [], legal: [] };
  }
}

/** The question's own search, then one per planned issue, merged. */
async function retrieveForScenario(
  message: string,
  issues: PlannedIssue[]
): Promise<RetrievedChunk[]> {
  if (issues.length === 0) return retrieveChunks(message, null, LIBRARY_PASSAGES);
  const results = await retrieveMany([
    { query: message, count: 6 },
    ...issues.map((i) => ({ query: i.query, count: PASSAGES_PER_ISSUE })),
  ]);
  const seen = new Set<number>();
  const merged: RetrievedChunk[] = [];
  // Round-robin, so every issue keeps its best passages under the cap.
  for (let rank = 0; merged.length < SCENARIO_PASSAGES; rank++) {
    let added = false;
    for (const list of results) {
      const chunk = list[rank];
      if (!chunk) continue;
      added = true;
      if (seen.has(chunk.chunk_id)) continue;
      seen.add(chunk.chunk_id);
      merged.push(chunk);
      if (merged.length >= SCENARIO_PASSAGES) break;
    }
    if (!added) break;
  }
  return merged;
}

/**
 * The second check: every line read against the passages it cites
 * (owner's review, 11 October 2026: accuracy over speed).
 *
 * The citation and figure checks above catch a passage the model never
 * saw and a number it made up. They cannot catch a real passage misread:
 * Opus wrote that duodenal atresia is seen in a third of babies with
 * trisomy 21, from a passage saying a third of babies with duodenal
 * atresia have trisomy 21. Same words, same "one-third", opposite
 * meaning. Nor can they catch a true line that is beside the point.
 *
 * So a second model reads each line beside its cited passages and names
 * the lines that are not supported with the same meaning, or do not
 * answer this question for this woman. Those lines are removed, never
 * rewritten: anything it wrote would be one more unchecked sentence.
 * If the check itself fails, the answer stands as the other checks left
 * it.
 */
const CHECK_TIMEOUT_MS = 20000;
/** The live page allows 60 seconds in all; the check gets what is left
 *  of 56, and is skipped below 6. */
const ANSWER_BUDGET_MS = 56000;
const CHECK_MIN_MS = 6000;

const CHECK_TOOL = {
  name: "report_lines",
  description: "Report which numbered lines must be removed, and why.",
  input_schema: {
    type: "object" as const,
    properties: {
      remove: {
        type: "array",
        items: {
          type: "object",
          properties: {
            line: { type: "integer", description: "The line number." },
            reason: { type: "string", description: "Why, in a few words." },
          },
          required: ["line", "reason"],
        },
      },
    },
    required: ["remove"],
  },
};

const CHECK_PROMPT = `You check an MRCOG revision answer, line by line, before a candidate sees it. You do not rewrite anything.

For each numbered line, decide whether it must be REMOVED. Remove a line only when you are sure ANY of these is true:
1. NOT SUPPORTED: a fact it STATES is in none of the passages given, or is stated there with a different meaning. A fact found in any passage given counts as supported, even if the line cites a different one; a citation slip is not a reason to remove. Watch for reversals: "a third of babies with X have Y" is not "X occurs in a third of babies with Y". Watch for a figure attached to the wrong group, outcome or gestation.
2. NOT FOR HER: it applies to a group she is not in, or a threshold she does not meet (age, BMI, gestation, menopausal status), or says it does not apply to her. That includes a line taken from a source written for a narrower group than hers, which its title shows (a care pathway for women aged 45 or over, applied to a woman of 40). Before removing a line for a threshold, compare her figure with it as numbers: 36 is over 35, so "age > 35" applies to a woman of 36.
3. NOT THIS STEP: it answers something the question did not ask (a later step, a different decision), or is padding that would earn no mark.

A line beginning "Guidance differs:" is wanted wherever two sources disagree: keep it if both positions are in the passages or decision aids. Judge only what a line states, never what it leaves out: a line is not removed for omitting an option or a detail, or for a small difference of wording ("should be offered" against "is required"). Keep a line that is supported and on the point even if you would have phrased it differently, and keep it whenever you are unsure: removing a correct line costs the candidate as much as keeping a wrong one. Lines that only say what is not covered by the sources are kept. Respond only through the tool; an empty list means every line stands.`;

async function checkLines(
  question: string,
  reply: string,
  passages: RetrievedChunk[],
  aids: ApprovedAid[],
  trace: AskTrace | undefined,
  timeLeftMs: number,
  /** The question asks for her overall management (shapes 2 and 3). */
  overall = false
): Promise<string> {
  if (timeLeftMs < CHECK_MIN_MS) {
    trace?.removed?.push("(check skipped: no time left)");
    return reply;
  }
  const lines = reply.split("\n");
  const numbered: { n: number; at: number }[] = [];
  lines.forEach((line, at) => {
    if (/^- /.test(line.trim()) || (line.trim() && !STAGE.test(line.trim()) && /\[(chunk|aid):\d+\]/.test(line))) {
      numbered.push({ n: numbered.length + 1, at });
    }
  });
  if (numbered.length === 0) return reply;

  // Every passage the answer was written from, not only those it cites:
  // a right fact cited to the wrong passage is a citation slip, not a
  // misreading, and should not cost the candidate the fact.
  /* The preconception test lost its plan for the pregnancy to this check
     ("not this step"), where the brief asks for that plan. */
  const scope = overall
    ? "SCOPE: this question asks for her overall management, so every stage from where she is through to after birth is asked for (a preconception question includes the plan for the pregnancy), and contraception after birth is always part of it. A line is not NOT THIS STEP for belonging to a later stage or for being about contraception.\n\n"
    : "";
  const message =
    `QUESTION:\n${question}\n\n${scope}${aids.length ? `DECISION AIDS (approved by a consultant; as good a source as a passage):\n${formatAids(aids)}\n\n` : ""}PASSAGES:\n${formatPassages(passages, { titles: true })}\n\nANSWER, NUMBERED:\n` +
    numbered.map(({ n, at }) => `${n}. ${lines[at].trim()}`).join("\n");

  try {
    const response = await claudeClient({ maxRetries: 0, timeout: Math.min(CHECK_TIMEOUT_MS, timeLeftMs) }).messages.create({
      model: claudeModel(),
      max_tokens: 800,
      system: CHECK_PROMPT,
      tools: [CHECK_TOOL],
      tool_choice: { type: "tool", name: CHECK_TOOL.name },
      messages: [{ role: "user", content: message }],
    });
    if (trace) {
      trace.checkInputTokens = response.usage?.input_tokens ?? 0;
      trace.checkOutputTokens = response.usage?.output_tokens ?? 0;
    }
    const tool = response.content.find((block) => block.type === "tool_use");
    const removals = ((tool && tool.type === "tool_use" ? tool.input : {}) as {
      remove?: { line?: number; reason?: string }[];
    }).remove ?? [];
    const drop = new Set<number>();
    for (const r of removals) {
      const hit = numbered.find((x) => x.n === Number(r.line));
      if (!hit) continue;
      drop.add(hit.at);
      trace?.removed?.push(`${lines[hit.at].trim().slice(0, 120)}: ${String(r.reason ?? "").slice(0, 200)}`);
    }
    // Never strip an answer to nothing: if every line failed, the answer
    // is withheld by the caller rather than shown hollow.
    if (drop.size >= numbered.length) return "";
    return withoutEmptyStages(lines.filter((_, at) => !drop.has(at)));
  } catch {
    return reply;
  }
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
  trace?: AskTrace;
  /** Answer with this model instead of the configured one (comparisons). */
  model?: string;
  /** Use these entries instead of the approved ones (comparisons). */
  legalIndex?: LegalEntry[];
}): Promise<ChatOutcome> {
  let passages: RetrievedChunk[] = [];
  let aids: ApprovedAid[] = [];
  const answerStarted = Date.now();
  const retrievalStarted = Date.now();
  const legalIndex = params.legalIndex ?? (await approvedLegalEntries());
  const plan = await planSearches(params.message, legalIndex);
  const legal = plan.legal.map((id) => legalIndex.find((e) => e.id === id)).filter((e): e is LegalEntry => Boolean(e));
  if (params.trace) params.trace.planMs = Date.now() - retrievalStarted;
  const issues = plan.issues;
  const shape = plan.kind ? SHAPES[plan.kind] : null;
  try {
    /* Once more on failure: the one recorded retrieval fault (2 October,
       "canceling statement due to statement timeout") was a cold index,
       and the second search of a cold index is a warm one. */
    [passages, aids] = await Promise.all([
      retrieveForScenario(params.message, issues).catch(() => retrieveChunks(params.message, null, LIBRARY_PASSAGES)),
      getApprovedAids(plan.aids).catch(() => [] as ApprovedAid[]),
    ]);
    passages = [...passages, ...(await legalPassages(legal, params.message, passages).catch(() => []))];
    passages = await withYears(passages).catch(() => passages);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `chat: retrieval failed: ${detail}`,
      raw: "",
      kind: "unavailable",
    };
  }
  if (params.trace) {
    params.trace.issues = [
      ...(plan.kind ? [`kind: ${plan.kind}`] : []),
      ...issues.map((i) => i.issue),
      ...aids.map((a) => `decision aid ${a.id}: ${a.title.slice(0, 80)} (${a.source.slice(0, 50)})`),
      ...legal.map((e) => `legal index ${e.id}: ${e.name.slice(0, 80)}`),
    ];
    params.trace.retrievalMs = Date.now() - retrievalStarted;
    params.trace.passages = passages.map((p) => ({
      chunk_id: p.chunk_id,
      title: p.document_title,
      reference: p.source_reference,
      similarity: Math.round(p.similarity * 1000) / 1000,
    }));
  }
  if (passages.length === 0) {
    return {
      ok: false,
      reason: "chat: retrieval returned no passages",
      raw: "",
      kind: "unsupported",
    };
  }

  if (params.trace) params.trace.removed = [];
  /* A case that raises a legal point without asking for it: given the
     entries alone, the owner's scenario answered everything but the
     legal position on declining blood. Named as an issue, it is covered. */
  const asked = [
    ...issues.map((i) => i.issue),
    ...(legal.length && plan.kind !== "legal" ? ["the legal position her case raises, in the stage where it arises, each law applied to her in a line"] : []),
  ];
  const outcome = await runGroundedChat({
    system: PROMPT_G + "\n\n" + PROMPT_A,
    userMessage:
      (aids.length
        ? `DECISION AIDS (flowcharts and tables from the guidelines, transcribed as drawn and approved by a consultant obstetrician; where one applies to this woman, follow it exactly, its categories, thresholds, timings and actions, and cite it as [aid:N]):\n${formatAids(aids)}\n\n`
        : "") +
      (legal.length
        ? `LEGAL INDEX (the laws, cases and professional standards that bear on this question, and what each establishes; apply those that do to her case, citing the passages):\n${formatLegal(legal)}\n\n`
        : "") +
      `SOURCE PASSAGES:\n${formatPassages(passages, { titles: true })}\n\nCANDIDATE'S QUESTION:\n${params.message}` +
      (asked.length
        ? `\n\nISSUES THIS QUESTION RAISES (cover each one the passages cover, and say plainly which are not covered):\n${asked.map((i) => `- ${i}`).join("\n")}`
        : "") +
      (shape
        ? `\n\nUSE SHAPE ${shape.n} (${shape.name}).` +
          (shape.stages
            ? ` Its stages, by exactly these names and in this order: ${shape.stages}. The first line of your reply is the first stage name.`
            : "") +
          ` Leave out any recommendation whose threshold she does not meet, without mentioning it. ` +
          (plan.kind === "scenario"
            ? `Every risk to the mother and to the baby gets its action in the stage you named for it, or is named in the closing line as not covered. As many bullets a stage as that needs, about ${Math.round(shape.maxWords * 0.73)} words in all.`
            : `At most three bullets a stage, about ${Math.round(shape.maxWords * 0.75)} words in all.`)
        : ""),
    maxWords: shape?.maxWords ?? MAX_REPLY_WORDS,
    scenario: plan.kind === "scenario",
    pregnancy: plan.kind === "condition_in_pregnancy",
    model: params.model,
    history: params.history,
    retrievedIds: new Set(passages.map((p) => p.chunk_id)),
    aidIds: new Set(aids.map((a) => a.id)),
    // The years too: a "Guidance differs:" line gives each body's year.
    figureSources: [...passages.map((p) => `${p.text} ${p.source_year ?? ""}`), ...aids.map((a) => `${a.text} ${a.reference}`), params.message],
    trace: params.trace,
  });
  if (!outcome.ok) return outcome;

  const checked = await checkLines(
    params.message,
    outcome.reply,
    passages,
    aids,
    params.trace,
    ANSWER_BUDGET_MS - (Date.now() - answerStarted),
    plan.kind === "scenario" || plan.kind === "condition_in_pregnancy"
  );
  if (!checked) {
    return {
      ok: false,
      reason: "chat: the line-by-line check found no line it could stand behind",
      raw: outcome.reply,
      kind: "unsupported",
    };
  }

  const cited = new Set(citedAidIds(checked));
  const aidSources: ChatSource[] = aids
    .filter((a) => cited.has(a.id))
    .map((a) => ({ chunk_id: -a.id, title: a.source, reference: a.reference }));
  return {
    ok: true,
    reply: checked,
    sources: dedupeSources([...aidSources, ...(await sourcesFor(citedChunkIds(checked)))]),
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
  /*
    Both at once. They need nothing from each other, and they were
    queued only because they were written in the order they are read.
    Retrieval is an embedding call and a vector search — measured at
    about 830ms warm and 6.8s on a cold index — while the question's own
    passages are a primary-key read at about 150ms. Waiting for the
    second before starting the first cost the whole of it: measured
    6975ms sequential against 3587ms together on a cold index, and
    1922ms against 1237ms warm.
  */
  const [cited, retrieved] = await Promise.all([
    getChunksByIds(params.question.citation_chunk_ids),
    // Retrieval is the extra, not the floor: without it the question's
    // own passages still answer most follow-ups.
    retrieveChunks(params.message, null, FOLLOW_UP_PASSAGES).catch(
      (): RetrievedChunk[] => []
    ),
  ]);

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
      kind: "unsupported",
    };
  }

  const outcome = await runGroundedChat({
    system: PROMPT_G + "\n\n" + PROMPT_C,
    userMessage: `${questionBlock(params.question)}

SOURCE PASSAGES:
${formatPassages(await withYears(passages).catch(() => passages), { titles: true })}

CANDIDATE'S FOLLOW-UP QUESTION:
${params.message}`,
    history: params.history,
    retrievedIds: new Set(passages.map((p) => p.chunk_id)),
    figureSources: [
      ...passages.map((p) => p.text),
      questionBlock(params.question),
      params.message,
    ],
  });
  if (!outcome.ok) return outcome;

  return {
    ok: true,
    reply: outcome.reply,
    sources: await sourcesFor(citedChunkIds(outcome.reply)),
    flagged: outcome.flagged,
  };
}
