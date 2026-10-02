/**
 * The same answer marked correct in two different sets.
 *
 *   npx tsx scripts/audit-duplicate-answers.mts
 *
 * #1974 was revised because a woman was still on magnesium three days
 * after delivery. Reading its neighbours turned up #1962, which teaches
 * the same rule, halve the maintenance infusion when the kidneys are
 * failing, in a transplant scenario rather than a pre-eclampsia one.
 * Both are in section 35, so a candidate can meet the rule twice in one
 * sitting and get the second one free.
 *
 * This catches the textual case: two questions in the same section whose
 * marked answers are built from mostly the same content words. Mostly,
 * not exactly: the first version of this demanded the same word set and
 * so reported #377 against #388 while missing #389 against #386
 * ("Measure TSH-receptor antibodies and fT3" against "Measure TRAb and
 * fT3") and #391 against #387, which differ by a word each and are the
 * same question. Two thirds of the words shared, and at least three of
 * them, is the line.
 *
 * Two kinds of duplicate it cannot see, both real and both in the bank:
 *
 *  - Synonyms. #386 answers "Measure TRAb and fT3" and #389 answers
 *    "Measure TSH-receptor antibodies and fT3" to the same scenario in
 *    a twin set. One shared word out of four.
 *  - The same decision in different words. #1962 said "Halve the
 *    maintenance infusion rate" where #1974 said "Reduce magnesium
 *    sulphate infusion to 0.5 g/hour". Nothing shared at all.
 *
 * So this is the floor of the problem, not the ceiling, and a clean run
 * means only that no pair is duplicated WORD for word.
 *
 * Pairs whose figures differ are printed with a note, because the
 * number is usually the whole content of the answer and "ten times
 * higher" against "seven times higher" is two questions, not one.
 *
 * Report only, and nothing it finds should be acted on automatically.
 * Deciding which of a pair to lose, or what the survivor should ask
 * instead, is an editorial judgement about what the bank covers.
 *
 * Skips answers under four words: a bare figure is the answer to many
 * questions and "3-5%" recurring is not a duplicate. Groups EMQ
 * scenarios by their set, because a shared option list puts the same
 * text on every row of it by design.
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
const { fetchAll } = await import("../src/lib/supabase/all");

const db = createAdminClient();

/** Words that carry no subject, so two answers are not matched on them. */
const EMPTY = new Set([
  "should", "with", "that", "this", "than", "from", "their", "will", "after",
  "before", "when", "most", "appropriate", "management", "woman", "women",
]);

const words = (text: string) =>
  new Set(
    (text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []).filter((w) => !EMPTY.has(w))
  );

/** Share of words the two answers have in common, over all words used. */
function overlap(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / (a.size + b.size - shared);
}

const SAME = 0.7;
const LEAST_SHARED = 3;

type Row = {
  id: number;
  status: string;
  section_id: number;
  emq_group_id: string | null;
  correct_key: string;
  stem: string;
  options: { key: string; text: string }[] | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, section_id, emq_group_id, correct_key, stem, options")
    .neq("status", "rejected")
    .order("id")
    .range(from, to)
);

type Answer = {
  id: number;
  status: string;
  text: string;
  set: string;
  section: number;
  words: Set<string>;
};

const answers: Answer[] = [];
for (const r of rows) {
  const text = (r.options ?? []).find((o) => o.key === r.correct_key)?.text ?? "";
  if (text.split(/\s+/).filter(Boolean).length < 4) continue;
  const w = words(text);
  if (w.size < LEAST_SHARED) continue;
  answers.push({
    id: r.id,
    status: r.status,
    text,
    set: r.emq_group_id ?? `q${r.id}`,
    section: r.section_id,
    words: w,
  });
}

/* One line per pair, the first time it is seen. */
const reported = new Set<string>();
let found = 0;
for (let i = 0; i < answers.length; i++) {
  for (let j = i + 1; j < answers.length; j++) {
    const a = answers[i];
    const b = answers[j];
    if (a.section !== b.section || a.set === b.set) continue;
    let shared = 0;
    for (const w of a.words) if (b.words.has(w)) shared += 1;
    if (shared < LEAST_SHARED || overlap(a.words, b.words) < SAME) continue;
    const pair = `${a.id}:${b.id}`;
    if (reported.has(pair)) continue;
    reported.add(pair);
    found += 1;
    const figures = (t: string) => (t.match(/\d+(?:[.,]\d+)?/g) ?? []).join(",");
    const differ = figures(a.text) !== figures(b.text);
    console.log(`#${a.id} ${a.status}  #${b.id} ${b.status}${differ ? "  (figures differ)" : ""}`);
    console.log(`   ${a.text.slice(0, 100)}`);
    if (a.text !== b.text) console.log(`   ${b.text.slice(0, 100)}`);
  }
}

console.log(`\n${rows.length} questions read, ${found} pair(s) of sets answered by the same thing`);
