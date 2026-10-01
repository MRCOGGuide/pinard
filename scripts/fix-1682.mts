/**
 * #1682 gave a haematoma no time to form.
 *
 *   npx tsx scripts/fix-1682.mts
 *   npx tsx scripts/fix-1682.mts --apply
 *
 * The woman decompensates during Veress needle insertion — the start of
 * the procedure, where the needle reaches the great vessels under the
 * umbilicus — and the laparoscope then finds "a retroperitoneal
 * haematoma seen enlarging near the sacral promontory". A haematoma
 * large enough to watch grow is not there in the seconds between the
 * needle and the laparoscope.
 *
 * Every finding in the vignette came from the guidance's own list of
 * how vascular injury is recognised, which is why it survived every
 * check: "Retroperitoneal haematoma (stable or enlarging in size) may
 * be seen superior to the sacral promontory area. Active bleeding
 * coming directly from the major vessels. Free blood in the abdominal
 * cavity. Haemodynamic instability." The list is not a timeline, and
 * the question used the one entry that takes time.
 *
 * So the haematoma goes and the bleeding stays: free blood and active
 * bleeding from the sacral promontory, both from the same list, both
 * there the moment you look. The answer does not move.
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

const STEM_FROM =
  "On inserting the laparoscope, free blood is visible in the abdominal cavity and a retroperitoneal haematoma is seen enlarging near the sacral promontory.";
const STEM_TO =
  "On inserting the laparoscope, free blood is visible in the abdominal cavity and there is active bleeding from the region of the sacral promontory.";

const EXPLANATION_FROM =
  "Haemodynamic instability with free intra-abdominal blood and an enlarging retroperitoneal haematoma mandates this step without delay";
const EXPLANATION_TO =
  "Haemodynamic instability with free intra-abdominal blood and active bleeding from a major vessel mandates this step without delay";

const { data: row } = await db
  .from("generated_questions")
  .select("id, stem, correct_key, explanations")
  .eq("id", 1682)
  .single();
if (!row) throw new Error("no question 1682");

const before = row.stem as string;
if (!before.includes(STEM_FROM)) throw new Error("the stem has moved");
const after = before.replace(STEM_FROM, STEM_TO);

const explanations = (row.explanations ?? []) as { key: string; text: string }[];
const correct = explanations.find((e) => e.key === row.correct_key);
if (!correct) throw new Error("no explanation for the answer");
if (!correct.text.includes(EXPLANATION_FROM)) throw new Error("the explanation has moved");
const nextText = correct.text.replace(EXPLANATION_FROM, EXPLANATION_TO);

for (const text of [after, nextText]) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...sourceNarrationProblems(text),
  ];
  if (problems.length) throw new Error(problems.join("; "));
}

console.log(`was: ${before}\n`);
console.log(`now: ${after}\n`);
console.log(`was: ${correct.text}\n`);
console.log(`now: ${nextText}\n`);

if (!apply) {
  console.log("not saved — pass --apply");
  process.exit(0);
}

const { error } = await db
  .from("generated_questions")
  .update({
    stem: after,
    explanations: explanations.map((e) =>
      e.key === row.correct_key ? { ...e, text: nextText } : e
    ),
  })
  .eq("id", 1682);
if (error) throw error;
console.log("saved");
