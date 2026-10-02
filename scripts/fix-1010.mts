/**
 * #1010 showed the candidate the answer on the scan.
 *
 *   npx tsx scripts/fix-1010.mts
 *   npx tsx scripts/fix-1010.mts --apply
 *
 * The stem reported "an enlarged right ovary with peripheral follicle
 * displacement and a whirlpool sign on Doppler", then asked which
 * ultrasound finding carries the highest positive predictive value for
 * torsion. Two of the five options were already in the stem, and one
 * of them was the answer.
 *
 * The question is a ranking — whirlpool 93.6%, free fluid 89.2%,
 * enlarged ovary and stromal oedema about 75% — so the scan findings
 * come out of the scene and the ranking is left to the candidate.
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

const STEM =
  "A 28-year-old woman presents to the emergency gynaecology unit with a 6-hour history of sudden-onset severe right iliac fossa pain, nausea and vomiting. She has no significant medical history and is haemodynamically stable. Transvaginal ultrasound is performed and ovarian torsion is suspected. Which of the following ultrasound findings, when present, carries the highest positive predictive value for ovarian torsion?";

const { data: row } = await db
  .from("generated_questions")
  .select("id, stem, correct_key, options")
  .eq("id", 1010)
  .single();
if (!row) throw new Error("no question 1010");

const problems = [
  ...selfTalkProblems(STEM),
  ...ukEnglishProblems(STEM),
  ...sourceNarrationProblems(STEM),
];
if (problems.length) throw new Error(problems.join("; "));

/* No option may be stated in the stem any more, answer or distractor. */
const options = (row.options ?? []) as { key: string; text: string }[];
const lower = STEM.toLowerCase();
for (const o of options) {
  const own = (o.text.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []).filter(
    (w) => !["ovary", "ovarian", "without", "obvious", "affected", "adnexa", "surrounding"].includes(w)
  );
  const echoed = own.filter((w) => lower.includes(w));
  if (own.length >= 2 && echoed.length === own.length) {
    throw new Error(`option ${o.key} is still written out in the stem`);
  }
}

console.log(`was: ${row.stem}\n`);
console.log(`now: ${STEM}\n`);

if (!apply) {
  console.log("not saved — pass --apply");
  process.exit(0);
}

const { error } = await db
  .from("generated_questions")
  .update({ stem: STEM })
  .eq("id", 1010);
if (error) throw error;
console.log("saved");
