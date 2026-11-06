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
 * The same file is found from Storage's own checksums, one listing for the
 * whole library. The same text in a different file costs a read of every
 * source's first passage, so that is left for when money is about to be
 * spent.
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

export async function sameFileTwins(sources: Pick<Source, "id" | "file_url">[]): Promise<Record<number, number[]>> {
  const sums = await fileChecksums();
  return twinsByKey(sources.map((s) => ({ id: s.id, key: s.file_url ? sums.get(s.file_url) : null })));
}

/**
 * The twin that already holds what a search would find, if there is one:
 * the same file, or the same opening text.
 */
export async function searchedTwin(documentId: number): Promise<Twin | null> {
  const db = createAdminClient();
  const [sources, firsts, searched] = await Promise.all([
    fetchAll<Source>((from, to) => db.from("content_documents").select("id, title, file_url").order("id").range(from, to)),
    fetchAll<{ document_id: number; text: string }>((from, to) =>
      db.from("content_chunks").select("document_id, text").eq("chunk_index", 0).order("document_id").range(from, to)
    ),
    searchedDocumentIds(),
  ]);
  const twins = new Set([
    ...((await sameFileTwins(sources))[documentId] ?? []),
    ...(twinsByKey(firsts.map((c) => ({ id: c.document_id, key: openingKey(c.text) })))[documentId] ?? []),
  ]);
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
