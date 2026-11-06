import "server-only";
import { searchedDocumentIds } from "@/lib/decision-aid-searched";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/all";

/**
 * One document in the library twice. The ESC pregnancy guideline went in
 * as sources 92 and 1012, the same file to the byte. Its 24 aids, with the
 * owner's corrections, sat on 92, so 1012 showed none and searching it paid
 * for all of them again (owner, 6 November 2026).
 *
 * Two tests, as neither finds them all: Storage's own checksums for the
 * same file, and the first passage for the same text in another file, which
 * is how the sepsis guideline came to be 9 and 58. The second reads about
 * 3 MB, so pages share a copy for a few minutes. A search reads it afresh.
 */
export type Twin = { id: number; title: string; aids: number; searched: boolean };

type Source = { id: number; title: string; file_url: string | null };

const FOLDER = "docs";

async function fileChecksums(): Promise<Map<string, string>> {
  const storage = createAdminClient().storage.from("sources");
  const sums = new Map<string, string>();
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const { data } = await storage.list(FOLDER, { limit: page, offset });
    for (const file of data ?? []) {
      const sum = (file.metadata as { eTag?: string } | null)?.eTag;
      if (sum) sums.set(`${FOLDER}/${file.name}`, sum);
    }
    if (!data || data.length < page) return sums;
  }
}

/** Each id with the others that share its key. */
export function twinsByKey(entries: { id: number; key: string | null | undefined }[]): Record<number, number[]> {
  const groups = new Map<string, number[]>();
  for (const { id, key } of entries) {
    if (key) groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  const twins: Record<number, number[]> = {};
  for (const ids of groups.values()) {
    if (ids.length > 1) for (const id of ids) twins[id] = ids.filter((other) => other !== id);
  }
  return twins;
}

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The start of a source's first passage, or nothing if it is too short to tell by. */
export function openingKey(text: string): string | null {
  const key = words(text).slice(0, 600);
  return key.length >= 200 ? key : null;
}

/** Both tests together, so that a source matched by either has all its copies. */
export function joinTwins(...maps: Record<number, number[]>[]): Record<number, number[]> {
  const joined: Record<number, Set<number>> = {};
  for (const map of maps) {
    for (const [id, others] of Object.entries(map)) {
      for (const other of others) (joined[Number(id)] ??= new Set()).add(other);
    }
  }
  return Object.fromEntries(Object.entries(joined).map(([id, others]) => [id, [...others]]));
}

async function readTwins(sources: Pick<Source, "id" | "file_url">[]): Promise<Record<number, number[]>> {
  const db = createAdminClient();
  const [sums, firsts] = await Promise.all([
    fileChecksums(),
    fetchAll<{ document_id: number; text: string }>((from, to) =>
      db.from("content_chunks").select("document_id, text").eq("chunk_index", 0).order("document_id").range(from, to)
    ),
  ]);
  return joinTwins(
    twinsByKey(sources.map((s) => ({ id: s.id, key: s.file_url ? sums.get(s.file_url) : null }))),
    twinsByKey(firsts.map((c) => ({ id: c.document_id, key: openingKey(c.text) })))
  );
}

const SHARED_FOR_MS = 5 * 60 * 1000;
let shared: { at: number; twins: Promise<Record<number, number[]>> } | null = null;

/** Every source's copies, for the pages that count by source. */
export async function libraryTwins(): Promise<Record<number, number[]>> {
  if (shared && Date.now() - shared.at < SHARED_FOR_MS) return shared.twins;
  const twins = fetchAll<Source>((from, to) => createAdminClient().from("content_documents").select("id, title, file_url").order("id").range(from, to)).then(readTwins);
  shared = { at: Date.now(), twins };
  twins.catch(() => {
    shared = null;
  });
  return twins;
}

/**
 * The twin that already holds what a search would find, if there is one.
 */
export async function searchedTwin(documentId: number): Promise<Twin | null> {
  const db = createAdminClient();
  const [sources, searched] = await Promise.all([
    fetchAll<Source>((from, to) => db.from("content_documents").select("id, title, file_url").order("id").range(from, to)),
    searchedDocumentIds(),
  ]);
  const twins = new Set((await readTwins(sources))[documentId] ?? []);
  if (twins.size === 0) return null;

  const { data: aids } = await db.from("decision_aids").select("document_id").in("document_id", [...twins]).neq("status", "rejected");
  const count = (id: number) => (aids ?? []).filter((a) => a.document_id === id).length;
  const found = sources
    .filter((s) => twins.has(s.id) && (count(s.id) > 0 || searched.has(s.id)))
    .sort((a, b) => count(b.id) - count(a.id));
  return found[0] ? { id: found[0].id, title: found[0].title, aids: count(found[0].id), searched: true } : null;
}

/** The source already holding this exact file, for a file just uploaded. */
export async function sourceWithSameFile(filePath: string): Promise<{ id: number; title: string } | null> {
  const sums = await fileChecksums();
  const sum = sums.get(filePath);
  if (!sum) return null;
  const paths = [...sums].filter(([path, other]) => other === sum && path !== filePath).map(([path]) => path);
  if (paths.length === 0) return null;
  const { data } = await createAdminClient().from("content_documents").select("id, title").in("file_url", paths).limit(1);
  return data?.[0] ?? null;
}
