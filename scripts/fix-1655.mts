/**
 * #1655 asked how to help a woman stop smoking after she had stopped.
 *
 *   npx tsx scripts/fix-1655.mts
 *   npx tsx scripts/fix-1655.mts --apply
 *
 * The stem said "She has stopped smoking since the stillbirth" and then
 * asked which intervention is the highest priority to reduce her risk
 * related to smoking. The answer is carbon monoxide testing and
 * cessation support before 16 weeks, which is the care of a woman who
 * is still smoking. The grounding check put it plainly: the passage
 * supports the window, not this woman.
 *
 * She is still smoking now, which is the situation the recommendation
 * is written for and the one in which the 16-week window matters:
 * stopping before it returns her risk to that of a non-smoker.
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
const { selfTalkProblems, ukEnglishProblems, emDashProblems } = await import(
  "../src/lib/generation"
);

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const STEM =
  "A 36-year-old woman, G2P1, books at 10 weeks of gestation. Her previous pregnancy ended in a stillbirth at 40 weeks and she was smoking at the time. She still smokes 10 cigarettes a day. Which intervention is the highest priority in early pregnancy to reduce her risk of a further adverse outcome?";

const { data: row } = await db
  .from("generated_questions")
  .select("id, stem")
  .eq("id", 1655)
  .single();
if (!row) throw new Error("no question 1655");

const problems = [
  ...selfTalkProblems(STEM),
  ...ukEnglishProblems(STEM),
  ...emDashProblems(STEM),
];
if (problems.length) throw new Error(problems.join("; "));

console.log(`was: ${row.stem as string}\n`);
console.log(`now: ${STEM}`);

if (!apply) {
  console.log("\nnot saved - pass --apply");
  process.exit(0);
}

const { error } = await db
  .from("generated_questions")
  .update({ stem: STEM })
  .eq("id", 1655);
if (error) throw error;
console.log("\nsaved");
