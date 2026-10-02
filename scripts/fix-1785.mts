/**
 * #1785 gave an unborn baby's specialist to the mother.
 *
 *   npx tsx scripts/fix-1785.mts
 *   npx tsx scripts/fix-1785.mts --apply
 *
 * "Her neonatologist asks whether additional antenatal corticosteroids
 * should be given" — she has not met a neonatologist, and the baby
 * whose doctor it would be is not born. A specialist drawn into a case
 * is the neonatology team, not hers.
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
const { selfTalkProblems, ukEnglishProblems } = await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const FROM = "Her neonatologist asks whether";
const TO = "The neonatology team asks whether";

const { data: row } = await db
  .from("generated_questions")
  .select("id, stem")
  .eq("id", 1785)
  .single();
if (!row) throw new Error("no question 1785");

const before = row.stem as string;
if (!before.includes(FROM)) throw new Error("the sentence has moved");
const after = before.replace(FROM, TO);

const problems = [...selfTalkProblems(after), ...ukEnglishProblems(after)];
if (problems.length) throw new Error(problems.join("; "));

console.log(`was: …${before.slice(-120)}`);
console.log(`now: …${after.slice(-120)}`);

if (!apply) {
  console.log("\nnot saved — pass --apply");
  process.exit(0);
}

const { error } = await db
  .from("generated_questions")
  .update({ stem: after })
  .eq("id", 1785);
if (error) throw error;
console.log("\nsaved");
