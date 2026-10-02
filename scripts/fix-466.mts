/**
 * #466 marked the thing its explanation says not to do.
 *
 *   npx tsx scripts/fix-466.mts
 *   npx tsx scripts/fix-466.mts --apply
 *
 * A woman with PAS, placenta left in situ, asks whether methotrexate
 * can be used. The answer was the bare option "Methotrexate adjuvant
 * therapy", and the explanation under it reads "Methotrexate adjuvant
 * therapy should not be used when the placenta is left in situ". The
 * option asserted what the card then denied, and every other option in
 * the list was a risk figure belonging to another scenario, so it was
 * also the only thing she could be told.
 *
 * The answer is now the advice itself, and the distractors are the
 * same drug offered three ways: outright, conditionally at six weeks,
 * and alongside surveillance. A candidate has to know that none of
 * them is right.
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

const WAS = "Methotrexate adjuvant therapy";
const ANSWER =
  "Methotrexate should not be used; arrange serial ultrasound and ready access to emergency care";
const ADDED = [
  "Methotrexate to accelerate placental resorption",
  "Methotrexate only if the placenta has not resorbed by 6 weeks",
  "Methotrexate alongside serial ultrasound to reduce the risk of haemorrhage",
];

const { data: rows } = await db
  .from("generated_questions")
  .select("id, correct_key, options, explanations, emq_group_id")
  .eq("id", 466)
  .single();
if (!rows) throw new Error("no question 466");
const group = rows.emq_group_id as string;

const { data: set } = await db
  .from("generated_questions")
  .select("id, correct_key, options, explanations")
  .eq("emq_group_id", group)
  .order("id");
if (!set?.length) throw new Error("set not found");

const current = (set[0].options ?? []) as { key: string; text: string }[];
if (!current.some((o) => o.text === WAS)) throw new Error("the option has moved");

const texts = [
  ...current.filter((o) => o.text !== WAS).map((o) => o.text),
  ANSWER,
  ...ADDED,
];
if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) {
  throw new Error("an added option is already in the list");
}
for (const text of [ANSWER, ...ADDED]) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...emDashProblems(text),
  ];
  if (problems.length) throw new Error(problems.join("; "));
}

const OPTIONS = [...texts]
  .sort((a, b) => a.localeCompare(b))
  .map((text, i) => ({ key: String.fromCharCode(65 + i), text }));

for (const row of set) {
  const options = (row.options ?? []) as { key: string; text: string }[];
  const answerText = options.find((o) => o.key === row.correct_key)?.text;
  const wanted = answerText === WAS ? ANSWER : answerText;
  const next = OPTIONS.find((o) => o.text === wanted);
  if (!next) throw new Error(`#${row.id}: "${wanted}" is not in the new list`);
  const explanations = (row.explanations ?? []) as { key: string; text: string }[];

  console.log(`#${row.id}  ${row.correct_key} -> ${next.key}  ${next.text.slice(0, 80)}`);

  if (apply) {
    const { error } = await db
      .from("generated_questions")
      .update({
        options: OPTIONS,
        correct_key: next.key,
        explanations: explanations.map((e) =>
          e.key === row.correct_key ? { ...e, key: next.key } : e
        ),
      })
      .eq("id", row.id);
    if (error) throw new Error(`#${row.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
