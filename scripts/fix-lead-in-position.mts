/**
 * "From the list above" is not true on every screen.
 *
 *   npx tsx scripts/fix-lead-in-position.mts
 *   npx tsx scripts/fix-lead-in-position.mts --apply
 *
 * Every EMQ lead-in in the bank ends "select the SINGLE most
 * appropriate … from the list above", which is how a paper is laid
 * out: one option list, then the scenarios under it. The mock and the
 * diagnostic are built that way and the sentence is true there.
 *
 * In a practice session it is not. A session shows one scenario at a
 * time with its options underneath, so the list the lead-in points
 * above is sitting below, and the same is true in the review queue and
 * the bank browser.
 *
 * Rather than make two layouts agree, the sentence stops pointing: "the
 * option list" is true wherever the list is.
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
const { fetchAll } = await import("../src/lib/supabase/all");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const FROM = /\bfrom the list above\b/g;
const TO = "from the option list";

type Row = { id: number; status: string; lead_in: string | null };

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, lead_in")
    .not("lead_in", "is", null)
    .order("id")
    .range(from, to)
);

const work = rows.filter((r) => FROM.test(r.lead_in ?? "") && (FROM.lastIndex = 0) === 0);
console.log(`${work.length} lead-in(s) point at a list that is not always above`);
if (work[0]) {
  console.log(`   was: …${(work[0].lead_in ?? "").slice(-110)}`);
  console.log(`   now: …${(work[0].lead_in ?? "").replace(FROM, TO).slice(-110)}`);
}

if (!apply) {
  console.log("\nnot saved — pass --apply");
  process.exit(0);
}

let written = 0;
for (const r of work) {
  const next = (r.lead_in ?? "").replace(FROM, TO);
  if (next === r.lead_in) continue;
  const { error } = await db
    .from("generated_questions")
    .update({ lead_in: next })
    .eq("id", r.id);
  if (error) throw new Error(`#${r.id}: ${error.message}`);
  written++;
}
console.log(`\n${written} lead-in(s) rewritten`);
