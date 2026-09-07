/**
 * Fill the queue with one job per document — TOG articles and patient
 * information leaflets — using exactly the selection the admin buttons
 * use.
 *
 * The first fill is several hundred jobs, which is better watched from
 * a terminal than fired from a page. Re-runnable: a document already
 * queued, or already holding its quota, is skipped.
 *
 *   npx tsx scripts/queue-documents.mts --dry
 *   npx tsx scripts/queue-documents.mts --tog
 *   npx tsx scripts/queue-documents.mts --leaflets
 *   npx tsx scripts/queue-documents.mts --tog --leaflets
 */
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local","utf8").split(/\r?\n/)
    .filter(l=>l.includes("=") && !l.startsWith("#"))
    .map(l=>{const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()];})
);
for (const [k,v] of Object.entries(env)) process.env[k] ??= v as string;

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { selectTogJobs, selectLeafletJobs, insertDocumentJobs } =
  await import("../src/app/admin/queue/documentJobs");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const doTog = args.includes("--tog") || (!args.includes("--leaflets"));
const doLeaflets = args.includes("--leaflets") || (!args.includes("--tog"));

const db = createAdminClient();

for (const [name, run] of [
  ["TOG", doTog ? () => selectTogJobs(db) : null],
  ["leaflets", doLeaflets ? () => selectLeafletJobs(db) : null],
] as [string, null | (() => Promise<any>)][]) {
  if (!run) continue;
  const { jobs, alreadyQueued, alreadyCovered, noChunks, oldest } = await run();
  const questions = jobs.reduce((s: number, j: any) => s + j.target, 0);
  console.log(`\n${name}: ${jobs.length} jobs, ${questions} questions${oldest ? `, back to ${oldest}` : ""}`);
  console.log(`  passed over: ${alreadyQueued} already queued, ${alreadyCovered} already covered, ${noChunks} with no chunks`);
  if (jobs.length === 0) continue;
  if (DRY) { console.log("  (dry run — nothing written)"); continue; }
  const { error } = await insertDocumentJobs(db, jobs);
  console.log(error ? `  FAILED — ${error}` : `  queued ${jobs.length}`);
}

const { count } = await db.from("generation_jobs")
  .select("id", { count: "exact", head: true }).in("status", ["queued", "running"]);
console.log(`\nqueue now holds ${count} active job(s)`);
