/**
 * Does this question's source name a drug at all?
 *
 *   npx tsx scripts/find-agent-in-source.mts 1123 sertraline fluoxetine
 *   npx tsx scripts/find-agent-in-source.mts 1944            # -in/-ase endings
 *
 * The repair refuses a card whose passages name no drug, and a refusal
 * is only worth trusting if it can be checked. This reads the whole of
 * every document the question cites, not the window around the
 * citation.
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
const db = createAdminClient();

const id = Number(process.argv[2]);
const terms = process.argv.slice(3);

const { data: q } = await db
  .from("generated_questions")
  .select("id, source_document_ids, explanations, correct_key")
  .eq("id", id)
  .single();
if (!q) throw new Error(`no question ${id}`);

const docs = new Set<number>((q.source_document_ids ?? []) as number[]);
for (const e of (q.explanations ?? []) as { citation_chunk_ids?: number[] }[]) {
  const { data: cs } = await db
    .from("content_chunks")
    .select("document_id")
    .in("id", e.citation_chunk_ids ?? []);
  for (const c of cs ?? []) docs.add(c.document_id as number);
}

const { data: titles } = await db
  .from("content_documents")
  .select("id, title")
  .in("id", [...docs]);
for (const t of titles ?? []) console.log(`doc ${t.id}: ${t.title}`);

const { data: chunks } = await db
  .from("content_chunks")
  .select("text")
  .in("document_id", [...docs]);
const corpus = (chunks ?? []).map((c) => (c.text as string)).join("\n");

if (terms.length === 0) {
  /* Whatever looks like a drug: the endings UK generic names are built from. */
  const DRUGLIKE =
    /\b[A-Za-z]{5,}(?:cillin|mycin|micin|oxacin|cycline|parin|olol|dipine|sartan|pril|prost|profen|azole|vir|ase|tinib|platin|taxel|mab|caine|statin|stone|stol|xaban|gatran|floxacin|cef[a-z]+)\b/g;
  const found = new Map<string, number>();
  for (const m of corpus.match(DRUGLIKE) ?? []) {
    const w = m.toLowerCase();
    found.set(w, (found.get(w) ?? 0) + 1);
  }
  const sorted = [...found.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  console.log(`\n${sorted.length} drug-shaped word(s):`);
  for (const [w, n] of sorted) console.log(`  ${String(n).padStart(3)}  ${w}`);
} else {
  for (const t of terms) {
    const re = new RegExp(t, "gi");
    const hits = corpus.match(re) ?? [];
    console.log(`\n${t}: ${hits.length} hit(s)`);
    if (hits.length) {
      const i = corpus.search(re);
      console.log(`  …${corpus.slice(Math.max(0, i - 260), i + 320).replace(/\s+/g, " ")}…`);
    }
  }
}
