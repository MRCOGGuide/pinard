/**
 * The faults the agreement audit found, repaired one at a time.
 *
 *   npx tsx scripts/fix-agreement-eight.mts
 *   npx tsx scripts/fix-agreement-eight.mts --apply
 *
 * Each is an explanation or a stem whose numbers fought each other
 * while the medicine around them was sound, so each repair is the
 * smallest edit that makes them agree. Every replacement is asserted
 * against the text now in the bank: if a row has moved since this was
 * written, it stops rather than writing over it.
 *
 * #90 was repaired separately and is not here.
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

type Edit = {
  id: number;
  why: string;
  /** A phrase to find in the stem, and what to put in its place. */
  stem?: { from: string; to: string };
  /** The whole replacement stem, where the case had to be rebuilt. */
  wholeStem?: string;
  explanation?: { from: string; to: string };
  wholeExplanation?: string;
};

const EDITS: Edit[] = [
  {
    id: 212,
    why: "12% to 3% is a fall of three-quarters, not a halving",
    explanation: {
      from: "meaning trainee attrition almost halved over this six-year period",
      to: "a fall of three-quarters over six years",
    },
  },
  {
    id: 369,
    why: "she cannot be at 24 weeks and one week past her 28-week dose",
    stem: { from: "at 24 weeks of gestation", to: "at 29 weeks of gestation" },
  },
  {
    id: 517,
    why: "26% against 2% is not a five-fold difference; the odds ratio is a separate pooled figure",
    explanation: {
      from: "compared with only 2% in dichorionic twins — a nearly 5-fold increased odds (OR 4.81, 95% CI 1.39–16.6)",
      to: "compared with 2% in dichorionic twins, with pooled odds of neurodevelopmental morbidity 4.81 times higher (95% CI 1.39–16.6)",
    },
  },
  {
    id: 616,
    why: "she is on an ARB and no ACE inhibitor",
    explanation: {
      from: "stopping the ARB (with a plan for the ACE inhibitor)",
      to: "stopping the ARB",
    },
  },
  {
    id: 1463,
    why: "the rule turns on a medial edge within 1 cm of a midline structure, and the tumour was placed at 1.5 cm",
    stem: {
      from: "situated 1.5 cm from the clitoris",
      to: "whose medial edge lies 0.5 cm from the clitoris",
    },
  },
  {
    id: 985,
    why: "the stem called the serum both elevated and negative, and had the assay discrepancy the wrong way round",
    wholeStem:
      "A 58-year-old woman is referred to the gynaecology clinic with a persistently mildly elevated serum hCG. She is postmenopausal, has had no recent pregnancy and takes no medication. Pelvic ultrasound is normal. A urine hCG test taken alongside a repeat serum sample is negative, and when the laboratory reruns the serum on a different immunoassay platform that result is negative too. Which of the following is the most likely explanation for these findings?",
    wholeExplanation:
      "Phantom hCG is a false positive: heterophilic antibodies in the patient's serum cross-react with the animal-derived capture or tracer immunoglobulins of the immunoassay. Such antibodies rarely affect urine and serum together, so both tests cannot be positive at once, and another platform gives another answer. Notify the laboratory and repeat with a different assay.",
  },
];

/* #231 needs a figure its option list does not carry, and an EMQ's
   options belong to the whole set. */
const GROUP_231 = {
  ids: [228, 229, 230, 231],
  option: { key: "K", text: "Over 40%" },
  stem: {
    from: "She asks what the overall chance is that the cell culture will fail and no result be obtained from this sample.",
    to: "She asks how likely it is, at this gestation, that the cell culture will fail and no result be obtained from this sample.",
  },
  explanation:
    "Culture failure after third-trimester amniocentesis climbs steeply with gestation: 2.1% between 24 and 27 weeks, over 40% between 36 and 40 weeks, and around 10% across the third trimester taken as a whole. At 36+2 weeks the figure to quote her is the highest of those, and failure should be anticipated when planning what follows.",
};

function check(text: string) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...sourceNarrationProblems(text),
  ];
  if (problems.length) throw new Error(problems.join("; "));
}

