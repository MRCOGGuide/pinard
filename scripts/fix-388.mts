/**
 * #388 re-pointed: it asked #377's question, in #377's words.
 *
 *   npx tsx scripts/fix-388.mts
 *   npx tsx scripts/fix-388.mts --apply
 *
 * #377 and #388 were the same question entered twice. Both: a
 * 32-year-old at 8 weeks, on long-term levothyroxine, pre-pregnancy
 * TSH 1.8, just confirmed a home pregnancy test, what do you do with
 * the dose; both answered "double the dose on two days of each week".
 * Only the dose differed, 125 against 100 micrograms, and both are in
 * the same section, so a candidate could meet it twice in a sitting.
 *
 * #377 keeps it. It is the harder of the two and it sits in a set
 * built around levothyroxine dosing: the starting dose in subclinical
 * hypothyroidism, stopping after birth in a woman who was not on it
 * before, and isolated hypothyroxinaemia left alone. #388 is the odd
 * hypothyroid scenario in a set that is otherwise Graves, gestational
 * transient thyrotoxicosis and iodine.
 *
 * Its source has one fact the bank does not test anywhere, and it fits
 * that set: "Routine testing for TPOAb in women with euthyroidism is
 * not recommended in pregnancy" because "there is no intervention to
 * improve outcomes in euthyroid TPOAb positive women"; but a woman
 * already known to be positive and euthyroid "should be offered
 * thyroid function test measurements in the first trimester
 * (preferably at first contact with a healthcare professional,
 * including primary care booking) and at 20 weeks of pregnancy to
 * detect development of hypothyroidism".
 *
 * Checked against the bank before writing: #77 is the universal versus
 * targeted testing question, #355 is TPOAb with recurrent miscarriage,
 * #1077 is TPOAb with primary ovarian insufficiency outside pregnancy,
 * #80 is TPOAb with a raised TSH. None is this.
 *
 * The levothyroxine-dosing option goes with the scenario it served,
 * nothing in the set referring to levothyroxine dosing any more. The
 * distractors were already in the list: measure the antibodies again,
 * the four to six weekly schedule that belongs to a woman already on
 * levothyroxine, every two to four weeks, and no further testing.
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
const {
  selfTalkProblems,
  ukEnglishProblems,
  sourceNarrationProblems,
  emDashProblems,
  explanationLengthProblems,
  listRecallProblems,
} = await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const SET = [388, 389, 390, 391];

const DROP = "Double the levothyroxine dose on 2 days of each week";
const ANSWER = "Check TSH and fT4 in the first trimester and again at 20 weeks";

const STEM =
  "A 29-year-old woman books at 9 weeks of gestation. She was found to be thyroid peroxidase antibody positive two years ago during investigation for subfertility and has always been euthyroid; her thyroid function today is normal and she has no symptoms. What thyroid monitoring does she need in this pregnancy?";

const EXPLANATION =
  "Routine testing for thyroid peroxidase antibodies is not recommended in euthyroid women, because no intervention improves outcomes in those found to be positive. A woman already known to be positive and euthyroid is a different matter: she is at increased risk of progressing to thyroid dysfunction during the pregnancy, most of all in the first half, so she is offered thyroid function tests in the first trimester, preferably at her first contact with a healthcare professional, and again at 20 weeks to detect hypothyroidism developing.";

const GROUNDS = [
  "Routine testing for TPOAb in women with euthyroidism is not recommended in pregnancy",
  "There is no intervention to improve outcomes in euthyroid TPOAb positive women",
  "they should be offered thyroid function test measurements in the first trimester (preferably at first contact with a healthcare professional, including primary care booking) and at 20 weeks of pregnancy to detect development of hypothyroidism",
  "increased risk of progression to thyroid dysfunction during pregnancy in TPOAb positive women",
];

/* The recommendation and its rationale table. */
const ADD_CITES = [20349, 20369];

for (const text of [STEM, EXPLANATION, ANSWER]) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...sourceNarrationProblems(text),
    ...emDashProblems(text),
  ];
  if (problems.length) throw new Error(`${text.slice(0, 40)}: ${problems.join("; ")}`);
}
const long = explanationLengthProblems(EXPLANATION);
if (long.length) throw new Error(long.join("; "));
const listed = listRecallProblems(STEM);
if (listed.length) throw new Error(listed.join("; "));

const { data: set } = await db
  .from("generated_questions")
  .select("id, status, stem, correct_key, options, explanations, citation_chunk_ids")
  .in("id", SET)
  .order("id");
