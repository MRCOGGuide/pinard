import "server-only";
import type { RetrievedChunk } from "@/lib/retrieval";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The legal index (the owner's brief, part 4): every law, legal case and
 * piece of professional or regulatory guidance named in the library,
 * with what it establishes and where it appears
 * (scripts/build-legal-index.mts). Only an entry the owner has approved
 * is used.
 *
 * Ask Pinard's planning step is shown a catalogue of the entries and
 * picks those that bear on the question. An entry is a guide, not a
 * source: it brings the passages where the law is discussed into the
 * answer, and those passages are what the answer cites and what every
 * check reads, so nothing about grounding changes.
 */

export type LegalKind = "law" | "case" | "guidance";
export type LegalMention = { document_id: number; chunk_id: number; statement: string };

export type LegalEntry = {
  id: number;
  name: string;
  kind: LegalKind;
  jurisdiction: string;
  establishes: string;
  topics: string[];
  mentions: LegalMention[];
};

/** Passages the index may add to an answer, across all its entries. */
const LEGAL_PASSAGES = 8;

const TTL = 10 * 60 * 1000;
let cache: { at: number; entries: LegalEntry[] } | null = null;

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** All the approved entries, read once every ten minutes per server. */
export async function approvedLegalEntries(): Promise<LegalEntry[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.entries;
  const { data, error } = await createAdminClient()
    .from("legal_index")
    .select("id,name,kind,jurisdiction,establishes,topics,mentions")
    .eq("status", "approved")
    .order("id");
  // No index is no worse than before there was one.
  cache = { at: Date.now(), entries: error ? [] : ((data ?? []) as LegalEntry[]) };
  return cache.entries;
}

/** One line per entry, for the planner: "12. Mental Capacity Act 2005 — ... | capacity, best interests". */
export function legalCatalogue(entries: LegalEntry[]): string {
  return entries.map((e) => `${e.id}. ${short(e.name, 80)} — ${short(e.establishes, 150)} | ${e.topics.join(", ")}`).join("\n");
}

/** The entries for the answer to apply. */
export function formatLegal(entries: LegalEntry[]): string {
  return entries.map((e) => `${e.name}${e.jurisdiction ? ` (${e.jurisdiction})` : ""}: ${e.establishes}`).join("\n");
}

const wordsOf = (text: string) => new Set((text.toLowerCase().match(/[a-z]{4,}/g) ?? []));

/**
 * Where the chosen entries are discussed, those closest to the question
 * first, taking in turn from each entry so that none is left without its
 * passage. An entry can be named in hundreds of passages, and the ones a
 * case turns on are those that share its words.
 */
export async function legalPassages(entries: LegalEntry[], question: string, already: RetrievedChunk[]): Promise<RetrievedChunk[]> {
  const ids = [...new Set(entries.flatMap((e) => e.mentions.map((m) => m.chunk_id)))].filter((id) => !already.some((p) => p.chunk_id === id));
  if (ids.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("content_chunks")
    .select("id,document_id,section_id,chunk_index,text,content_documents(title,source_reference)")
    .in("id", ids);
  if (error) return [];
  type Row = { id: number; document_id: number; section_id: number; chunk_index: number; text: string; content_documents: { title: string; source_reference: string } | null };
  const asked = wordsOf(question);
  const shared = (text: string) => [...wordsOf(text)].filter((w) => asked.has(w)).length;
  const rows = new Map(((data ?? []) as unknown as Row[]).map((r) => [r.id, r]));
  /* What the passage says about this law counts double: a long passage
     on something else shares words with any question. */
  const lists = entries.map((e) =>
    e.mentions
      .map((m) => ({ row: rows.get(m.chunk_id), score: 2 * shared(m.statement) + (rows.has(m.chunk_id) ? shared(rows.get(m.chunk_id)!.text) : 0) }))
      .filter((m): m is { row: Row; score: number } => Boolean(m.row))
      .sort((x, y) => y.score - x.score)
      .map((m) => m.row)
  );
  const chosen = new Map<number, Row>();
  for (let rank = 0; chosen.size < LEGAL_PASSAGES && lists.some((l) => l[rank]); rank++) {
    for (const list of lists) {
      if (list[rank] && chosen.size < LEGAL_PASSAGES) chosen.set(list[rank].id, list[rank]);
    }
  }
  return [...chosen.values()].map((r) => ({
    chunk_id: r.id,
    document_id: r.document_id,
    section_id: r.section_id,
    chunk_index: r.chunk_index,
    text: r.text,
    similarity: 0,
    document_title: r.content_documents?.title ?? "",
    source_reference: r.content_documents?.source_reference ?? "",
  }));
}
