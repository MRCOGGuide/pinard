/**
 * Strip publisher boilerplate from chunks already in the database.
 *
 * Ingestion now removes page furniture before chunking, but the corpus
 * was built before it did. Re-ingesting those documents would fix the
 * text and renumber every chunk, which would break every citation in
 * the question bank — that is precisely how four approved questions
 * came to point at passages that no longer existed.
 *
 * So the text is cleaned in place. Chunk ids, boundaries and indexes
 * are untouched, so every citation survives; only the text changes, and
 * the embedding is recomputed to match it, because a vector describing
 * text that is no longer there is worse than the boilerplate was.
 *
 * Only the boilerplate pass applies. Detecting running headers needs
 * page boundaries, and those were lost at extraction.
 *
 *   npx tsx scripts/clean-chunks.mts --dry
 *   npx tsx scripts/clean-chunks.mts --limit 50
 *   npx tsx scripts/clean-chunks.mts
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
const { stripBoilerplate } = await import("../src/lib/boilerplate");
const { countTokens } = await import("../src/lib/chunking");
const { embedTexts } = await import("../src/lib/voyage");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

/**
 * A chunk that loses almost everything was almost entirely furniture.
 * It is kept rather than deleted — a citation pointing at it must not
 * dangle — but it is reported, because a question resting on one is
 * resting on nothing.
 */
const GUTTED = 0.25;

/**
 * Refuse to rewrite a chunk that would lose more than this.
 *
 * A pattern meant to remove a licence line once removed 1400
 * characters of an appendix care pathway, because the pathway had no
 * full stop for it to stop at. The pattern is fixed; this is here so
 * that the next such bug is reported rather than written. Boilerplate
 * is a minority of any real chunk, so nothing legitimate trips it.
 */
const REFUSE_BELOW = 0.4;

/** Voyage is billed per token; embed in batches and pace the writes. */
const BATCH = 64;

const db = createAdminClient();

let all: { id: number; text: string; document_id: number }[] = [];
for (let from = 0; from < 100_000; from += 1000) {
  const { data, error } = await db
    .from("content_chunks")
    .select("id, text, document_id")
    .order("id")
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  if (!data?.length) break;
  all = all.concat(data as typeof all);
}

type Job = { id: number; before: string; after: string };
const jobs: Job[] = [];
for (const c of all) {
  const after = stripBoilerplate(c.text);
  // Below a hair's difference it is whitespace tidying, not worth an
  // embedding call.
  if (after.length >= c.text.length * 0.995) continue;
  jobs.push({ id: c.id, before: c.text, after });
}

// Anything that would lose most of itself is set aside, not written.
const refused = jobs.filter((j) => j.after.length < j.before.length * REFUSE_BELOW);
const refusedIds = new Set(refused.map((r) => r.id));
const safe = jobs.filter((j) => !refusedIds.has(j.id));
const gutted = safe.filter((j) => j.after.length < j.before.length * GUTTED);
const totalBefore = safe.reduce((n, j) => n + j.before.length, 0);
const totalAfter = safe.reduce((n, j) => n + j.after.length, 0);

console.log(
  `${all.length} chunks | ${safe.length} to clean | ` +
    `${totalBefore} -> ${totalAfter} chars across them` +
    `${DRY ? " — DRY RUN" : ""}`
);
if (gutted.length > 0) {
  console.log(`\n${gutted.length} chunk(s) were mostly furniture:`);
  for (const g of gutted.slice(0, 10)) {
    console.log(
      `  ${g.id}: ${g.before.length} -> ${g.after.length} chars — "${g.after.slice(0, 90).replace(/\s+/g, " ")}"`
    );
  }
}

if (refused.length > 0) {
  console.log(
    `
${refused.length} chunk(s) REFUSED — would lose over ${Math.round((1 - REFUSE_BELOW) * 100)}% of their text, so they are left alone:`
  );
  for (const r of refused.slice(0, 10)) {
    console.log(
      `  ${r.id}: ${r.before.length} -> ${r.after.length} chars — kept as it was`
    );
  }
}

const todo = safe.slice(0, LIMIT);
if (DRY) {
  console.log(`\nDRY RUN — ${todo.length} chunk(s) would be rewritten and re-embedded.`);
  console.log("\nsample:");
  for (const j of todo.slice(0, 3)) {
    console.log(`\n  --- ${j.id} ---`);
    console.log(`  was: ${j.before.slice(0, 150).replace(/\s+/g, " ")}`);
    console.log(`  now: ${j.after.slice(0, 150).replace(/\s+/g, " ")}`);
  }
  process.exit(0);
}

let done = 0;
let failed = 0;
for (let start = 0; start < todo.length; start += BATCH) {
  const batch = todo.slice(start, start + BATCH);
  let vectors: number[][];
  try {
    vectors = await embedTexts(
      batch.map((j) => j.after),
      "document"
    );
  } catch (error) {
    failed += batch.length;
    console.log(
      `  embedding failed for ${batch.length} chunk(s): ${error instanceof Error ? error.message : String(error)}`
    );
    continue;
  }

  for (const [i, job] of batch.entries()) {
    const { error } = await db
      .from("content_chunks")
      .update({
        text: job.after,
        token_count: countTokens(job.after),
        embedding: vectors[i],
      })
      .eq("id", job.id);
    if (error) {
      failed++;
      console.log(`  ${job.id}: write failed — ${error.message}`);
    } else {
      done++;
    }
  }
  console.log(`  ...${done}/${todo.length}`);
}

console.log(`\ncleaned ${done}, failed ${failed}`);
