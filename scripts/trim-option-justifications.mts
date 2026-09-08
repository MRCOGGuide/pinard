/**
 * Move an option's reasoning out of the option.
 *
 * "TAC placed pre-conceptually or before 14 weeks, as this is the
 * treatment of choice following unsuccessful TVC resulting in PTB
 * before 28 weeks" is an answer with its explanation stapled on. The
 * reasoning belongs under the card, read after choosing; in the option
 * it is padding, and it hands the answer to whoever notices which
 * option argues hardest for itself.
 *
 * Only ever cuts. Nothing is added to the explanation automatically,
 * because a clause that reads as a reason beside its option often reads
 * as a non-sequitur at the end of a paragraph — that is a judgement for
 * the reviewer, and the clause is printed here so it can be made.
 *
 * Refuses to touch a question where the reason is load-bearing: if
 * stripping leaves two options identical, the reason is what the
 * candidate is choosing between and belongs exactly where it is.
 *
 *   npx tsx scripts/trim-option-justifications.mts --dry 5 32 48
 *   npx tsx scripts/trim-option-justifications.mts 5 32 48
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
const { verifyQuestion, overlappingOptionProblems, optionJustificationProblems } =
  await import("../src/lib/generation");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
if (ids.length === 0) {
  console.log("give the question ids to trim");
  process.exit(1);
}

const JUSTIFICATION =
  /[,;]?\s+\b(as this|as it|as these|as they|as the evidence|because|since this|owing to|given that|in view of|on the grounds that)\b.*$/i;

const trim = (text: string) =>
  text.replace(JUSTIFICATION, "").trim().replace(/[;,]+$/, "");

const db = createAdminClient();
let changed = 0;
let skipped = 0;

for (const id of ids) {
  const { data } = await db
    .from("generated_questions")
    .select("*")
    .eq("id", id)
    .single();
  if (!data) {
    console.log(`#${id}: not found`);
    skipped++;
    continue;
  }
  const cur = data as unknown as {
    options: { key: string; text: string }[];
    correct_key: string;
    citation_chunk_ids: number[] | null;
    status: string;
  };

  const options = cur.options.map((o) => ({ ...o, text: trim(o.text) }));
  const cuts = cur.options
    .map((o, i) => ({ key: o.key, before: o.text, after: options[i].text }))
    .filter((c) => c.before !== c.after);

  if (cuts.length === 0) {
    console.log(`#${id}: nothing to trim`);
    skipped++;
    continue;
  }

  // Every guard the generator would apply, before writing anything.
  const stillDistinct =
    new Set(options.map((o) => o.text.toLowerCase())).size === options.length;
  // A drug name is a whole option — "Metformin" needs no help. Only
  // guard against a cut that leaves nothing behind.
  const allSubstantial = options.every((o) => o.text.trim().length >= 3);
  const problems = verifyQuestion(
    { ...(data as never), options } as never,
    new Set(cur.citation_chunk_ids ?? [])
  );
  const overlap = overlappingOptionProblems(options);
  const stillFlagged = optionJustificationProblems(options);

  console.log(`\n#${id} (${cur.status})`);
  for (const c of cuts) {
    const onAnswer = c.key === cur.correct_key ? "  <-- the answer" : "";
    console.log(`   ${c.key}. ${c.after}${onAnswer}`);
    console.log(`      cut: …${c.before.slice(c.after.length).trim()}`);
  }

  const blockers = [
    !stillDistinct && "options would no longer be distinct",
    !allSubstantial && "an option would be left too thin to stand",
    problems.length > 0 && `verify: ${problems.join("; ")}`,
    overlap.length > 0 && `overlap: ${overlap.join("; ")}`,
    stillFlagged.length > 0 && "still reads as justified",
  ].filter(Boolean) as string[];

  if (blockers.length > 0) {
    console.log(`   SKIPPED — ${blockers.join(" | ")}`);
    skipped++;
    continue;
  }

  if (DRY) {
    changed++;
    continue;
  }
  const { error } = await db
    .from("generated_questions")
    .update({ options })
    .eq("id", id);
  if (error) {
    console.log(`   FAILED — ${error.message}`);
    skipped++;
    continue;
  }
  changed++;
}

console.log(
  `\n${DRY ? "would trim" : "trimmed"} ${changed} question(s), skipped ${skipped}`
);
