/**
 * Scenarios that set up a question and never ask it.
 *
 *   npx tsx scripts/fix-unasked.mts 1662 1663
 *   npx tsx scripts/fix-unasked.mts 1662 1663 --apply
 *
 * #1662 ended "The team wish to exclude a life-threatening metabolic
 * emergency before proceeding with further investigation." and stopped
 * there. An EMQ's lead-in does ask — "select the SINGLE most
 * appropriate next step in management" — but a scenario that states an
 * intention and then goes quiet reads as though a sentence has been
 * lost, and 747 of this bank's 1,105 scenarios end in a question mark.
 *
 * The closing question is appended, not written over anything, and the
 * wording is the one the bank already uses most: "What is the most
 * appropriate next step?"
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
const ids = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"))
  .map(Number)
  .filter((n) => Number.isFinite(n) && n > 0);

const CLOSING = "What is the most appropriate next step?";

for (const id of ids) {
  const { data: row } = await db
    .from("generated_questions")
    .select("id, stem, format")
    .eq("id", id)
    .single();
  if (!row) {
    console.log(`#${id} — not found`);
    continue;
  }
  const before = (row.stem as string).trim();
  if (before.endsWith("?")) {
    console.log(`#${id} — already ends in a question`);
    continue;
  }
  const after = `${before} ${CLOSING}`;
  const problems = [...selfTalkProblems(after), ...ukEnglishProblems(after)];
  if (problems.length) throw new Error(`#${id}: ${problems.join("; ")}`);

  console.log(`#${id} (${row.format})`);
  console.log(`   was: …${before.slice(-130)}`);
  console.log(`   now: …${after.slice(-130)}`);

  if (apply) {
    const { error } = await db
      .from("generated_questions")
      .update({ stem: after })
      .eq("id", id);
    if (error) throw new Error(`#${id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved — pass --apply");
