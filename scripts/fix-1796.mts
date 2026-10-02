/**
 * #1796 could be answered without reading it, and left the baby out.
 *
 *   npx tsx scripts/fix-1796.mts
 *   npx tsx scripts/fix-1796.mts --apply
 *
 * A woman collapses at 30 weeks with haemoperitoneum, and the only
 * option in the list that is an operation at all is the answer. The
 * rest are a CT, an MRI, an ultrasound, a nephrostomy, an ERCP, a
 * nasogastric tube. A candidate who read nothing but the first line
 * would still score.
 *
 * The answer also stopped at the mother. The source does not: "It is
 * rarely necessary to deliver the fetus to treat the mother; however,
 * late in the third trimester consideration may be given to delivering
 * prior to surgical intervention. In cases where the patient is
 * critically ill … delivery of the baby increases the effectiveness of
 * maternal resuscitation and improves recovery time."
 *
 * So the answer carries the birth, and two distractors join the list
 * that differ from it the way the decisions differ in theatre — fluid
 * strategy, and open against endovascular repair, which the same
 * guidance settles on radiation grounds.
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
const { selfTalkProblems, ukEnglishProblems, sourceNarrationProblems } = await import(
  "../src/lib/generation"
);

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const GROUP = "3f973cbf-6fb7-4876-8af4-05022bccaf62";

/** Alphabetical, as the set already was. */
const OPTIONS = [
  { key: "A", text: "CT abdomen and pelvis" },
  { key: "B", text: "Diagnostic laparoscopy" },
  {
    key: "C",
    text: "Endovascular repair, with caesarean birth once she is stable",
  },
  { key: "D", text: "ERCP" },
  {
    key: "E",
    text: "Intravenous fluids, analgesia, nil by mouth and intravenous antibiotics",
  },
  { key: "F", text: "MRI abdomen and pelvis" },
  {
    key: "G",
    text: "Nasogastric tube insertion, intravenous fluids and nil by mouth",
  },
  { key: "H", text: "Percutaneous nephrostomy" },
  {
    key: "I",
    text: "Permissive hypotension and emergency open repair, with delivery considered at laparotomy",
  },
  { key: "J", text: "Preoperative corticosteroids for fetal lung maturity" },
  {
    key: "K",
    text: "Rapid fluid resuscitation to a normal blood pressure, then open surgical repair",
  },
  { key: "L", text: "Transabdominal ultrasound" },
];

/** Each scenario keeps its answer; the letters move with the list. */
const ANSWERS: Record<number, string> = {
  1796: "Permissive hypotension and emergency open repair, with delivery considered at laparotomy",
  1797: "MRI abdomen and pelvis",
  1798: "ERCP",
};

const EXPLANATION_1796 =
  "The priority is diagnosis and permissive hypotension: filling her to a normal blood pressure risks increasing the bleeding or dislodging the clot. Open repair is preferred to endovascular because of the radiation exposure. Delivery is rarely needed to treat the mother, but late in the third trimester it may be considered before surgery, and in a critically ill woman it makes resuscitation more effective.";

/* The aneurysm paragraph, and the one on delivering at laparotomy. */
const CITES_1796 = [15988, 15984];

const { data: rows } = await db
  .from("generated_questions")
  .select("id, stem, correct_key, options, explanations")
  .eq("emq_group_id", GROUP)
  .order("id");
if (!rows?.length) throw new Error("set not found");

for (const text of [EXPLANATION_1796, ...OPTIONS.map((o) => o.text)]) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...sourceNarrationProblems(text),
  ];
  if (problems.length) throw new Error(problems.join("; "));
}
const sorted = [...OPTIONS].sort((a, b) => a.text.localeCompare(b.text));
if (sorted.map((o) => o.key).join("") !== OPTIONS.map((o) => o.key).join("")) {
  throw new Error("options are not in alphabetical order");
}
const words = EXPLANATION_1796.split(/\s+/).length;
if (words > 75) throw new Error(`explanation is ${words} words`);

for (const row of rows) {
  const wanted = ANSWERS[row.id];
  if (!wanted) throw new Error(`#${row.id}: no answer mapped`);
  const next = OPTIONS.find((o) => o.text === wanted);
  if (!next) throw new Error(`#${row.id}: "${wanted}" is not in the new list`);
  const explanations = (row.explanations ?? []) as {
    key: string;
    text: string;
    citation_chunk_ids?: number[];
  }[];

  console.log(`#${row.id}  ${row.correct_key} -> ${next.key}  ${next.text}`);

  if (apply) {
    const patch: Record<string, unknown> = {
      options: OPTIONS,
      correct_key: next.key,
      explanations: explanations.map((e) =>
        e.key === row.correct_key
          ? {
              ...e,
              key: next.key,
              ...(row.id === 1796
                ? { text: EXPLANATION_1796, citation_chunk_ids: CITES_1796 }
                : {}),
            }
          : e
      ),
    };
    if (row.id === 1796) patch.citation_chunk_ids = CITES_1796;
    const { error } = await db.from("generated_questions").update(patch).eq("id", row.id);
    if (error) throw new Error(`#${row.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved — pass --apply");
