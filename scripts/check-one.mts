/**
 * Put one question through the grounding check, repeatedly.
 *
 * The check is a model call, so a single pass proves nothing about a
 * subtle failure: question 170 passed it at generation and failed it
 * later on the same evidence. What matters is whether it now catches
 * the fault every time, not once.
 *
 *   npx tsx scripts/check-one.mts 170 5
 */

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { getChunksByIds } = await import("../src/lib/retrieval");
const { checkGrounding } = await import("../src/lib/generation");

const id = Number(process.argv[2]);
const runs = Number(process.argv[3] ?? 5);

const db = createAdminClient();
const client = new Anthropic();
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const { data: q } = await db
  .from("generated_questions")
  .select("*")
  .eq("id", id)
  .single();
if (!q) throw new Error(`no question ${id}`);

const explanations = (q.explanations ?? []) as { key: string; citation_chunk_ids: number[] }[];
const correct = explanations.find((e) => e.key === q.correct_key);
const passages = await getChunksByIds(correct?.citation_chunk_ids ?? []);

const answer = (q.options as { key: string; text: string }[]).find(
  (o) => o.key === q.correct_key
);
console.log(`question ${id} (${q.format}/${q.status})`);
console.log(`asks: ...${String(q.stem).slice(-120)}`);
console.log(`marked: ${answer?.key}. ${answer?.text}`);
console.log(`passages: ${passages.length}\n`);

let supported = 0;
for (let i = 1; i <= runs; i++) {
  const r = await checkGrounding(q as never, passages as never, client, model);
  if (r.ok) supported++;
  console.log(`  run ${i}: ${r.ok ? "SUPPORTED" : "rejected — " + r.reason}`);
}
console.log(
  `\nsupported ${supported} of ${runs}${supported === 0 ? " — caught every time" : supported === runs ? " — never caught" : " — inconsistent"}`
);
