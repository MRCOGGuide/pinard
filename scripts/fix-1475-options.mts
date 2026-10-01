/**
 * Replace the two odds ratios sitting in #1475's option list.
 *
 *   npx tsx scripts/fix-1475-options.mts
 *   npx tsx scripts/fix-1475-options.mts --apply
 *
 * The set asks for a treatment, a psychological intervention and a
 * questionnaire, and two of its twelve options are "OR 1.78 (95% CI
 * 0.99–3.2)" and "OR 2.0 (95% CI 1.48–2.71)". No candidate answers
 * "which treatment?" with an odds ratio, so the two are not
 * distractors at all — they are two fewer options to think about.
 *
 * They are replaced by a questionnaire and a treatment that are both
 * real and both wrong here, and the list is re-keyed by text, as this
 * bank always re-keys.
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
const db = createAdminClient();
const apply = process.argv.includes("--apply");

/** Alphabetical, as the set already was. */
const OPTIONS = [
  { key: "A", text: "Cognitive behavioural therapy (CBT) with or without antidepressants" },
  { key: "B", text: "Edinburgh Postnatal Depression Scale (EPDS)" },
  { key: "C", text: "Greene Climacteric Scale" },
  { key: "D", text: "HRT alone or in combination with antidepressants" },
  { key: "E", text: "Melatonin 1–5 mg orally" },
  { key: "F", text: "Meno-D questionnaire" },
  { key: "G", text: "Menopause Rating Scale (MRS)" },
  { key: "H", text: "Perimenopause" },
  { key: "I", text: "Postmenopause" },
  { key: "J", text: "St John's Wort" },
  { key: "K", text: "Testosterone supplementation" },
  { key: "L", text: "Women's Health Questionnaire (WHQ)" },
];

const { data: rows } = await db
  .from("generated_questions")
  .select("id, correct_key, options, explanations, emq_group_id")
  .eq("emq_group_id", "0a159db0-299c-418b-a71e-55b7295f01b7")
  .order("id");
if (!rows?.length) throw new Error("set not found");

for (const row of rows) {
  const options = (row.options ?? []) as { key: string; text: string }[];
  const answerText = options.find((o) => o.key === row.correct_key)?.text;
  if (!answerText) throw new Error(`#${row.id}: no answer text`);
  /* Re-key by what the option says, never by the letter it had. */
  const next = OPTIONS.find((o) => o.text === answerText);
  if (!next) throw new Error(`#${row.id}: "${answerText}" is not in the new list`);

  const explanations = (row.explanations ?? []) as { key: string; text: string }[];
  console.log(`#${row.id}  ${row.correct_key} -> ${next.key}  ${next.text}`);

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

console.log(apply ? "\nsaved" : "\nnot saved — pass --apply");
