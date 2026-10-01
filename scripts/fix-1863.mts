/**
 * #1863 named its own answer in the stem.
 *
 *   npx tsx scripts/fix-1863.mts
 *   npx tsx scripts/fix-1863.mts --apply
 *
 * "Her obstetrician considers whether vaginal progesterone should be
 * prescribed to reduce her risk of preterm birth", against ten options
 * of which one is "Vaginal progesterone". The question means to ask
 * whether a twin pregnancy with a short cervix should have it; as
 * written, the stem answers that by naming it.
 *
 * Found by the audit written after #1704 — same fault, milder: a word
 * in the closing sentence that belongs to one option and no other.
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
const { selfTalkProblems, ukEnglishProblems, sourceNarrationProblems } = await import(
  "../src/lib/generation"
);

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const FROM =
  "Her obstetrician considers whether vaginal progesterone should be prescribed to reduce her risk of preterm birth.";
const TO =
  "Her obstetrician is considering what, if anything, should be offered to reduce her risk of preterm birth. What is the most appropriate management?";

const { data: row } = await db
  .from("generated_questions")
  .select("id, stem")
  .eq("id", 1863)
  .single();
if (!row) throw new Error("no question 1863");

const before = (row.stem as string).trim();
if (!before.includes(FROM)) throw new Error("the ending has moved");
const after = before.replace(FROM, TO);

const problems = [
  ...selfTalkProblems(after),
  ...ukEnglishProblems(after),
  ...sourceNarrationProblems(after),
];
if (problems.length) throw new Error(problems.join("; "));

console.log(`was: ${before}\n`);
console.log(`now: ${after}\n`);

if (!apply) {
  console.log("not saved — pass --apply");
  process.exit(0);
}

const { error } = await db
  .from("generated_questions")
  .update({ stem: after })
  .eq("id", 1863);
if (error) throw error;
console.log("saved");
