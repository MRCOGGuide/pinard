/**
 * Questions whose evidence is a bibliography.
 *
 *   npx tsx scripts/audit-citation-quality.mts
 *
 * #90 asked which procedure reduces dichorionic triplets to dichorionic
 * twins, and cited two chunks. Both were reference lists. The only
 * sentence in the library supporting its answer was the TITLE of
 * reference 106 — "Embryo reduction in dichorionic triplets to
 * dichorionic twins by intrafetal laser" — so the question tested
 * whether a candidate had read a 2014 case series' title, and the
 * grounding check passed it because the words were, literally, there.
 *
 * A reference list is recognisable without a model: numbered entries,
 * initials before surnames, journal abbreviations, years and page
 * ranges, several per chunk. The test is the density of those, not
 * their presence — a guideline paragraph carries superscript markers
 * and the odd citation, a bibliography is nothing else.
 *
 * Every hit is read by a person. A question can cite a reference list
 * among other passages and still rest on the guidance in them; what
 * matters is a question with nowhere else to stand.
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
  correct_key: string;
  explanations: { key: string; text: string; citation_chunk_ids?: number[] }[] | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, format, stem, correct_key, explanations")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

const chunks = await fetchAll<{ id: number; text: string }>((from, to) =>
  db.from("content_chunks").select("id, text").range(from, to)
);
const text = new Map(chunks.map((c) => [c.id, c.text]));

/**
 * How much of a passage is bibliography.
 *
 * Counting the parts of a citation separately does not separate
 * anything: years, initials and "et al" are scattered through
 * guideline prose, and a threshold on their density condemned a fifth
 * of the library. A COMPLETE citation is the discriminator — a volume,
 * a year and a page range in one another's company, "2006;21:1912" or
 * "35 (2014): 83–86" — which prose almost never contains and a
 * reference list is made of nothing else.
 */
function citationCount(passage: string): number {
  const forms = [
    /\b\d{4};\s?\d+(?:\s?\(\d+\))?:\s?\d+/g, // Hum Reprod 2006;21:1912
    /\(\s?\d{4}\s?\)\s?:\s?\d+[–-]\d+/g, // Fetal Diagn Ther 35 (2014): 83–86
    /\b\d{4};\s?\d+:\s?[A-Z]{2}\d+/g, // Cochrane, 2017;1:CD004454
  ];
  let n = 0;
  for (const re of forms) n += (passage.match(re) ?? []).length;
  return n;
}

/**
 * Ordinary words, of the kind sentences are held together with.
 *
 * Citations alone still catch the wrong thing. A "Spotlight on…"
 * editorial cites a paper in every second sentence and is prose all
 * the same — three of the first four questions this audit flagged were
 * grounded in one, and every claim they made was in the text. What a
 * reference list lacks is not citations but sentences: across the
 * library, a reference list runs at 12 to 19 of these per thousand
 * characters, an editorial at 29 to 34, guideline prose at 42 to 45.
 */
const FUNCTION_WORDS =
  /\b(the|of|and|to|in|is|are|was|were|be|with|for|that|this|as|by|on|from|should|may|can|women|woman|risk)\b/gi;

/**
 * Four complete citations, enough of them for the passage's length
 * that it is a list rather than a paragraph ending in one, and too few
 * ordinary words to be prose.
 */
function isBibliography(passage: string): boolean {
  const n = citationCount(passage);
  const length = Math.max(passage.length, 1);
  const prose = ((passage.match(FUNCTION_WORDS) ?? []).length * 1000) / length;
  return n >= 4 && (n * 1000) / length >= 2.5 && prose < 25;
}

let faults = 0;
for (const r of rows) {
  const correct = (r.explanations ?? []).find((e) => e.key === r.correct_key);
  const cited = correct?.citation_chunk_ids ?? [];
  if (cited.length === 0) continue;
  const readable = cited.filter((id) => text.has(id));
  if (readable.length === 0) continue;
  if (!readable.every((id) => isBibliography(text.get(id) as string))) continue;
  faults++;
  console.log(
    `#${r.id} (${r.status}, ${r.format}) every cited passage is a reference list: ${readable
      .map((id) => `${id} (${citationCount(text.get(id) as string)} citations)`)
      .join(", ")}`
  );
  console.log(`   ${r.stem.replace(/\s+/g, " ").slice(0, 160)}`);
}

console.log(
  `\n${rows.length} question(s) read; ${faults} rest on nothing but a bibliography`
);
