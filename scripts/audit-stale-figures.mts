/**
 * Does the current edition still say what the question says?
 *
 *   npx tsx scripts/audit-stale-figures.mts
 *   npx tsx scripts/audit-stale-figures.mts only:1243
 *
 * audit-stale-editions finds questions standing on an edition the
 * library has replaced. Most will be fine — a new edition of a
 * guideline changes a few numbers, not all of them — so this reads the
 * replacement and asks, per question, whether the figure it quotes is
 * still the figure.
 *
 * Three answers: the new edition says the same, it says something
 * different, or it does not address this at all. Each must be quoted
 * from the new edition verbatim, and the quote is checked against the
 * passages before the verdict is believed, because "the new edition
 * says X" is exactly the kind of claim a model will produce on
 * request.
 *
 * Nothing is written. A figure that has moved is a question to repair
 * by hand, and a figure that has not is a citation to move forward.
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
const { claudeClient, claudeModel } = await import("../src/lib/anthropic");
const { retrieveChunks } = await import("../src/lib/retrieval");

const db = createAdminClient();
const client = claudeClient({ maxRetries: 3 });
const model = claudeModel();

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

const yearFrom = (reference: string): number | null => {
  const match = reference.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
};
const yearOf = new Map(
  docRows.map((d) => [d.id, d.source_year ?? d.tog_year ?? yearFrom(d.source_reference ?? "")])
);
const title = new Map(docRows.map((d) => [d.id, d.title]));

const groups = findSupersededGroups(
  docRows.map((d) => ({
    id: d.id,
    title: d.title ?? "",
    sourceReference: d.source_reference ?? "",
    year: yearOf.get(d.id) ?? null,
    sectionTitle: d.sections?.title ?? "",
    approvedQuestions: 0,
    priority: d.priority ?? 0,
  }))
);

const replacedBy = new Map<number, number>();
for (const group of groups) {
  const [newest, ...older] = group.documents;
  if (!newest) continue;
  for (const doc of older) {
    if (doc.year && newest.year && doc.year < newest.year) replacedBy.set(doc.id, newest.id);
  }
}

type Row = {
  id: number;
  status: string;
  stem: string;
  correct_key: string;
  options: { key: string; text: string }[] | null;
  explanations: { key: string; text: string; citation_chunk_ids?: number[] }[] | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, stem, correct_key, options, explanations")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

const chunks = await fetchAll<{ id: number; document_id: number; text: string; chunk_index: number }>(
  (from, to) => db.from("content_chunks").select("id, document_id, text, chunk_index").range(from, to)
);
const documentOf = new Map(chunks.map((c) => [c.id, c.document_id]));
const byDocument = new Map<number, typeof chunks>();
for (const c of chunks) {
  const list = byDocument.get(c.document_id);
  if (list) list.push(c);
  else byDocument.set(c.document_id, [c]);
}

const only = process.argv.find((a) => a.startsWith("only:"));
const wanted = only ? new Set(only.slice(5).split(",").map(Number)) : null;

const work: { row: Row; oldDoc: number; newDoc: number }[] = [];
for (const r of rows) {
  if (wanted && !wanted.has(r.id)) continue;
  const correct = (r.explanations ?? []).find((e) => e.key === r.correct_key);
  const cited = correct?.citation_chunk_ids ?? [];
  if (cited.length === 0) continue;
  const docs = cited.map((c) => documentOf.get(c)).filter((d): d is number => d !== undefined);
  if (docs.length === 0 || !docs.every((d) => replacedBy.has(d))) continue;
  if (!/\d/.test(correct?.text ?? "")) continue;
  work.push({ row: r, oldDoc: docs[0], newDoc: replacedBy.get(docs[0])! });
}
console.error(`${work.length} question(s) to re-read against the current edition`);

const SYSTEM = `You are checking whether a guideline's current edition still says what a question says.

You are given a question written from an EARLIER edition, with the explanation printed under it, and passages from the CURRENT edition of the same guideline.

Decide ONE thing: is the figure or statement the question turns on still what the current edition gives?

  "same"      — the current edition gives the same figure or statement.
  "different" — the current edition gives a different figure or statement for the same thing. This is the one that matters.
  "absent"    — the passages you were given do not address it. Say so rather than guessing; you are seeing part of a document, not all of it.

Judge the figure the ANSWER turns on, not every number in the explanation. A new edition changes a few things and leaves the rest.

Quote verbatim from the current edition's passages whenever you say "same" or "different" — the sentence that carries the figure. No quote means "absent".

Reply with JSON only:
{"verdict":"same"|"different"|"absent","quote":"<verbatim from the passages, or empty>","note":"<one short clause>"}`;

function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      continue;
    }
    if (c === '"') inString = !inString;
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

const tidy = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

const results: { id: number; verdict: string; quote: string; note: string; pair: string }[] = [];

for (const { row, oldDoc, newDoc } of work) {
  const correct = (row.explanations ?? []).find((e) => e.key === row.correct_key);
  const answer = (row.options ?? []).find((o) => o.key === row.correct_key)?.text ?? "?";
  const pool = byDocument.get(newDoc) ?? [];

  /* The passages most likely to carry it: whatever the question is
     about, plus anything in the new edition with the same figures in
     it, since a figure is what moves between editions. */
  const picked = new Map<number, string>();
  try {
    const found = await retrieveChunks(`${row.stem}\n${correct?.text ?? ""}`, null, 20);
    for (const f of found) {
      if (f.document_id === newDoc) picked.set(f.chunk_id, f.text);
    }
  } catch {
    // The number search below still finds most of them.
  }
  const figures = (correct?.text.match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => n.length > 1);
  for (const c of pool) {
    if (picked.size >= 10) break;
    if (figures.some((f) => c.text.includes(f))) picked.set(c.id, c.text);
  }
  if (picked.size === 0) {
    for (const c of pool.slice(0, 6)) picked.set(c.id, c.text);
  }

  const body = [
    `QUESTION: ${row.stem}`,
    `MARKED ANSWER: ${answer}`,
    `EXPLANATION (from the earlier edition): ${correct?.text ?? ""}`,
    `PASSAGES FROM THE CURRENT EDITION:\n${[...picked.values()].join("\n\n").slice(0, 30000)}`,
  ].join("\n\n");

  let verdict = "unread";
  let quote = "";
  let note = "";
  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const parsed = JSON.parse(json) as { verdict: string; quote?: string; note?: string };
    verdict = parsed.verdict;
    quote = (parsed.quote ?? "").trim();
    note = (parsed.note ?? "").trim();
    /* A quote that is not in the passages is a quote it wrote. */
    if (quote) {
      const corpus = tidy([...picked.values()].join(" "));
      if (!corpus.includes(tidy(quote).slice(0, 40))) {
        verdict = "absent";
        note = `quoted something not in the current edition: ${quote.slice(0, 60)}`;
        quote = "";
      }
    } else if (verdict !== "absent") {
      verdict = "absent";
      note = note || "no quote given";
    }
  } catch (e) {
    note = (e as Error).message;
  }

  results.push({
    id: row.id,
    verdict,
    quote,
    note,
    pair: `${title.get(oldDoc)} (${yearOf.get(oldDoc)}) → (${yearOf.get(newDoc)})`,
  });
}

for (const verdict of ["different", "absent", "same", "unread"]) {
  const list = results.filter((r) => r.verdict === verdict);
  if (list.length === 0) continue;
  console.log(`\n=== ${verdict.toUpperCase()} (${list.length}) ===`);
  for (const r of list) {
    console.log(`#${r.id}  ${r.pair}`);
    if (r.note) console.log(`   ${r.note}`);
    if (r.quote) console.log(`   "${r.quote.replace(/\s+/g, " ").slice(0, 220)}"`);
  }
}
