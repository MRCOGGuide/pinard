/**
 * Replace words in an EMQ set's shared lead-in, on every row of the set.
 *
 *   npx tsx scripts/set-lead-in.mts 1352 "vulvovaginal cysts" "vulvovaginal cysts and other vulval lesions"
 *
 * (Any scenario id in the set will do.) Like the option list, the lead-in
 * is stored on each row; editing one row leaves the set disagreeing with
 * itself. A row whose lead-in no longer contains the old words is
 * skipped rather than overwritten.
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

const [id, from, to] = process.argv.slice(2);
if (!id || from === undefined || to === undefined) {
  console.log('usage: set-lead-in.mts <id> "<old words>" "<new words>"');
  process.exit(1);
}
const { data: seed } = await db.from("generated_questions").select("emq_group_id").eq("id", Number(id)).single();
if (!seed?.emq_group_id) {
  console.log(`Q${id} is not in an EMQ set`);
  process.exit(1);
}
const { data: rows } = await db
  .from("generated_questions")
  .select("id, lead_in")
  .eq("emq_group_id", seed.emq_group_id);
for (const r of rows ?? []) {
  if (!r.lead_in?.includes(from)) {
    console.log(`Q${r.id}: words not found, skipped`);
    continue;
  }
  const { error } = await db
    .from("generated_questions")
    .update({ lead_in: r.lead_in.replace(from, to) })
    .eq("id", r.id);
  console.log(`Q${r.id}: ${error ? error.message : "lead-in updated"}`);
}
