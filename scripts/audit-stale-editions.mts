/**
 * Questions resting on an edition the library has already replaced.
 *
 *   npx tsx scripts/audit-stale-editions.mts
 *
 * #1775 asked for "the most recently reported UK maternal mortality
 * rate" and answered 8.76 per 100 000 maternities — the enquiry for
 * 2013–15, published in 2017. The library also holds the next one,
 * which says 10.90 for 2018–20. A confidential enquiry is republished
 * every three years and a rate from one is right only until the next,
 * so a question that quotes the old one teaches a figure that has
 * moved.
 *
 * The superseded admin screen already groups documents that look like
 * editions of the same thing. This asks the question that screen does
 * not: which questions are standing on the older edition when a newer
 * one is sitting in the same library.
 *
 * Deterministic — the same grouping the screen uses, no model. Every
 * hit is read by a person: a question may cite an older edition for
 * something that has not changed, and often does.
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
const { findSupersededGroups } = await import("../src/lib/duplicates");

const db = createAdminClient();

type DocRow = {
  id: number;
  title: string;
  source_reference: string | null;
  source_year: number | null;
  tog_year: number | null;
  priority: number | null;
  sections: { title: string } | null;
};

const { data: documents } = await db
  .from("content_documents")
  .select("id, title, source_reference, source_year, tog_year, priority, sections(title)");
const docRows = (documents ?? []) as unknown as DocRow[];

/** Any 4-digit year in the reference, as the superseded screen does. */
const yearFrom = (reference: string): number | null => {
  const match = reference.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
};

const chunks = await fetchAll<{ id: number; document_id: number; text: string }>(
  (from, to) => db.from("content_chunks").select("id, document_id, text").range(from, to)
);
const byDocument = new Map<number, { id: number; document_id: number; text: string }[]>();
for (const c of chunks) {
  const list = byDocument.get(c.document_id);
  if (list) list.push(c);
  else byDocument.set(c.document_id, [c]);
}

const groups = findSupersededGroups(
  docRows.map((d) => ({
    id: d.id,
    title: d.title ?? "",
    sourceReference: d.source_reference ?? "",
    year: d.source_year ?? d.tog_year ?? yearFrom(d.source_reference ?? ""),
    sectionTitle: d.sections?.title ?? "",
    approvedQuestions: 0,
    priority: d.priority ?? 0,
  }))
);

const title = new Map(docRows.map((d) => [d.id, d.title]));
const yearOf = new Map(
  docRows.map((d) => [
    d.id,
    d.source_year ?? d.tog_year ?? yearFrom(d.source_reference ?? ""),
  ])
);

/**
 * An erratum is not an edition.
 *
 * The library holds a 2017 "Diagnosis and Management of Ectopic
 * Pregnancy (No. 21)" that is a single page correcting one β-hCG value
 * in the 2016 guideline — "The text should read: … a serum b-hCG less
 * than 1500 iu/l" — and the grouping took it for the next edition,
 * which put three sound questions on this list. A document of one or
 * two chunks that announces itself as a correction replaces nothing.
 */
const CORRECTION = /\b(erratum|corrigendum|correction to|the text should read)\b/i;
function isErratum(docId: number): boolean {
  const pages = byDocument.get(docId) ?? [];
  if (pages.length > 2) return false;
  return pages.some((c) => CORRECTION.test(c.text));
}

/** Document id -> the newer edition that replaces it. */
const replacedBy = new Map<number, { id: number; title: string }>();
for (const group of groups) {
  const [newest, ...older] = group.documents;
  if (!newest) continue;
  for (const doc of older) {
    /* Only where the years actually differ: a re-upload of the same
       year is the superseded screen's business, not this one. */
    if (doc.year && newest.year && doc.year < newest.year && !isErratum(newest.id)) {
      replacedBy.set(doc.id, { id: newest.id, title: newest.title });
    }
  }
}

if (replacedBy.size === 0) {
  console.log("no document in the library has a newer edition beside it");
  process.exit(0);
}

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

const documentOf = new Map(chunks.map((c) => [c.id, c.document_id]));

/** A figure is what goes stale; prose about management usually does not. */
const FIGURE = /\d/;

let faults = 0;
const byPair = new Map<string, { doc: number; questions: number[] }>();
for (const r of rows) {
  const correct = (r.explanations ?? []).find((e) => e.key === r.correct_key);
  const cited = correct?.citation_chunk_ids ?? [];
  if (cited.length === 0) continue;
  const stale = new Set<number>();
  for (const chunk of cited) {
    const doc = documentOf.get(chunk);
    if (doc !== undefined && replacedBy.has(doc)) stale.add(doc);
  }
  if (stale.size === 0) continue;
  /* Every cited passage is from a replaced edition, and the answer is
     a number — which is what a new edition changes. */
  const allStale = cited.every((c) => {
    const doc = documentOf.get(c);
    return doc !== undefined && replacedBy.has(doc);
  });
  if (!allStale || !FIGURE.test(correct?.text ?? "")) continue;

  faults++;
  for (const doc of stale) {
    const key = `${doc}`;
    const seen = byPair.get(key) ?? { doc, questions: [] as number[] };
    seen.questions.push(r.id);
    byPair.set(key, seen);
  }
}

/* By guideline rather than by question: which edition is current is one
   decision per document, not one per card. */
for (const { doc, questions } of byPair.values()) {
  const newer = replacedBy.get(doc);
  console.log(
    `${title.get(doc) ?? doc} (${yearOf.get(doc) ?? "year unknown"}) → ${newer?.title} (${newer ? yearOf.get(newer.id) ?? "year unknown" : "?"})`
  );
  console.log(
    `   ${questions.length} question(s): ${questions.map((q) => `#${q}`).join(", ")}`
  );
}

console.log(
  `\n${rows.length} question(s) read; ${faults} rest on an edition the library has replaced`
);
