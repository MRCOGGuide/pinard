/**
 * Take the model's self-correction out of #1602's stem.
 *
 *   npx tsx scripts/fix-1602.mts
 *   npx tsx scripts/fix-1602.mts --apply
 *
 * One sentence comes out and nothing else moves: the age it "corrects"
 * to is the age the stem already opens with and the age the answer
 * turns on, so there is nothing to put in its place.
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
const { selfTalkProblems } = await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const FAULT = " She is 44 years old — wait, she is 32 years old.";

const { data: row } = await db
  .from("generated_questions")
  .select("id, stem")
  .eq("id", 1602)
  .single();
if (!row) throw new Error("no question 1602");

const before = row.stem as string;
if (!before.includes(FAULT)) {
  console.log("the sentence is not there — nothing to do");
  process.exit(0);
}
const after = before.replace(FAULT, "");

console.log(`was: ${before}\n`);
console.log(`now: ${after}\n`);
if (selfTalkProblems(after).length) throw new Error("still talking to itself");

if (apply) {
  const { error } = await db
    .from("generated_questions")
    .update({ stem: after })
    .eq("id", 1602);
  if (error) throw error;
  console.log("saved");
} else {
  console.log("not saved — pass --apply");
}
