/**
 * An EMQ read from three cystometrograms, and a figure for #1758.
 *
 *   npx tsx scripts/add-urodynamics-set.mts
 *   npx tsx scripts/add-urodynamics-set.mts --apply
 *
 * Needs supabase/phase35-figure.sql to have been run first; it checks.
 *
 * Urodynamics is the one topic in this syllabus that is read rather
 * than recalled, and the bank had no way to show a trace. Three
 * scenarios, the same ten options, and the difference between them is
 * entirely in the figure: a leak on a cough with Pdet flat, a leak on
 * an unprovoked detrusor contraction, and one woman with both.
 *
 * Everything the traces show is in the passages the questions cite. A
 * cough gives "an acute and equal rise in Pabd and Pves, with little or
 * no rise in Pdet". Stress incontinence is "urinary leakage seen during
 * filling, in the presence of raised abdominal pressure during the
 * urodynamic stress test but in the absence of a detrusor contraction".
 * Detrusor overactivity is "unprovoked rises in detrusor pressure
 * associated with the sensations of urgency". Low compliance is a
 * "steep rise in detrusor pressure during filling" — #1758's answer,
 * which now has the trace to go with it.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";

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
const { parseFigure } = await import("../src/lib/figure");
const { selfTalkProblems, ukEnglishProblems, sourceNarrationProblems } = await import(
  "../src/lib/generation"
);

const db = createAdminClient();
const apply = process.argv.includes("--apply");

/* The column has to exist before anything else is worth doing. */
{
  const { error } = await db.from("generated_questions").select("figure").limit(1);
  if (error) {
    throw new Error(
      `the figure column is not there yet — run supabase/phase35-figure.sql first (${error.message})`
    );
  }
}

const SECTION = 35;
const DOCS = [746];
/* The cough rule and the stress-test definition; the overactivity figure. */
const CITES = [15736, 15737];

const OPTIONS = [
  { key: "A", text: "Bladder outflow obstruction" },
  { key: "B", text: "Detrusor overactivity" },
  { key: "C", text: "Detrusor overactivity with urodynamic stress incontinence" },
  { key: "D", text: "Detrusor underactivity" },
  { key: "E", text: "Low bladder compliance" },
  { key: "F", text: "Normal filling cystometry" },
  { key: "G", text: "Rectal contraction artefact" },
  { key: "H", text: "Urodynamic stress incontinence" },
  { key: "I", text: "Vesical catheter displacement artefact" },
  { key: "J", text: "Voiding dysfunction" },
];

const LEAD_IN =
  "Each of the following women has been referred with lower urinary tract symptoms and has undergone filling cystometry. For each trace, select the SINGLE most likely urodynamic diagnosis from the list above. Each option may be used once, more than once or not at all.";

