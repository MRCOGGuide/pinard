/**
 * Stems that name the answer's own word, and no other option's.
 *
 *   npx tsx scripts/audit-stem-gives-answer.mts
 *
 * #1704 ended "The team discusses INTRAVESICAL treatment to address the
 * underlying bladder urothelial defect", and exactly one of its ten
 * options was intravesical. A candidate who had never heard of a GAG
 * layer could still answer it by matching a word.
 *
 * So: take the words that belong to the correct option and to no
 * other, and look for them in the stem. A word in the stem that
 * narrows the list to one answer is doing the candidate's work,
 * whether or not the writer meant it to.
 *
 * Pure code, no model, and narrowed twice before it was worth
 * running. Any word belonging to the answer alone flags 293 questions,
 * 15% of the bank, because a stem legitimately repeats what it is
 * about: a question on simulation training says simulation, a woman
 * listed for a cystectomy has a cyst.
 *
 * What #1704 did is narrower. The giveaway was a word for HOW the
 * treatment is given — intravesical — and it sat in the sentence that
 * sets up the question, where it reads as a clue rather than as part
 * of the history. So: route and approach words only, and only in the
 * closing sentence.
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

type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  lead_in: string | null;
  correct_key: string;
  options: { key: string; text: string }[] | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, format, stem, lead_in, correct_key, options")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

/** Words that carry no discriminating power. */
const COMMON = new Set([
  "woman",
  "women",
  "patient",
  "management",
  "treatment",
  "therapy",
  "immediate",
  "appropriate",
  "further",
  "repeat",
  "offer",
  "consider",
  "continue",
  "review",
  "weeks",
  "hours",
  "daily",
  "single",
  "first",
  "second",
  "third",
  "dose",
  "doses",
  "risk",
  "within",
  "after",
  "before",
  "under",
  "above",
  "below",
  "every",
  "until",
  "about",
  "around",
  "their",
  "there",
  "which",
  "while",
  "would",
  "should",
  "could",
  "where",
]);

const words = (text: string) =>
  new Set(
    (text.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []).filter((w) => !COMMON.has(w))
  );

/** How a treatment is given, or by what approach — never a diagnosis. */
const ROUTE =
  /^(intra[a-z]+|sub[a-z]+|trans[a-z]+|per[a-z]*cutaneous|laparoscopic|laparotomy|hysteroscopic|cystoscopic|vaginal|abdominal|oral|orally|topical|systemic|parenteral|intravenous|intramuscular|inhaled|rectal|nasal|epidural|spinal|regional|local|open|endoscopic|radiological|surgical|medical|conservative|expectant)$/;

let faults = 0;
for (const r of rows) {
  const options = r.options ?? [];
  const correct = options.find((o) => o.key === r.correct_key);
  if (!correct || options.length < 3) continue;

  const mine = words(correct.text);
  for (const o of options) {
    if (o.key === r.correct_key) continue;
    for (const w of words(o.text)) mine.delete(w);
  }
  if (mine.size === 0) continue;

  /* The lead-in belongs to every option, so a word there gives nothing
     away; only the scenario's own words can, and only where it asks. */
  const sentences = (r.stem ?? "").trim().split(/(?<=[.?!])\s+/);
  const closing = sentences.slice(-2).join(" ").toLowerCase();
  const given = [...mine].filter((w) => ROUTE.test(w) && closing.includes(w));
  if (given.length === 0) continue;

  faults++;
  console.log(`#${r.id} (${r.status}, ${r.format}) stem contains: ${given.join(", ")}`);
  console.log(`   answer: ${correct.text.slice(0, 110)}`);
}

console.log(
  `\n${rows.length} question(s) read; ${faults} stem(s) use a word that belongs to the answer alone`
);
