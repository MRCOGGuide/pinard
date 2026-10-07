/**
 * Change one option of an EMQ set's shared list, on every row of the set.
 *
 *   npx tsx scripts/set-option.mts 1653 G "15%" "39.6%"
 *   npx tsx scripts/set-option.mts 1668 F "13.3–19.6%" "16.7–19.6%" --answer-of 1668
 *
 * (Any scenario id in the set will do.)
 *
 * The list is stored on each scenario's row, so a change to one row
 * leaves its siblings showing the old text, and a repair that rewords
 * the list for one scenario can take another scenario's answer with it:
 * per-scenario repairs did exactly that across a batch of sets. This
 * changes the option everywhere at once, and only where it still reads
 * as expected.
 *
 * It refuses an option that is any scenario's answer, because changing
 * an answer is a change to that scenario. --answer-of names the one
 * scenario allowed to answer with it, for the case where that scenario's
 * answer is the thing being corrected.
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

const args = process.argv.slice(2);
const allowAt = args.indexOf("--answer-of");
const allowed = allowAt >= 0 ? Number(args[allowAt + 1]) : null;
const [id, key, from, to] = args.filter((_, i) => allowAt < 0 || (i !== allowAt && i !== allowAt + 1));
if (!id || !key || from === undefined || to === undefined) {
  console.log('usage: set-option.mts <id> <key> "<old text>" "<new text>" [--answer-of <id>]');
  process.exit(1);
}

const { data: seed } = await db.from("generated_questions").select("emq_group_id").eq("id", Number(id)).single();
if (!seed?.emq_group_id) {
  console.log(`Q${id} is not in an EMQ set`);
  process.exit(1);
}
const { data: rows } = await db
  .from("generated_questions")
  .select("id, options, correct_key")
  .eq("emq_group_id", seed.emq_group_id);

const answering = (rows ?? []).filter((r) => r.correct_key === key).map((r) => r.id);
if (answering.some((a) => a !== allowed)) {
  console.log(`option ${key} is the answer to Q${answering.join(", Q")}: refused`);
  process.exit(1);
}

for (const r of rows ?? []) {
  const o = (r.options as { key: string; text: string }[]).find((x) => x.key === key);
  if (!o || o.text !== from) {
    console.log(`Q${r.id}: option ${key} reads "${o?.text}", skipped`);
    continue;
  }
  const options = (r.options as { key: string; text: string }[]).map((x) =>
    x.key === key ? { ...x, text: to } : x
  );
  const { error } = await db.from("generated_questions").update({ options }).eq("id", r.id);
  console.log(`Q${r.id}: ${error ? error.message : `option ${key} -> ${to}`}`);
}