const SCENARIOS = [
  {
    stem:
      "A 54-year-old woman, para 3, describes leaking with coughing, laughing and lifting her grandchildren. She has no urgency and does not leak on the way to the toilet. Filling cystometry is performed and the trace is shown.",
    key: "H",
    explanation:
      "Each cough raises Pabd and Pves together and leaves Pdet flat, which is what a cough should do; urine is seen at the moment of two of them. Leakage during filling with a raised abdominal pressure and no detrusor contraction is urodynamic stress incontinence.",
    figure: {
      placement: "stem",
      kind: "cystometrogram",
      caption: "Filling cystometry",
      capacity: 480,
      coughs: [100, 200, 300, 400],
      sensations: { fd: 180, nd: 300, sd: 450 },
      detrusor: { kind: "stable" },
      leaks: [
        { at: 300, during: "cough" },
        { at: 400, during: "cough" },
      ],
    },
  },
  {
    stem:
      "A 61-year-old woman describes sudden urgency several times an hour and leaking before she reaches the toilet. She does not leak when she coughs. Filling cystometry is performed and the trace is shown.",
    key: "B",
    explanation:
      "Detrusor pressure rises twice between the coughs, unprovoked, as she reports urgency, and urine is seen at the peak of the second rise. Unprovoked rises in Pdet during filling are detrusor overactivity; neither the cause nor the severity can be read from cystometry alone.",
    figure: {
      placement: "stem",
      kind: "cystometrogram",
      caption: "Filling cystometry",
      capacity: 320,
      coughs: [80, 160, 240],
      sensations: { fd: 90, nd: 150, sd: 240 },
      detrusor: {
        kind: "phasic",
        rises: [
          { at: 150, amplitude: 22 },
          { at: 250, amplitude: 34 },
        ],
      },
      leaks: [{ at: 250, during: "contraction" }],
    },
  },
  {
    stem:
      "A 48-year-old woman describes leaking both when she coughs and when she cannot reach the toilet in time, and is unsure which troubles her more. Filling cystometry is performed and the trace is shown.",
    key: "C",
    explanation:
      "The trace shows both patterns: urine at the moment of a cough, with Pdet flat, and urine again on an unprovoked rise in Pdet between coughs. Leakage on raised abdominal pressure without a detrusor contraction is stress incontinence; the unprovoked rise is detrusor overactivity, and she has each.",
    figure: {
      placement: "stem",
      kind: "cystometrogram",
      caption: "Filling cystometry",
      capacity: 380,
      coughs: [90, 180, 270, 350],
      sensations: { fd: 120, nd: 220, sd: 340 },
      detrusor: { kind: "phasic", rises: [{ at: 220, amplitude: 28 }] },
      leaks: [
        { at: 180, during: "cough" },
        { at: 220, during: "contraction" },
      ],
    },
  },
];

/** The trace that belongs under #1758, which already has the words. */
const FIGURE_1758 = {
  placement: "explanation",
  kind: "cystometrogram",
  caption: "Filling cystometry after pelvic radiotherapy",
  capacity: 220,
  coughs: [60, 120, 180],
  sensations: { fd: 70, nd: 130, sd: 200 },
  detrusor: { kind: "low-compliance", endPressure: 42 },
};

for (const s of SCENARIOS) {
  for (const text of [s.stem, s.explanation]) {
    const problems = [
      ...selfTalkProblems(text),
      ...ukEnglishProblems(text),
      ...sourceNarrationProblems(text),
    ];
    if (problems.length) throw new Error(problems.join("; "));
  }
  if (!parseFigure(s.figure)) throw new Error(`the figure for "${s.key}" does not parse`);
  if (!OPTIONS.some((o) => o.key === s.key)) throw new Error(`no option ${s.key}`);
}
if (!parseFigure(FIGURE_1758)) throw new Error("#1758's figure does not parse");
if (new Set(SCENARIOS.map((s) => s.key)).size !== SCENARIOS.length) {
  throw new Error("two scenarios share an answer");
}

const group = randomUUID();
const rows = SCENARIOS.map((s) => ({
  section_id: SECTION,
  format: "emq",
  stem: s.stem,
  options: OPTIONS,
  correct_key: s.key,
  explanations: [
    {
      key: s.key,
      verdict: "correct",
      text: s.explanation,
      citation_chunk_ids: CITES,
      source_reference: "https://doi.org/10.1111/tog.12595",
    },
  ],
  citation_chunk_ids: CITES,
  status: "pending",
  lead_in: LEAD_IN,
  emq_group_id: group,
  source_document_ids: DOCS,
  priority: 2,
  difficulty: 3,
  figure: s.figure,
  coverage_note:
    "Reads the diagnosis off a filling cystometrogram: stress incontinence, detrusor overactivity, and both in one woman.",
}));

for (const r of rows) {
  console.log(`${r.correct_key}  ${r.stem.slice(0, 90)}…`);
}
console.log(`\n#1758 gains its ${FIGURE_1758.caption.toLowerCase()}`);

if (!apply) {
  console.log("\nnot saved — pass --apply");
  process.exit(0);
}

const { data, error } = await db.from("generated_questions").insert(rows).select("id");
if (error) throw error;
console.log(`\ninserted ${data?.length ?? 0}: ${(data ?? []).map((d) => `#${d.id}`).join(", ")}`);

const { error: figureError } = await db
  .from("generated_questions")
  .update({ figure: FIGURE_1758 })
  .eq("id", 1758);
if (figureError) throw figureError;
console.log("#1758 now carries its trace");
