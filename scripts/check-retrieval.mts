/**
 * Is the vector search fast enough to survive the statement timeout?
 *
 * match_chunks had no index and took 4.5 to 6.6 seconds against an
 * 8-second timeout, so Ask Pinard failed intermittently and blamed the
 * source material. Phase 31 added the HNSW index. Run this after a
 * migration, and again whenever the corpus grows enough to wonder.
 *
 * Two numbers, because they answer different questions.
 *
 * Cold is the first search after the index has been pushed out of
 * Postgres's shared buffers — which the exact count this script used
 * to run first did all by itself, so an earlier version was partly
 * measuring the damage it caused. It is the honest worst case and the
 * one a candidate can meet.
 *
 * Steady state is every search after that, measured with a fresh
 * random vector each time so nothing is answered from a cache.
 *
 *   npx tsx scripts/check-retrieval.mts
 */

import fs from "node:fs";

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
const db = createAdminClient();

/** What the authenticated role actually allows. */
const TIMEOUT_MS = 8000;
/** Half the budget. Past this, a busier database is a real risk. */
const MARGIN_MS = TIMEOUT_MS / 2;

/** A different vector every time, so no result can be reused. */
const vector = () => Array.from({ length: 1024 }, () => Math.random() - 0.5);

async function search(
  sectionIds: number[] | null,
  matchCount: number
): Promise<{ ms: number; rows: number; error?: string }> {
  const started = Date.now();
  const { data, error } = await db.rpc("match_chunks", {
    query_embedding: vector() as unknown as string,
    section_ids: sectionIds,
    match_count: matchCount,
  });
  return {
    ms: Date.now() - started,
    rows: (data ?? []).length,
    error: error?.message,
  };
}

function report(label: string, ms: number, rows: number, error?: string) {
  if (error) {
    console.log(`  ${label.padEnd(42)} FAILED — ${error}`);
    return;
  }
  const verdict = ms >= TIMEOUT_MS ? "OVER TIMEOUT" : ms > MARGIN_MS ? "close" : "ok";
  console.log(
    `  ${label.padEnd(42)} ${(ms / 1000).toFixed(2)}s  ${String(rows).padStart(2)} rows  ${verdict}`
  );
}

// Establish the connection on something trivial, so the first search
// measures the search rather than the handshake.
await db.from("sections").select("id").limit(1);

const { count } = await db
  .from("content_chunks")
  .select("id", { count: "estimated", head: true });
console.log(`about ${count} chunks in the corpus\n`);

console.log("cold — the first search, worst case a candidate can meet");
const cold = await search(null, 8);
report("whole library, 8 passages", cold.ms, cold.rows, cold.error);

console.log("\nsteady state — fresh vector each time, nothing cached");
const warm: number[] = [];
for (let i = 0; i < 5; i++) {
  const r = await search(null, 8);
  warm.push(r.ms);
  report(`whole library, 8 passages #${i + 1}`, r.ms, r.rows, r.error);
}
const fifty = await search(null, 50);
report("whole library, 50 passages", fifty.ms, fifty.rows, fifty.error);

const { data: sections } = await db.from("sections").select("id").limit(3);
const ids = (sections ?? []).map((s: { id: number }) => s.id);
if (ids.length) {
  const one = await search([ids[0]], 8);
  report("one section, 8 passages (generation)", one.ms, one.rows, one.error);
  const three = await search(ids, 8);
  report("three sections, 8 passages", three.ms, three.rows, three.error);
}

warm.sort((a, b) => a - b);
const median = warm[Math.floor(warm.length / 2)];
console.log(
  `\ncold ${(cold.ms / 1000).toFixed(2)}s · steady median ${(median / 1000).toFixed(
    2
  )}s · timeout ${TIMEOUT_MS / 1000}s`
);

if (cold.ms >= TIMEOUT_MS) {
  console.log("a search this slow fails for candidates — is the index built?");
  process.exit(1);
}
if (cold.ms > MARGIN_MS) {
  console.log(
    "under the timeout, but with less than half the budget spare: a busier database will tip it over"
  );
  process.exit(1);
}
console.log(
  `comfortable — ${(TIMEOUT_MS / cold.ms).toFixed(1)}x margin on the worst case`
);
