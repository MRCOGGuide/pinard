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
 * Two arms, and they are not equally sharp. "The stem contains the
 * whole answer" is nearly always a real fault. "The stem names what the
 * answer names" is a list to read: a stem that says gabapentin because
 * she takes gabapentin is a history, while #1856's "she asks about
 * injectable progestogen contraception" against an answer of
 * "Injectable progestogen: appropriate despite enzyme-inducing
 * medication" is the question answering itself. Thirty-six questions
 * trip the second arm and most of them are histories.
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
 *
 * #1773 then slipped through that, because its giveaway was not a
 * route. Its stem said "UAE with polyvinyl alcohol (PVA) particles"
 * and again "chains of PVA particles", against an option reading
 * "Polyvinyl alcohol particle embolism" — most of the answer, written
 * out in the question. So there is a second test: the share of the
 * answer's own distinctive words that the stem contains. A stem
 * repeating one of them is a stem about something; a stem containing
 * three quarters of them has written the answer down.
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
  const stem = (r.stem ?? "").toLowerCase();
  const sentences = (r.stem ?? "").trim().split(/(?<=[.?!])\s+/);
  const closing = sentences.slice(-2).join(" ").toLowerCase();
  const given = [...mine].filter((w) => ROUTE.test(w) && closing.includes(w));

  /*
    Or the whole answer, anywhere in the stem. Three quarters of it was
    too loose: a question about magnesium sulphate says magnesium
    sulphate, and "Reduce magnesium sulphate infusion to 0.5 g/hour"
    keeps its content in the figure, which the stem does not give. So:
    every word of the answer, at least two of them, and no number in
    the option — because where there is a number, the number is the
    answer and the words are only its subject.
  */
  const own = [...words(correct.text)];
  const echoed = own.filter((w) => stem.includes(w));
  const mostOfIt =
    own.length >= 2 && echoed.length === own.length && !/\d/.test(correct.text);

  /*
    Or the thing the answer names, even where its qualifier is not in
    the stem. #1856 ended "She asks about injectable progestogen
    contraception" against an answer of "Injectable progestogen:
    appropriate despite enzyme-inducing medication": the words that
    matter were all there, and the words that were not are the reason
    it is right, which the candidate was supposed to supply. So the
    first two words the answer owns, taken together, are enough.
  */
  const head = own.slice(0, 2);
  /*
    In the closing sentence, not anywhere in the stem. A history that
    mentions what the answer is about is a history; the same words in
    the sentence that sets up the question are a clue, which is where
    #1704's "intravesical" and #1856's "injectable progestogen" both
    sat.
  */
  const named =
    head.length === 2 && head.every((w) => closing.includes(w)) && !/\d/.test(correct.text);

  if (given.length === 0 && !mostOfIt && !named) continue;

  faults++;
  console.log(
    `#${r.id} (${r.status}, ${r.format}) ${
      given.length
        ? `stem contains: ${given.join(", ")}`
        : mostOfIt
          ? `stem contains the whole answer: ${echoed.join(", ")}`
          : `stem names what the answer names: ${head.join(" ")}`
    }`
  );
  console.log(`   answer: ${correct.text.slice(0, 110)}`);
}

console.log(
  `\n${rows.length} question(s) read; ${faults} stem(s) use a word that belongs to the answer alone`
);
