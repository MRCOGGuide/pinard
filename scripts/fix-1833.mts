/**
 * #1833 never said when the baby came out, or how.
 *
 *   npx tsx scripts/fix-1833.mts
 *   npx tsx scripts/fix-1833.mts --apply
 *
 * The stem ran in the present tense, declared her dead, and then said
 * "The abdomen was opened and the baby delivered; the placenta was in
 * situ and the uterus was left open at the time of death" - a sentence
 * in another tense, about an event with no place in the sequence. A
 * candidate could not tell whether a perimortem caesarean had been
 * performed during the resuscitation, after it, or at all, and the
 * answer turns on the state the abdomen is in when she dies.
 *
 * It is now in order: arrest, caesarean at four minutes, what was left
 * where, failed resuscitation, death declared, coroner. Shorter too,
 * which is the house standard the examples set.
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
const { selfTalkProblems, ukEnglishProblems, sourceNarrationProblems, emDashProblems } =
  await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const STEM =
  "A 36-year-old woman at 30 weeks of gestation arrests in the emergency department after a road traffic collision. Perimortem caesarean section is performed at four minutes: the baby is delivered, the placenta left in place and the uterus left open. Resuscitation continues but is unsuccessful, and death is declared 25 minutes after the arrest. A coroner's postmortem will be required. What is the most appropriate management of the abdomen and its contents?";

const { data: row } = await db
  .from("generated_questions")
  .select("id, stem")
  .eq("id", 1833)
  .single();
if (!row) throw new Error("no question 1833");

const problems = [
  ...selfTalkProblems(STEM),
  ...ukEnglishProblems(STEM),
  ...sourceNarrationProblems(STEM),
  ...emDashProblems(STEM),
];
if (problems.length) throw new Error(problems.join("; "));

const words = STEM.split(/\s+/).length;
console.log(`was: ${(row.stem as string).split(/\s+/).length} words`);
console.log(`${row.stem as string}\n`);
console.log(`now: ${words} words`);
console.log(`${STEM}\n`);

if (!apply) {
  console.log("not saved - pass --apply");
  process.exit(0);
}

const { error } = await db
  .from("generated_questions")
  .update({ stem: STEM })
  .eq("id", 1833);
if (error) throw error;
console.log("saved");
