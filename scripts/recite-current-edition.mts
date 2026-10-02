/**
 * Move a question's citation to the edition that is current.
 *
 *   npx tsx scripts/recite-current-edition.mts stale-figures.txt
 *   npx tsx scripts/recite-current-edition.mts stale-figures.txt --apply
 *
 * audit-stale-figures reads each question written from a replaced
 * edition against the replacement and quotes the sentence that carries
 * its figure. Where the figure has not moved — which is most of them,
 * because a new edition changes a few things and leaves the rest — the
 * question is right and only its citation is out of date.
 *
 * So the quote is found in the current edition, and the question is
 * re-cited to the chunk it sits in. The card then names the guideline
 * a candidate would be marked against, and the stale-edition audit
 * stops flagging a question that has nothing wrong with it.
 *
 * The quote has to be found IN THE NEWER EDITION. A sentence a new
 * edition keeps is a sentence both editions contain, so a plain search
 * of the library finds the old one first and re-cites the question to
 * where it already was. The replacement is worked out the same way the
 * stale-edition audit works it out, and only its chunks are searched.
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
const apply = process.argv.includes("--apply");
const report = fs.readFileSync(process.argv[2], "utf8");

/* The SAME section: "#id  Title (year) → (year)", a note, then a quote. */
const entries: { id: number; quote: string }[] = [];
{
  const lines = report.split(/\r?\n/);
  let inSame = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^=== /.test(lines[i])) inSame = /^=== SAME/.test(lines[i]);
    if (!inSame) continue;
    const m = lines[i].match(/^#(\d+)\s/);
    if (!m) continue;
    const quoteLine = lines.slice(i + 1, i + 4).find((l) => /^\s+"/.test(l));
    if (!quoteLine) continue;
    entries.push({
      id: Number(m[1]),
      quote: quoteLine.trim().replace(/^"|"$/g, ""),
    });
  }
}

/* The two the audit could not quote cleanly, read by hand against the
   current edition: #580's 13% vertical transmission figure and #701's
   2-3% of PID being gonococcal are both in it, word for word. */
const BY_HAND: Record<number, number> = { 580: 19573, 701: 5059 };

console.error(`${entries.length + Object.keys(BY_HAND).length} question(s) to re-cite`);

/* Which document replaces which, as the stale-edition audit decides. */
const { data: documents } = await db
  .from("content_documents")
  .select("id, title, source_reference, source_year, tog_year, priority, sections(title)");
const docRows = (documents ?? []) as unknown as {
  id: number;
  title: string;
  source_reference: string | null;
  source_year: number | null;
  tog_year: number | null;
  priority: number | null;
  sections: { title: string } | null;
}[];
const yearFrom = (reference: string): number | null => {
  const match = reference.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
};
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
const replacedBy = new Map<number, number>();
for (const group of groups) {
  const [newest, ...older] = group.documents;
  if (!newest) continue;
  for (const doc of older) {
    if (doc.year && newest.year && doc.year < newest.year) replacedBy.set(doc.id, newest.id);
  }
}

const chunks = await fetchAll<{ id: number; document_id: number; text: string }>(
  (from, to) => db.from("content_chunks").select("id, document_id, text").range(from, to)
);
const tidy = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const flat = chunks.map((c) => ({ ...c, flat: tidy(c.text) }));

const moved: string[] = [];
const refused: string[] = [];

async function recite(id: number, chunkId: number, document: number) {
  const { data: row } = await db
    .from("generated_questions")
    .select("id, correct_key, explanations, source_document_ids")
    .eq("id", id)
    .single();
  if (!row) {
    refused.push(`#${id} — not found`);
    return;
  }
  const explanations = (row.explanations ?? []) as {
    key: string;
    text: string;
    citation_chunk_ids?: number[];
  }[];
  if (!explanations.some((e) => e.key === row.correct_key)) {
    refused.push(`#${id} — no explanation for the answer`);
    return;
  }
  moved.push(`#${id} → chunk ${chunkId} (doc ${document})`);
  if (!apply) return;
  const { error } = await db
    .from("generated_questions")
    .update({
      explanations: explanations.map((e) =>
        e.key === row.correct_key ? { ...e, citation_chunk_ids: [chunkId] } : e
      ),
      citation_chunk_ids: [chunkId],
      source_document_ids: [document],
    })
    .eq("id", id);
  if (error) throw new Error(`#${id}: ${error.message}`);
}

const documentOf = new Map(chunks.map((c) => [c.id, c.document_id]));

for (const entry of entries) {
  /* Where the question stands now, and what replaces it. */
  const { data: row } = await db
    .from("generated_questions")
    .select("correct_key, explanations")
    .eq("id", entry.id)
    .single();
  const cited =
    ((row?.explanations ?? []) as { key: string; citation_chunk_ids?: number[] }[]).find(
      (e) => e.key === row?.correct_key
    )?.citation_chunk_ids ?? [];
  const currentDoc = cited
    .map((c) => documentOf.get(c))
    .map((d) => (d === undefined ? undefined : replacedBy.get(d)))
    .find((d): d is number => d !== undefined);
  if (currentDoc === undefined) {
    refused.push(`#${entry.id} — no replacement edition for what it cites`);
    continue;
  }
  const needle = tidy(entry.quote).slice(0, 60);
  const found = flat.find((c) => c.document_id === currentDoc && c.flat.includes(needle));
  if (!found) {
    refused.push(`#${entry.id} — the quoted sentence is in no chunk of document ${currentDoc}`);
    continue;
  }
  await recite(entry.id, found.id, found.document_id);
}
for (const [id, chunkId] of Object.entries(BY_HAND)) {
  const chunk = flat.find((c) => c.id === chunkId);
  if (!chunk) {
    refused.push(`#${id} — chunk ${chunkId} is not there`);
    continue;
  }
  await recite(Number(id), chunk.id, chunk.document_id);
}

for (const line of moved) console.log(line);
console.log(`\n${moved.length} re-cited${apply ? "" : " (not saved)"}, ${refused.length} refused`);
for (const line of refused) console.log(`  ${line}`);
