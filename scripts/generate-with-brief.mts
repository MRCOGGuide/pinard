/**
 * Generate an EMQ set from one document to the owner's brief, through
 * the same pipeline, checks and review queue as the generation console.
 *
 *   npx tsx --conditions=react-server scripts/generate-with-brief.mts --doc 1013 --count 1 --brief "..."
 *
 * The brief steers the topic only; every fact still comes from the
 * document's passages and the set arrives in the review queue as
 * pending, never approved.
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;

const { runGenerationBatch } = await import("../src/lib/generate-batch");

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const documentId = Number(arg("doc"));
const brief = arg("brief");
if (!documentId || !brief) throw new Error('usage: --doc <id> --brief "..." [--count n]');

const before = new Date().toISOString();
const result = await runGenerationBatch({
  sectionId: 0,
  documentId,
  format: "emq",
  count: Number(arg("count") ?? 1),
  brief,
});
console.log(JSON.stringify(result, null, 1));

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { data } = await createAdminClient()
  .from("generated_questions")
  .select("id,emq_group_id,correct_key,stem")
  .gte("created_at", before)
  .contains("source_document_ids", [documentId])
  .order("id");
for (const q of data ?? []) console.log(`#${q.id} [${q.correct_key}] ${q.stem.replace(/\s+/g, " ").slice(0, 160)}`);
