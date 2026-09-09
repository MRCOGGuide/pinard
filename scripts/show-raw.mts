/**
 * Print the raw row plus the cited source passages for one question.
 *
 *   npx tsx scripts/show-raw.mts 1153
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
const { getChunksByIds } = await import("../src/lib/retrieval");

const db = createAdminClient();
const id = Number(process.argv[2]);

const { data: q, error } = await db
  .from("generated_questions")
  .select("*")
  .eq("id", id)
  .single();
if (error) throw error;

console.log(JSON.stringify(q, null, 2));

const ids = new Set<number>();
for (const e of (q.explanations ?? []) as { citation_chunk_ids?: number[] }[]) {
  for (const c of e.citation_chunk_ids ?? []) ids.add(c);
}
const chunks = await getChunksByIds(Array.from(ids));
console.log("\n\n=== CITED PASSAGES ===");
for (const c of chunks) {
  console.log(`\n--- chunk ${c.id} (doc ${c.document_id}) ---`);
  console.log(c.text);
}
