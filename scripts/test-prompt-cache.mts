/**
 * What gets a cache breakpoint, and what deliberately does not.
 *
 * The API is on hold, so none of this can be confirmed against a live
 * call. What can be confirmed is the shape of the request and, more to
 * the point, that the prompts this app actually sends are long enough
 * for a breakpoint to do anything: below 1024 tokens a cache_control
 * block is accepted and silently ignored, which would look like
 * caching while changing nothing.
 *
 *   npx tsx scripts/test-prompt-cache.mts
 */

import { attemptContent, cacheableSystem, withPreviousProblems } from "../src/lib/generation";
import { PROMPT_G, PROMPT_Q, PROMPT_Q_EMQ, PROMPT_A } from "../src/lib/prompts";

const SONNET = "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5-20251001";

type Case = {
  name: string;
  text: string;
  model: string;
  expect: "cached" | "plain";
};

const sbaSystem = PROMPT_G + "\n\n" + PROMPT_Q;
const emqSystem = PROMPT_G + "\n\n" + PROMPT_Q_EMQ;
const chatSystem = PROMPT_G + "\n\n" + PROMPT_A;

const cases: Case[] = [
  { name: "SBA generation system prompt", text: sbaSystem, model: SONNET, expect: "cached" },
  { name: "EMQ generation system prompt", text: emqSystem, model: SONNET, expect: "cached" },
  {
    /* Was under Sonnet's minimum and left plain; the part 3 reasoning
       framework (November 2026) took it over, so it is cached now. */
    name: "chat system prompt, long enough to cache since part 3",
    text: chatSystem,
    model: SONNET,
    expect: "cached",
  },
  {
    name: "SBA system prompt on Haiku, whose minimum is 2048",
    text: sbaSystem,
    model: HAIKU,
    expect: "cached",
  },
  {
    name: "a prompt between the two minimums, on Haiku",
    text: "x".repeat(Math.round(1500 * 3.6)),
    model: HAIKU,
    expect: "plain",
  },
  {
    name: "the same prompt on Sonnet",
    text: "x".repeat(Math.round(1500 * 3.6)),
    model: SONNET,
    expect: "cached",
  },
];

let failed = 0;
for (const c of cases) {
  const out = cacheableSystem(c.text, c.model);
  const cached = Array.isArray(out);
  const ok = cached === (c.expect === "cached");
  if (!ok) failed++;
  const ttl = Array.isArray(out) ? out[0].cache_control?.ttl : undefined;
  console.log(
    `${ok ? "pass" : "FAIL"}  ${c.name}\n        ~${Math.round(c.text.length / 3.6)} tokens -> ${
      cached ? `cache breakpoint, ttl ${ttl}` : "plain string"
    }`
  );
}

// A breakpoint is worthless if the block does not carry the text.
const block = cacheableSystem(sbaSystem, SONNET);
if (!Array.isArray(block) || block[0].text !== sbaSystem) {
  console.log("FAIL  the cached block does not carry the prompt verbatim");
  failed++;
} else {
  console.log("pass  the cached block carries the prompt verbatim");
}

/*
  A retry's message: the shared part cached, the feedback after it, and
  the words the model reads exactly what they were as one string.
*/
const passages = "SOURCE PASSAGES:\n" + "Offer aspirin 150 mg at night from 12 weeks. ".repeat(400);
const problems = ['"DV" is never written out: give it in full', "the answer is not in the passages"];
let checks = 0;
const check = (name: string, ok: boolean) => {
  checks++;
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
};
const joined = (out: ReturnType<typeof attemptContent>) => (typeof out === "string" ? out : out.map((b) => b.text).join(""));

const first = attemptContent(passages, [], SONNET);
check("a first attempt is one cached block carrying the message verbatim",
  Array.isArray(first) && first.length === 1 && first[0].text === passages && first[0].cache_control?.type === "ephemeral");
const retry = attemptContent(passages, problems, SONNET);
check("a retry keeps the same cached block first",
  Array.isArray(retry) && Array.isArray(first) && retry[0].text === first[0].text && Boolean(retry[0].cache_control));
check("a retry's feedback follows uncached",
  Array.isArray(retry) && retry.length === 2 && !retry[1].cache_control && retry[1].text.startsWith("\n\nYOUR PREVIOUS ATTEMPT"));
check("the words read are unchanged on a first attempt", joined(first) === withPreviousProblems(passages, []));
check("the words read are unchanged on a retry", joined(retry) === withPreviousProblems(passages, problems));
check("a message too short to cache stays a plain string", attemptContent("short", problems, SONNET) === withPreviousProblems("short", problems));

const total = cases.length + 1 + checks;
console.log(`\n${total - failed} of ${total} passed`);
console.log(
  `\nTTL in force: ${process.env.ANTHROPIC_CACHE_TTL === "1h" ? "1h" : "5m"} (set ANTHROPIC_CACHE_TTL=1h to change)`
);
if (failed) process.exit(1);
