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

import { cacheableSystem } from "../src/lib/generation";
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
    name: "chat system prompt — too short to cache, left plain on purpose",
    text: chatSystem,
    model: SONNET,
    expect: "plain",
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

console.log(`\n${cases.length + 1 - failed} of ${cases.length + 1} passed`);
console.log(
  `\nTTL in force: ${process.env.ANTHROPIC_CACHE_TTL === "1h" ? "1h" : "5m"} (set ANTHROPIC_CACHE_TTL=1h to change)`
);
if (failed) process.exit(1);
