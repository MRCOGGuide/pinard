/**
 * A malformation rate without the malformations named.
 *
 *   npx tsx scripts/name-the-malformation.mts
 *   npx tsx scripts/name-the-malformation.mts --apply
 *
 * #1885 told a woman on lamotrigine that her risk of major congenital
 * malformation is 2-5% and left it there. The figure is what the
 * question asks for, but a woman in a pre-conception clinic asks what
 * the malformations are next, and the answer is in the same table the
 * question was written from: cardiac defects and facial clefts.
 *
 * Three explanations in the bank quote a named drug's malformation
 * rate and never say what it malforms. Each gets the pattern its own
 * source carries, and nothing else: where the library does not name
 * the malformations for a drug, as it does not for mycophenolate, the
 * explanation still says only that the drug is teratogenic.
 *
 * Table 5 of the TOG review of epilepsy in pregnancy (chunks 16615 and
 * 16616) is the source for all three patterns, so #614 and #603, whose
 * rates come from elsewhere, have it added to their citations.
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
} = await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

/* The table rows, verbatim, so an edit cannot drift from the source. */
const TABLE5 = {
  lamotrigine: "Cardiac defects Facial clefts",
  levetiracetam: "Cardiac defects Neural tube defects",
  valproate: "Neural tube defects Facial clefts Hypospadias",
};

type Edit = {
  id: number;
  /* The sentence the new one follows, which must still be there. */
  after: string;
  sentence: string;
  /* Chunks that carry the malformation pattern, if not already cited. */
  cite?: number[];
};

const EDITS: Edit[] = [
  {
    id: 1885,
    after:
      "Lamotrigine monotherapy carries a 2–5% risk of major congenital malformation (MCM), which is dose-dependent.",
    sentence:
      "The malformations associated with lamotrigine are cardiac defects and facial clefts.",
    /*
      The sentence that followed read "This is comparable to
      carbamazepine and represents one of the lowest MCM rates among
      AEDs": once the pattern is named, the comparison is worth making
      on both counts, so it now reads "Carbamazepine carries the same
      rate and the same pattern, and both are among the lowest MCM
      rates of the AEDs". Applied by hand; recorded here, not re-run.
    */
  },
  {
    id: 614,
    after:
      "These distinctions are directly relevant when counselling women about antiepileptic drug (AED) choice before conception.",
    sentence:
      "The malformations associated with levetiracetam are cardiac defects and neural tube defects; lamotrigine and carbamazepine are associated with cardiac defects and facial clefts.",
    cite: [16615, 16616],
  },
  {
    id: 603,
    after:
      "explanation of the need for highly effective contraception, and pregnancy testing before and during treatment as appropriate.",
    sentence:
      "The malformations associated with valproate are neural tube defects, facial clefts and hypospadias, and the risk is dose-dependent.",
    cite: [16615, 16616],
  },
];

/*
  Every clause of the added sentences, checked against the rows above
  rather than against a memory of them.
*/
const CLAIMS: [string, keyof typeof TABLE5][] = [
  ["cardiac defects", "lamotrigine"],
  ["facial clefts", "lamotrigine"],
  ["cardiac defects", "levetiracetam"],
  ["neural tube defects", "levetiracetam"],
  ["neural tube defects", "valproate"],
  ["facial clefts", "valproate"],
  ["hypospadias", "valproate"],
];
for (const [defect, drug] of CLAIMS) {
  if (!TABLE5[drug].toLowerCase().includes(defect)) {
    throw new Error(`Table 5 does not give ${defect} for ${drug}`);
  }
}

let changed = 0;
for (const edit of EDITS) {
  const { data: row } = await db
    .from("generated_questions")
    .select("id, status, format, correct_key, explanation, explanations, citation_chunk_ids")
    .eq("id", edit.id)
    .single();
  if (!row) throw new Error(`#${edit.id}: not found`);

  const problems = [
    ...selfTalkProblems(edit.sentence),
    ...ukEnglishProblems(edit.sentence),
    ...sourceNarrationProblems(edit.sentence),
    ...emDashProblems(edit.sentence),
  ];
  if (problems.length) throw new Error(`#${edit.id}: ${problems.join("; ")}`);

  const insert = (text: string): string => {
    const at = text.indexOf(edit.after);
    if (at === -1) throw new Error(`#${edit.id}: the sentence it follows has changed`);
    const end = at + edit.after.length;
    return `${text.slice(0, end)} ${edit.sentence}${text.slice(end)}`;
  };

  const update: Record<string, unknown> = {};

  if (typeof row.explanation === "string" && row.explanation.includes(edit.after)) {
    update.explanation = insert(row.explanation);
  } else {
    const list = (row.explanations ?? []) as { key: string; text: string }[];
    const answer = list.find((e) => e.key === row.correct_key);
    if (!answer) throw new Error(`#${edit.id}: no explanation for ${row.correct_key}`);
    update.explanations = list.map((e) =>
      e.key === row.correct_key ? { ...e, text: insert(e.text) } : e
    );
  }

  if (edit.cite) {
    const cites = ((row.citation_chunk_ids ?? []) as number[]).slice();
    for (const id of edit.cite) if (!cites.includes(id)) cites.push(id);
    update.citation_chunk_ids = cites.sort((a, b) => a - b);
  }

  console.log(`#${edit.id} ${row.status}`);
  console.log(`   + ${edit.sentence}`);
  if (edit.cite) console.log(`   cites -> ${(update.citation_chunk_ids as number[]).join(", ")}`);

  if (apply) {
    const { error } = await db
      .from("generated_questions")
      .update(update)
      .eq("id", edit.id);
    if (error) throw new Error(`#${edit.id}: ${error.message}`);
  }
  changed += 1;
}

console.log(`\n${changed} explanation(s) ${apply ? "saved" : "to save - pass --apply"}`);
