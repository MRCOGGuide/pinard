/**
 * Is the vector search fast enough to survive the statement timeout?
 *
 * match_chunks had no index and took 4.5 to 6.6 seconds against an
 * 8-second timeout, so Ask Pinard failed intermittently and blamed the
 * source material. Run this after phase 31, and again whenever the
 * corpus grows enough to wonder.
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

/** The margin the authenticated role actually has. */
const TIMEOUT_MS = 8000;
/** Past this, a slow day tips it over even when a fast day does not. */
const COMFORTABLE_MS = 1500;

const { count } = await db
  .from("content_chunks")
  .select("id", { count: "exact", head: true });
console.log(`${count} chunks in the corpus\n`);

// The values do not matter — the cost is the scan, not the arithmetic.
const vector = Array.from({ length: 1024 }, () => Math.random() - 0.5);

async function run(
  label: string,
  sectionIds: number[] | null,
  matchCount: number
): Promise<number> {
  const started = Date.now();
  const { data, error } = await db.rpc("match_chunks", {
    query_embedding: vector as unknown as string,
    section_ids: sectionIds,
    match_count: matchCount,
  });
  const ms = Date.now() - started;
  if (error) {
    console.log(`  ${label.padEnd(44)} FAILED — ${error.message}`);
    return Number.POSITIVE_INFINITY;
  }
  const verdict =
    ms >= TIMEOUT_MS ? "OVER TIMEOUT" : ms > COMFORTABLE_MS ? "close" : "ok";
  console.log(
    `  ${label.padEnd(44)} ${(ms / 1000).toFixed(2)}s  ${String((data ?? []).length).padStart(2)} rows  ${verdict}`
  );
  return ms;
}

const { data: sections } = await db.from("sections").select("id").limit(3);
const sectionIds = (sections ?? []).map((s: { id: number }) => s.id);

const times: number[] = [];
// Ask Pinard: the whole library, which is the case that broke.
times.push(await run("whole library, 8 passages (Ask Pinard)", null, 8));
times.push(await run("whole library, 8 passages (again)", null, 8));
// The largest request the function will honour.
times.push(await run("whole library, 50 passages", null, 50));
// Generation, which filters and never had the problem.
if (sectionIds.length) {
  times.push(await run("one section, 8 passages (generation)", [sectionIds[0]], 8));
  times.push(await run("three sections, 8 passages", sectionIds, 8));
}

const worst = Math.max(...times);
console.log(
  `\nworst ${(worst / 1000).toFixed(2)}s against an ${TIMEOUT_MS / 1000}s timeout`
);
if (worst >= TIMEOUT_MS) {
  console.log("a search this slow will fail for candidates — is the index built?");
  process.exit(1);
}
if (worst > COMFORTABLE_MS) {
  console.log(
    "under the timeout but not by much: a busier database will tip it over"
  );
  process.exit(1);
}
console.log("comfortable");
