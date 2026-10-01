/**
 * #1726 called a first pregnancy no risk factor at all.
 *
 *   npx tsx scripts/fix-1726.mts
 *   npx tsx scripts/fix-1726.mts --apply
 *
 * The stem made her nulliparous and the explanation then said "this
 * woman has none", while the source's own list reads: "Moderate risk
 * factors include first pregnancy, maternal age ≥40 years, pregnancy
 * interval >10 years, BMI >35 kg/m2, family history of pre-eclampsia
 * and multiple pregnancy."
 *
 * Correcting the explanation alone was not enough, and the grounding
 * check said so: "Women with any of these risk factors, irrespective of
 * whether they meet the criteria for prophylaxis, should also have a
 * plan for closer maternal and fetal surveillance." A first pregnancy
 * does not reach the aspirin threshold — that needs more than one
 * moderate factor — but it does earn closer surveillance, and the
 * marked answer is "no additional intervention required".
 *
 * What the question is for is that ART by itself buys neither. So she
 * is given a previous uncomplicated term birth: now she has no risk
 * factor of any kind, the answer is true as marked, and the point
 * being tested is untouched.
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

/** Either wording, so this runs whether or not the first repair landed. */
const STEM_FROM = [
  "A 34-year-old nulliparous woman conceived via IVF is seen at her booking appointment at 11 weeks.",
  "A 34-year-old woman in her first pregnancy, conceived via IVF, is seen at her booking appointment at 11 weeks.",
];
const STEM_TO =
  "A 34-year-old woman, para 1 after an uncomplicated term birth three years ago, conceives via IVF and is seen at her booking appointment at 11 weeks.";

const EXPLANATION_TO =
  "ART alone is not an indication for aspirin: the relative risk of PIH and pre-eclampsia is raised (RR 1.49), but the absolute increase is approximately 2%. Aspirin is offered for one major risk factor, or for more than one moderate factor — first pregnancy, age 40 or over, an interval over 10 years, BMI over 35, a family history or a multiple pregnancy. She has none of them, so routine booking risk assessment is all that is required.";

const { data: row } = await db
  .from("generated_questions")
  .select("id, stem, correct_key, explanations")
  .eq("id", 1726)
  .single();
if (!row) throw new Error("no question 1726");

const before = row.stem as string;
const from = STEM_FROM.find((f) => before.includes(f));
if (!from) throw new Error("the stem has moved");
const after = before.replace(from, STEM_TO);

const explanations = (row.explanations ?? []) as { key: string; text: string }[];
const correct = explanations.find((e) => e.key === row.correct_key);
if (!correct) throw new Error("no explanation for the answer");

for (const text of [after, EXPLANATION_TO]) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...sourceNarrationProblems(text),
  ];
  if (problems.length) throw new Error(problems.join("; "));
}
const words = EXPLANATION_TO.split(/\s+/).length;
if (words > 85) throw new Error(`explanation is ${words} words`);

console.log(`was: ${before}\n`);
console.log(`now: ${after}\n`);
console.log(`was: ${correct.text}\n`);
console.log(`now: ${EXPLANATION_TO}\n`);

if (!apply) {
  console.log("not saved — pass --apply");
  process.exit(0);
}

const { error } = await db
  .from("generated_questions")
  .update({
    stem: after,
    explanations: explanations.map((e) =>
      e.key === row.correct_key ? { ...e, text: EXPLANATION_TO } : e
    ),
  })
  .eq("id", 1726);
if (error) throw error;
console.log("saved");
