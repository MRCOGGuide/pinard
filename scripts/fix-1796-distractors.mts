/**
 * Give #1796's answer three options it can be confused with.
 *
 *   npx tsx scripts/fix-1796-distractors.mts
 *   npx tsx scripts/fix-1796-distractors.mts --apply
 *
 * The first repair put two surgical options beside the answer, and the
 * answer was still the only one shaped like an answer: it named a
 * resuscitation strategy, a repair route and what to do about the
 * baby, while the others named one or two of the three. Completeness
 * is a tell, and a candidate reads it without knowing any of the
 * medicine.
 *
 * So four options of the same shape, each differing from the answer on
 * exactly one axis:
 *   - the route: open against endovascular, which the guidance settles
 *     on radiation grounds;
 *   - the fluids: permissive hypotension against filling her to a
 *     normal pressure, which "can increase bleeding out or dislodge
 *     the clot";
 *   - the baby: delivery considered before surgery, as "late in the
 *     third trimester consideration may be given to delivering prior
 *     to surgical intervention", against deferring it.
 *
 * Three axes, and a candidate has to be right on all three.
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

const GROUP = "3f973cbf-6fb7-4876-8af4-05022bccaf62";

const OPTIONS = [
  { key: "A", text: "CT abdomen and pelvis" },
  { key: "B", text: "Diagnostic laparoscopy" },
  { key: "C", text: "ERCP" },
  {
    key: "D",
    text: "Intravenous fluids, analgesia, nil by mouth and intravenous antibiotics",
  },
  { key: "E", text: "MRI abdomen and pelvis" },
  {
    key: "F",
    text: "Nasogastric tube insertion, intravenous fluids and nil by mouth",
  },
  { key: "G", text: "Percutaneous nephrostomy" },
  {
    key: "H",
    text: "Permissive hypotension, endovascular repair, and delivery considered at laparotomy",
  },
  {
    key: "I",
    text: "Permissive hypotension, open repair, and delivery considered at laparotomy",
  },
  {
    key: "J",
    text: "Permissive hypotension, open repair, and delivery deferred until after repair",
  },
  { key: "K", text: "Preoperative corticosteroids for fetal lung maturity" },
  {
    key: "L",
    text: "Rapid fluid resuscitation, open repair, and delivery considered at laparotomy",
  },
  { key: "M", text: "Transabdominal ultrasound" },
];

const ANSWERS: Record<number, string> = {
  1796: "Permissive hypotension, open repair, and delivery considered at laparotomy",
  1797: "MRI abdomen and pelvis",
  1798: "ERCP",
};

const { data: rows } = await db
  .from("generated_questions")
  .select("id, correct_key, options, explanations")
  .eq("emq_group_id", GROUP)
  .order("id");
if (!rows?.length) throw new Error("set not found");

for (const text of OPTIONS.map((o) => o.text)) {
  const problems = [...selfTalkProblems(text), ...ukEnglishProblems(text)];
  if (problems.length) throw new Error(problems.join("; "));
}
const sorted = [...OPTIONS].sort((a, b) => a.text.localeCompare(b.text));
if (sorted.map((o) => o.key).join("") !== OPTIONS.map((o) => o.key).join("")) {
  throw new Error("options are not in alphabetical order");
}

/* The four that answer this scenario must weigh the same: the longest
   must not be the right one. */
const strategy = OPTIONS.filter((o) => /repair/.test(o.text)).map((o) => o.text);
const answer = ANSWERS[1796];
const longest = [...strategy].sort((a, b) => b.length - a.length)[0];
if (longest === answer) {
  throw new Error("the answer is the longest of the strategy options");
}

for (const row of rows) {
  const wanted = ANSWERS[row.id];
  const next = OPTIONS.find((o) => o.text === wanted);
  if (!next) throw new Error(`#${row.id}: "${wanted}" is not in the new list`);
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
