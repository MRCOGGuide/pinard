/**
 * Wording copied from the cited guidance (L7.2, "facts, not text").
 *
 *   npx tsx --conditions=react-server scripts/audit-overlap.mts [--pending] [--min 10] [--out .review/overlap.json]
 *
 * Read-only. For every approved question (or the pending queue with
 * --pending), compares what a candidate reads (lead-in, stem, options,
 * explanations) with the passages the question cites, and lists any run
 * of --min words or more (10 by default) shared with one of them, using
 * the measure the generator now applies before it stores a question
 * (src/lib/sourceOverlap). Prints totals; the list, with each run and the
 * passage it came from, goes to the --out file, which is kept out of git.
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
const overlap = await import("../src/lib/sourceOverlap");

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const status = process.argv.includes("--pending") ? "pending" : "approved";
const min = Number(arg("--min") ?? overlap.COPIED_RUN);
const out = arg("--out") ?? `.review/overlap-${status}.json`;
if (!out.startsWith(".review/")) {
  console.error("--out must be inside .review/, which is kept out of git.");
  process.exit(1);
}

const db = createAdminClient();

type Question = {
  id: number;
  format: string;
  stem: string;
  lead_in: string | null;
  options: { key: string; text: string }[];
  explanation: string | null;
  explanations: { key: string; text: string; citation_chunk_ids?: number[] }[] | null;
  citation_chunk_ids: number[] | null;
  emq_group_id: string | null;
};

const questions = await fetchAll<Question>((from, to) =>
  db
    .from("generated_questions")
    .select("id, format, stem, lead_in, options, explanation, explanations, citation_chunk_ids, emq_group_id")
    .eq("status", status)
    .order("id")
    .range(from, to)
);

const citedBy = (q: Question) =>
  [...new Set([...(q.citation_chunk_ids ?? []), ...(q.explanations ?? []).flatMap((e) => e.citation_chunk_ids ?? [])])];

const chunkIds = [...new Set(questions.flatMap(citedBy))];
const chunks = new Map<number, { text: string; document_id: number }>();
for (let i = 0; i < chunkIds.length; i += 200) {
  const { data, error } = await db.from("content_chunks").select("id, text, document_id").in("id", chunkIds.slice(i, i + 200));
  if (error) throw new Error(error.message);
  for (const c of data ?? []) chunks.set(c.id as number, { text: c.text as string, document_id: c.document_id as number });
}
const docIds = [...new Set([...chunks.values()].map((c) => c.document_id))];
const references = new Map<number, string>();
for (let i = 0; i < docIds.length; i += 200) {
  const { data } = await db.from("content_documents").select("id, source_reference, title").in("id", docIds.slice(i, i + 200));
  for (const d of data ?? []) references.set(d.id as number, (d.source_reference as string) || (d.title as string) || "");
}

type Finding = { id: number; format: string; part: string; words: number; run: string; chunk_id: number; source: string };
const findings: Finding[] = [];
let missingCitations = 0;
for (const q of questions) {
  const cited = citedBy(q)
    .map((id) => ({ chunk_id: id, text: chunks.get(id)?.text ?? "" }))
    .filter((p) => p.text);
  if (cited.length === 0) {
    missingCitations++;
    continue;
  }
  const index = overlap.overlapIndex(cited, min);
  const parts: { part: string; text: string | null }[] = [
    { part: "lead-in", text: q.lead_in },
    { part: "stem", text: q.stem },
    ...q.options.map((o) => ({ part: `option ${o.key}`, text: o.text })),
    { part: "explanation", text: q.explanation },
    ...(q.explanations ?? []).map((e) => ({ part: `explanation ${e.key}`, text: e.text })),
  ];
  for (const p of parts) {
    if (!p.text) continue;
    const run = overlap.longestCopiedRun(p.text, index, min);
    if (!run) continue;
    const source = references.get(chunks.get(run.chunkId)?.document_id ?? -1) ?? "";
    findings.push({ id: q.id, format: q.format, part: p.part, words: run.words, run: run.text, chunk_id: run.chunkId, source });
  }
}

const flagged = new Set(findings.map((f) => f.id));
const sets = new Set(questions.filter((q) => flagged.has(q.id) && q.emq_group_id).map((q) => q.emq_group_id));
const byPart = new Map<string, number>();
for (const f of findings) {
  const kind = f.part.replace(/ [A-Z]$/, "");
  byPart.set(kind, (byPart.get(kind) ?? 0) + 1);
}
const lengths = findings.map((f) => f.words).sort((a, b) => a - b);

console.log(`${status} questions read: ${questions.length} (${missingCitations} with no cited passage on file)`);
console.log(`runs of ${min}+ words copied from a cited passage: ${findings.length}, in ${flagged.size} questions (${sets.size} EMQ sets)`);
console.log(`by part: ${[...byPart.entries()].map(([k, v]) => `${k} ${v}`).join("; ") || "none"}`);
if (lengths.length) console.log(`run length: median ${lengths[lengths.length >> 1]} words, longest ${lengths[lengths.length - 1]}`);

findings.sort((a, b) => b.words - a.words || a.id - b.id);
fs.writeFileSync(out, JSON.stringify(findings, null, 2));
console.log(`list written to ${out}`);
