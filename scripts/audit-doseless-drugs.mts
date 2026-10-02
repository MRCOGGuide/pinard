/**
 * Answers that name a drug where their own source names the dose.
 *
 *   npx tsx scripts/audit-doseless-drugs.mts
 *   npx tsx scripts/audit-doseless-drugs.mts only:1935
 *   npx tsx scripts/audit-doseless-drugs.mts --json
 *
 * #1935 asked which drug reverses magnesium toxicity and the answer
 * was "Calcium gluconate". A registrar holding that answer still
 * cannot treat the woman, and Green-top 56 gives the prescription in
 * one line: slow intravenous injection of 10 ml of 10% calcium
 * gluconate. The same complaint had already been made about naming the
 * drug rather than the class, and this is its sequel.
 *
 * No model. For each question it takes the drugs named in the answer
 * and its explanation, asks whether a dose appears anywhere near the
 * drug IN THE PASSAGES THE QUESTION ITSELF CITES, and reports the ones
 * where the source has a dose and the card does not. The quote is
 * printed so the repair can be judged without opening the source.
 *
 * Deliberately narrow:
 *
 *  - Only the drugs on the list below, which are the ones a candidate
 *    prescribes in an emergency or is examined on by dose. A general
 *    drug-name detector would flag every mention of HRT.
 *  - A dose has to sit within 120 characters of the drug's name in the
 *    passage, or "40 mg" three paragraphs away becomes this drug's
 *    dose.
 *  - A question whose answer IS a dose, or whose options are doses, is
 *    skipped: it is already testing the number.
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
const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const ONLY = args
  .filter((a) => a.startsWith("only:"))
  .flatMap((a) => a.slice(5).split(",").map(Number));

/**
 * Drugs examined by dose: the emergency drugs, the antidotes, and the
 * ones whose dose is the whole point of the recommendation.
 */
const DRUGS = [
  "calcium gluconate",
  "calcium chloride",
  "magnesium sulfate",
  "magnesium sulphate",
  "labetalol",
  "hydralazine",
  "nifedipine",
  "methyldopa",
  "oxytocin",
  "ergometrine",
  "carboprost",
  "misoprostol",
  "mifepristone",
  "tranexamic acid",
  "adrenaline",
  "naloxone",
  "protamine",
  "phytomenadione",
  "vitamin K",
  "anti-D",
  "folic acid",
  "aspirin",
  "enoxaparin",
  "dalteparin",
  "tinzaparin",
  "warfarin",
  "benzylpenicillin",
  "clindamycin",
  "gentamicin",
  "co-amoxiclav",
  "metronidazole",
  "erythromycin",
  "azithromycin",
  "doxycycline",
  "ceftriaxone",
  "methotrexate",
  "betamethasone",
  "dexamethasone",
  "prednisolone",
  "hydrocortisone",
  "levothyroxine",
  "carbimazole",
  "propylthiouracil",
  "terbutaline",
  "atosiban",
  "nitrofurantoin",
  "trimethoprim",
  "fluconazole",
  "aciclovir",
  "zidovudine",
  "insulin",
  "metformin",
  "tibolone",
  "norethisterone",
  "ulipristal",
  "levonorgestrel",
];

/** A dose: a number with a unit, or a strength. */
const DOSE =
  /\b\d+(?:[.,]\d+)?\s*(?:mg|g|microgram(?:s)?|mcg|ug|iu|units?|ml|mmol|%)\b|\b\d+\s*mg\/(?:kg|h|day)\b/i;

type Row = {
  id: number;
  status: string;
  format: string;
  correct_key: string;
  stem: string;
  options: { key: string; text: string }[] | null;
  explanations: { key: string; text: string; citation_chunk_ids?: number[] }[] | null;
  explanation: string | null;
  citation_chunk_ids: number[] | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select(
      "id, status, format, correct_key, stem, options, explanations, explanation, citation_chunk_ids"
    )
    .neq("status", "rejected")
    .order("id")
    .range(from, to)
);

/* One pass for the chunks, so this is two queries and no model calls. */
const wantedChunks = new Set<number>();
for (const r of rows) {
  for (const id of r.citation_chunk_ids ?? []) wantedChunks.add(id);
  for (const e of r.explanations ?? []) for (const id of e.citation_chunk_ids ?? []) wantedChunks.add(id);
}
const chunkText = new Map<number, string>();
{
  const ids = [...wantedChunks];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("content_chunks")
      .select("id, text")
      .in("id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const c of data ?? []) chunkText.set(c.id as number, (c.text as string) ?? "");
  }
}

/** Does the passage give a dose for this drug, and what does it say? */
function doseInSource(drug: string, passage: string): string | null {
  const flat = passage.replace(/\s+/g, " ");
  const re = new RegExp(drug.replace(/[-\s]/g, "[-\\s]?"), "gi");
  for (const m of flat.matchAll(re)) {
    const at = m.index ?? 0;
    const window = flat.slice(Math.max(0, at - 120), at + 120);
    if (DOSE.test(window)) return window.trim();
  }
  return null;
}

let read = 0;
const found: {
  id: number;
  status: string;
  drug: string;
  answer: string;
  quote: string;
}[] = [];

for (const r of rows) {
  if (ONLY.length && !ONLY.includes(r.id)) continue;

  const options = r.options ?? [];
  const answer = options.find((o) => o.key === r.correct_key)?.text ?? "";
  const expl =
    (r.explanations ?? []).find((e) => e.key === r.correct_key)?.text ?? r.explanation ?? "";
  if (!answer && !expl) continue;
  read += 1;

  /* A question already testing a number is not missing one. */
  if (DOSE.test(answer)) continue;
  const dosedOptions = options.filter((o) => DOSE.test(o.text)).length;
  if (dosedOptions >= 2) continue;

  const card = `${answer}\n${expl}`;
  if (DOSE.test(card)) continue;

  const cites = new Set<number>(r.citation_chunk_ids ?? []);
  for (const e of r.explanations ?? []) for (const id of e.citation_chunk_ids ?? []) cites.add(id);
  const passage = [...cites].map((id) => chunkText.get(id) ?? "").join("\n");
  if (!passage) continue;

  for (const drug of DRUGS) {
    const re = new RegExp(`\\b${drug.replace(/[-\s]/g, "[-\\s]?")}\\b`, "i");
    if (!re.test(card)) continue;
    const quote = doseInSource(drug, passage);
    if (!quote) continue;
    found.push({ id: r.id, status: r.status, drug, answer, quote });
    break;
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify(found, null, 1));
} else {
  for (const f of found) {
    console.log(`#${f.id}  ${f.status}  ${f.drug}`);
    console.log(`   answer: ${f.answer.slice(0, 90)}`);
    console.log(`   source: ...${f.quote.slice(0, 200)}...`);
  }
  console.log(
    `\n${read} question(s) read, ${found.length} name a drug the source doses and the card does not`
  );
}
