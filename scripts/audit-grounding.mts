/**
 * Audit the bank for questions their own sources do not establish.
 *
 * Every question is put back through the grounding check it faced when
 * it was generated: the marked answer must be supported by the passages
 * the question cites, and the checker must be able to produce a
 * verbatim quote from them that carries it. That quote is matched
 * against the passage text, so a plausible paraphrase does not pass.
 *
 * Anything that fails is taken out of circulation. A question whose
 * answer its own source does not support is the one thing the product
 * promises never to show, and it is worth more to lose it than to serve
 * it.
 *
 * Rejected, not deleted: `rejected` is how this app takes a question out
 * of circulation, it keeps the audit trail, and candidates have already
 * answered some of these — deleting the rows would take their history
 * with them. Nothing rejected is ever served.
 *
 *   npx tsx scripts/audit-grounding.mts --dry
 *   npx tsx scripts/audit-grounding.mts --limit 10
 *   npx tsx scripts/audit-grounding.mts
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

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

const db = createAdminClient();
const client = new Anthropic();
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const { data } = await db
  .from("generated_questions")
  .select("*")
  .in("status", ["approved", "pending"])
  .order("id");

const rows = ((data ?? []) as Record<string, any>[]).slice(0, LIMIT);
console.log(`checking ${rows.length} question(s)${DRY ? " — DRY RUN" : ""}\n`);

let passed = 0;
const failures: { id: number; status: string; reason: string; stem: string }[] = [];

for (const q of rows) {
  const explanations = (q.explanations ?? []) as {
    key: string;
    citation_chunk_ids: number[];
  }[];
  const correct = explanations.find((e) => e.key === q.correct_key);
  if (!correct || correct.citation_chunk_ids.length === 0) {
    failures.push({
      id: q.id,
      status: q.status,
      reason: "the correct option cites nothing",
      stem: q.stem,
    });
    continue;
  }

  const passages = await getChunksByIds(correct.citation_chunk_ids);
  if (passages.length === 0) {
    failures.push({
      id: q.id,
      status: q.status,
      reason: "cited passages no longer exist",
      stem: q.stem,
    });
    continue;
  }

  const result = await checkGrounding(q as any, passages as any, client, model);
  if (result.ok) {
    passed++;
  } else {
    failures.push({ id: q.id, status: q.status, reason: result.reason, stem: q.stem });
  }
}

console.log(`grounded: ${passed}`);
console.log(`NOT grounded: ${failures.length}\n`);
for (const f of failures) {
  console.log(`  ${f.id} (${f.status}): ${f.reason}`);
  console.log(`     ${f.stem.slice(0, 110)}…`);
}

if (!DRY && failures.length > 0) {
  for (const f of failures) {
    await db
      .from("generated_questions")
      .update({ status: "rejected" })
      .eq("id", f.id);
    await db.from("generation_failures").insert({
      reason: `grounding audit: ${f.reason} (question ${f.id} rejected)`,
      raw_response: null,
    });
  }
  console.log(`\n${failures.length} question(s) rejected and taken out of circulation.`);
} else if (DRY && failures.length > 0) {
  console.log(`\nDRY RUN — ${failures.length} would be rejected.`);
}