type Row = {
  id: number;
  stem: string;
  correct_key: string;
  options: { key: string; text: string }[] | null;
  explanations: { key: string; text: string }[] | null;
};

async function load(id: number): Promise<Row> {
  const { data } = await db
    .from("generated_questions")
    .select("id, stem, correct_key, options, explanations")
    .eq("id", id)
    .single();
  if (!data) throw new Error(`#${id}: not found`);
  return data as Row;
}

for (const edit of EDITS) {
  const row = await load(edit.id);
  const patch: Record<string, unknown> = {};

  if (edit.wholeStem) {
    check(edit.wholeStem);
    patch.stem = edit.wholeStem;
  } else if (edit.stem) {
    if (!row.stem.includes(edit.stem.from)) throw new Error(`#${edit.id}: "${edit.stem.from}" is not in the stem`);
    const next = row.stem.replace(edit.stem.from, edit.stem.to);
    check(next);
    patch.stem = next;
  }

  const explanations = row.explanations ?? [];
  const correct = explanations.find((e) => e.key === row.correct_key);
  if (!correct) throw new Error(`#${edit.id}: no explanation for the answer`);
  let nextText: string | null = null;
  if (edit.wholeExplanation) {
    nextText = edit.wholeExplanation;
  } else if (edit.explanation) {
    if (!correct.text.includes(edit.explanation.from)) {
      throw new Error(`#${edit.id}: "${edit.explanation.from.slice(0, 40)}…" is not in the explanation`);
    }
    nextText = correct.text.replace(edit.explanation.from, edit.explanation.to);
  }
  if (nextText) {
    check(nextText);
    const words = nextText.split(/\s+/).length;
    if (words > 120) throw new Error(`#${edit.id}: explanation is ${words} words`);
    patch.explanations = explanations.map((e) =>
      e.key === row.correct_key ? { ...e, text: nextText as string } : e
    );
  }

  console.log(`#${edit.id} — ${edit.why}`);
  if (patch.stem) console.log(`   stem: ${(patch.stem as string).slice(0, 220)}…`);
  if (nextText) console.log(`   why:  ${nextText.slice(0, 220)}…`);

  if (apply) {
    const { error } = await db.from("generated_questions").update(patch).eq("id", edit.id);
    if (error) throw new Error(`#${edit.id}: ${error.message}`);
  }
}

/* ------------------------------------------------------------- #231 */
{
  const rows = await Promise.all(GROUP_231.ids.map(load));
  const target = rows.find((r) => r.id === 231)!;
  const options = target.options ?? [];
  if (options.some((o) => o.key === GROUP_231.option.key)) {
    throw new Error("#231: the set already carries an option K");
  }
  const nextOptions = [...options, GROUP_231.option];
  check(GROUP_231.option.text);
  check(GROUP_231.explanation);

  if (!target.stem.includes(GROUP_231.stem.from)) throw new Error("#231: the closing question has moved");
  const nextStem = target.stem.replace(GROUP_231.stem.from, GROUP_231.stem.to);
  check(nextStem);

  console.log(`#231 — at 36+2 weeks the figure to quote is the 36–40 week band, not the third-trimester average`);
  console.log(`   options: + ${GROUP_231.option.key}. ${GROUP_231.option.text} (to all ${rows.length} scenarios)`);
  console.log(`   stem: …${nextStem.slice(-160)}`);
  console.log(`   why:  ${GROUP_231.explanation.slice(0, 220)}…`);

  if (apply) {
    for (const row of rows) {
      const patch: Record<string, unknown> = { options: nextOptions };
      if (row.id === 231) {
        patch.stem = nextStem;
        patch.correct_key = GROUP_231.option.key;
        patch.explanations = (row.explanations ?? []).map((e) =>
          e.key === row.correct_key
            ? { ...e, key: GROUP_231.option.key, text: GROUP_231.explanation }
            : e
        );
      }
      const { error } = await db.from("generated_questions").update(patch).eq("id", row.id);
      if (error) throw new Error(`#${row.id}: ${error.message}`);
    }
  }
}

console.log(apply ? "\nsaved" : "\nnot saved — pass --apply");
