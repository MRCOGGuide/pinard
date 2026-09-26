/**
 * #1623 counted the months two ways and answered with the wrong one.
 *
 *   npx tsx scripts/fix-1623.mts
 *   npx tsx scripts/fix-1623.mts --apply
 *
 * The stem said "a two-week history of vaginal bleeding", then that she
 * had been on HRT eight months and the bleeding began four weeks after
 * she started — which is seven months of bleeding, not two weeks. The
 * explanation then called it "within the first few months" and said the
 * six-month threshold had not been reached. On its own facts it had
 * been passed, and the woman should have been referred.
 *
 * The rule is what the question is for, so the rule stays and the
 * months move: three months of HRT, bleeding since week four, which is
 * short of six months under either reading of the guidance — bleeding
 * that has lasted six months, or bleeding six months after starting.
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
const { selfTalkProblems, ukEnglishProblems, sourceNarrationProblems } =
  await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const STEM =
  "A 58-year-old woman attends her GP with unscheduled vaginal bleeding. She had her last menstrual period at the age of 51 and has been taking continuous combined HRT for the past three months. She reports that the bleeding began four weeks after she started HRT and has continued intermittently since. Examination is unremarkable. What is the most appropriate next step?";

const EXPLANATION =
  "Persistent unscheduled bleeding on HRT is referred for investigation once it has continued for more than 6 months after starting HRT. This woman is three months into treatment, so that threshold has not been reached. Bleeding that begins after stopping HRT is referred only if it continues 6 weeks later.";

const { data: row } = await db
  .from("generated_questions")
  .select("id, stem, correct_key, explanations")
  .eq("id", 1623)
  .single();
if (!row) throw new Error("no question 1623");

const explanations = (row.explanations ?? []) as { key: string; text: string }[];
const key = row.correct_key as string;
if (!explanations.some((e) => e.key === key)) throw new Error("no explanation for the answer");

for (const text of [STEM, EXPLANATION]) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...sourceNarrationProblems(text),
  ];
  if (problems.length) throw new Error(problems.join("; "));
}
const words = EXPLANATION.split(/\s+/).length;
if (words < 30 || words > 60) throw new Error(`explanation is ${words} words`);

console.log(`was: ${row.stem}\n`);
console.log(`now: ${STEM}\n`);
console.log(`was: ${explanations.find((e) => e.key === key)?.text}\n`);
console.log(`now: ${EXPLANATION}\n`);

if (!apply) {
  console.log("not saved — pass --apply");
  process.exit(0);
}

const { error } = await db
  .from("generated_questions")
  .update({
    stem: STEM,
    explanations: explanations.map((e) =>
      e.key === key ? { ...e, text: EXPLANATION } : e
    ),
  })
  .eq("id", 1623);
if (error) throw error;
console.log("saved");
