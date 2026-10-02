/**
 * Cards that name the drug and leave the dose in the source.
 *
 *   npx tsx scripts/name-the-dose.mts
 *   npx tsx scripts/name-the-dose.mts --apply
 *
 * #1935 answered "Calcium gluconate" to magnesium toxicity, and the
 * reviewer's note was the same one made about naming a class instead of
 * a drug: the registrar still cannot write the chart. Three more cards
 * tell a candidate to give a drug whose dose their own cited passage
 * states, and each gets it.
 *
 * Nothing here is from memory. The sentence is quoted beside the edit
 * and asserted against the passage at run time, so this script cannot
 * apply a dose the source does not carry.
 *
 * Found with audit-doseless-drugs.mts, which flagged eighteen. The
 * other fifteen name a drug in passing, in a question about a risk
 * figure or a safety alert, or the source doses something adjacent
 * rather than the drug the card gives: #48 is the instructive one,
 * where the answer is "increased doses of antiviral agents" and the
 * guidance says only that immunosuppression "may require increased
 * doses". There is no number to add, so none was added.
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
} = await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

type Edit = {
  id: number;
  /** Replaced in the answer's explanation; must still be there. */
  from: string;
  to: string;
  /** Must appear in the question's own cited passages, flattened. */
  grounds: string[];
};

const EDITS: Edit[] = [
  {
    id: 25,
    from: "commence broad-spectrum IV antibiotics (e.g. IV clindamycin plus gentamicin)",
    to: "commence broad-spectrum IV antibiotics (e.g. IV clindamycin 900 mg three times a day plus IV gentamicin)",
    grounds: ["IV clindamycin 900 mg three times a day plus IV gentamicin"],
  },
  {
    id: 1216,
    from: "it is started at 12+0 weeks in a woman at risk of pre-eclampsia",
    to: "aspirin 150 mg once daily at night is started at 12+0 weeks and continued to 36+6 in a woman at risk of pre-eclampsia",
    grounds: ["aspirin 150 mg once daily at night from 12+0"],
  },
  {
    id: 1785,
    from:
      "A standard course of betamethasone or dexamethasone should be given when preterm delivery is imminent between 24 and 34 weeks.",
    to:
      "A standard course should be given when preterm delivery is imminent between 24 and 34 weeks: betamethasone 12 mg intramuscularly in two doses 24 hours apart, or dexamethasone 6 mg intramuscularly in four doses 12 hours apart, any regimen being reasonable so long as 24 mg of either drug is given over 24 to 48 hours.",
    grounds: [
      "two 12-mg doses, 24 hours apart",
      "24 mg of either drug is given within a 24",
    ],
  },
];

for (const edit of EDITS) {
  const { data: row } = await db
    .from("generated_questions")
    .select("id, status, correct_key, explanation, explanations, citation_chunk_ids")
    .eq("id", edit.id)
    .single();
  if (!row) throw new Error(`#${edit.id}: not found`);

  /* The passages this question cites, and nothing wider. */
  const cites = new Set<number>((row.citation_chunk_ids ?? []) as number[]);
  for (const e of (row.explanations ?? []) as { citation_chunk_ids?: number[] }[]) {
    for (const id of e.citation_chunk_ids ?? []) cites.add(id);
  }
  const { data: chunks, error: chunkError } = await db
    .from("content_chunks")
    .select("id, text")
    .in("id", [...cites]);
  if (chunkError) throw chunkError;
  const passage = (chunks ?? [])
    .map((c) => (c.text as string) ?? "")
    .join("\n")
    .replace(/\s+/g, " ");

  for (const quote of edit.grounds) {
    if (!passage.includes(quote)) {
      throw new Error(`#${edit.id}: the passages do not contain "${quote}"`);
    }
  }

  const problems = [
    ...selfTalkProblems(edit.to),
    ...ukEnglishProblems(edit.to),
    ...sourceNarrationProblems(edit.to),
    ...emDashProblems(edit.to),
  ];
  if (problems.length) throw new Error(`#${edit.id}: ${problems.join("; ")}`);

  const update: Record<string, unknown> = {};
  let after = "";

  if (typeof row.explanation === "string" && row.explanation.includes(edit.from)) {
    after = row.explanation.replace(edit.from, edit.to);
    update.explanation = after;
  } else {
    const list = (row.explanations ?? []) as {
      key: string;
      text: string;
      citation_chunk_ids?: number[];
    }[];
    const answer = list.find((e) => e.key === row.correct_key);
    if (!answer) throw new Error(`#${edit.id}: no explanation for ${row.correct_key}`);
    if (!answer.text.includes(edit.from)) {
      throw new Error(`#${edit.id}: "${edit.from.slice(0, 40)}..." is not in the explanation`);
    }
    after = answer.text.replace(edit.from, edit.to);
    update.explanations = list.map((e) =>
      e.key === row.correct_key ? { ...e, text: after } : e
    );
  }

  const long = explanationLengthProblems(after);
  if (long.length) throw new Error(`#${edit.id}: ${long.join("; ")}`);

  console.log(`#${edit.id} ${row.status}  ${after.split(/\s+/).length} words`);
  console.log(`   - ${edit.from}`);
  console.log(`   + ${edit.to}`);
  console.log(`   source: "${edit.grounds[0]}"`);

  if (apply) {
    const { error } = await db.from("generated_questions").update(update).eq("id", edit.id);
    if (error) throw new Error(`#${edit.id}: ${error.message}`);
  }
}

console.log(`\n${EDITS.length} explanation(s) ${apply ? "saved" : "to save - pass --apply"}`);