if (set?.length !== SET.length) throw new Error("the set has changed");

const mine = set.find((r) => r.id === 388)!;

/* #377 must still hold the question this one is giving up. */
const { data: kept } = await db
  .from("generated_questions")
  .select("id, correct_key, options")
  .eq("id", 377)
  .single();
const keptAnswer = ((kept?.options ?? []) as { key: string; text: string }[]).find(
  (o) => o.key === kept?.correct_key
)?.text;
if (keptAnswer !== "Double the levothyroxine dose on two days of each week") {
  throw new Error(`#377 no longer answers the dose question: ${keptAnswer}`);
}

{
  const cites = new Set<number>([...((mine.citation_chunk_ids ?? []) as number[]), ...ADD_CITES]);
  for (const e of (mine.explanations ?? []) as { citation_chunk_ids?: number[] }[]) {
    for (const id of e.citation_chunk_ids ?? []) cites.add(id);
  }
  const { data: chunks, error } = await db
    .from("content_chunks")
    .select("id, text")
    .in("id", [...cites]);
  if (error) throw error;
  const passage = (chunks ?? [])
    .map((c) => (c.text as string) ?? "")
    .join("\n")
    .replace(/\s+/g, " ");
  for (const quote of GROUNDS) {
    if (!passage.includes(quote)) {
      throw new Error(`the passages do not contain "${quote.slice(0, 70)}"`);
    }
  }
}

const current = (set[0].options ?? []) as { key: string; text: string }[];
if (!current.some((o) => o.text === DROP)) throw new Error(`"${DROP}" is no longer an option`);
for (const row of set) {
  if (row.id === 388) continue;
  const answerText = ((row.options ?? []) as { key: string; text: string }[]).find(
    (o) => o.key === row.correct_key
  )?.text;
  if (answerText === DROP) throw new Error(`#${row.id} is answered by "${DROP}"`);
}

const texts = [...current.map((o) => o.text).filter((t) => t !== DROP), ANSWER];
if (new Set(texts).size !== texts.length) throw new Error("an option is duplicated");

const OPTIONS = [...texts]
  .sort((a, b) => a.localeCompare(b))
  .map((text, i) => ({ key: String.fromCharCode(65 + i), text }));

for (const o of OPTIONS) console.log(`  ${o.key}. ${o.text}`);
console.log();

for (const row of set) {
  const was = (row.options ?? []) as { key: string; text: string }[];
  const answerText = was.find((o) => o.key === row.correct_key)?.text;
  if (!answerText) throw new Error(`#${row.id}: no option for ${row.correct_key}`);
  const wanted = row.id === 388 ? ANSWER : answerText;
  const next = OPTIONS.find((o) => o.text === wanted);
  if (!next) throw new Error(`#${row.id}: "${wanted}" is not in the new list`);

  const repointed = row.id === 388;
  const explanations = ((row.explanations ?? []) as {
    key: string;
    text: string;
    citation_chunk_ids?: number[];
  }[]).map((e) => {
    if (e.key !== row.correct_key) return e;
    const moved = { ...e, key: next.key };
    if (!repointed) return moved;
    const cites = (moved.citation_chunk_ids ?? []).slice();
    for (const id of ADD_CITES) if (!cites.includes(id)) cites.push(id);
    return { ...moved, text: EXPLANATION, citation_chunk_ids: cites.sort((a, b) => a - b) };
  });

  const update: Record<string, unknown> = {
    options: OPTIONS,
    correct_key: next.key,
    explanations,
  };
  if (repointed) {
    update.stem = STEM;
    const cites = ((row.citation_chunk_ids ?? []) as number[]).slice();
    for (const id of ADD_CITES) if (!cites.includes(id)) cites.push(id);
    update.citation_chunk_ids = cites.sort((a, b) => a - b);
  }

  console.log(`#${row.id} ${row.status}  ${row.correct_key} -> ${next.key}  ${next.text.slice(0, 68)}`);
  if (repointed) {
    console.log(`   was: ${row.stem as string}`);
    console.log(`   now: ${STEM}`);
    console.log(`   explanation ${EXPLANATION.split(/\s+/).length} words`);
    console.log(`   cites -> ${(update.citation_chunk_ids as number[]).join(", ")}`);
  }

  if (apply) {
    const { error } = await db.from("generated_questions").update(update).eq("id", row.id);
    if (error) throw new Error(`#${row.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
