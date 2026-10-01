/**
 * #1704 stated a fact about bladders and then stopped.
 *
 *   npx tsx scripts/fix-1704.mts
 *   npx tsx scripts/fix-1704.mts --apply
 *
 * It ended "The team discusses intravesical treatment to address the
 * underlying bladder urothelial defect. Removal of the relevant
 * protective layer has been shown to increase bacterial adherence
 * 100-fold." — two sentences of explanation, in the stem, with no
 * question after them.
 *
 * The mechanism stays, because it is what the scenario turns on, but
 * it is folded into the sentence that asks. "Intravesical" goes: it is
 * the only intravesical option in the list, so the word answered the
 * question by category rather than by knowledge. "Has been shown to"
 * goes with it — the stem states the medicine, it does not cite it.
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
const { selfTalkProblems, ukEnglishProblems, sourceNarrationProblems, studyAttributionProblems } =
  await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const FROM =
  "The team discusses intravesical treatment to address the underlying bladder urothelial defect. Removal of the relevant protective layer has been shown to increase bacterial adherence 100-fold.";
const TO =
  "The team is considering a treatment that restores the bladder surface coating whose removal increases bacterial adherence 100-fold. What is the most appropriate management?";

const { data: row } = await db
  .from("generated_questions")
  .select("id, stem")
  .eq("id", 1704)
  .single();
if (!row) throw new Error("no question 1704");

const before = (row.stem as string).trim();
if (!before.includes(FROM)) throw new Error("the ending has moved");
const after = before.replace(FROM, TO);

const problems = [
  ...selfTalkProblems(after),
  ...ukEnglishProblems(after),
  ...sourceNarrationProblems(after),
  ...studyAttributionProblems(after),
];
if (problems.length) throw new Error(problems.join("; "));
if (!after.trim().endsWith("?")) throw new Error("still does not ask");

console.log(`was: ${before}\n`);
console.log(`now: ${after}\n`);

if (!apply) {
  console.log("not saved — pass --apply");
  process.exit(0);
}

const { error } = await db
  .from("generated_questions")
  .update({ stem: after })
  .eq("id", 1704);
if (error) throw error;
console.log("saved");
