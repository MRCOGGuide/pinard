import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Which sources have been searched for decision aids (owner, 5 November
 * 2026): a source with no aids may have been searched and held none, or
 * never searched, and one should not be paid for twice.
 *
 * A small file for each searched source, all in one folder, so that one
 * listing answers for the whole library and two searches finishing
 * together cannot overwrite each other.
 */
const FOLDER = "aids/searched";

export async function markSearched(documentId: number): Promise<void> {
  await createAdminClient()
    .storage.from("sources")
    .upload(`${FOLDER}/${documentId}.json`, new Blob([JSON.stringify({ at: new Date().toISOString() })], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
    });
}

async function idsIn(folder: string): Promise<Set<number>> {
  const storage = createAdminClient().storage.from("sources");
  const ids = new Set<number>();
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const { data } = await storage.list(folder, { limit: page, offset });
    for (const file of data ?? []) {
      const id = Number(file.name.replace(/\.json$/, ""));
      if (id) ids.add(id);
    }
    if (!data || data.length < page) return ids;
  }
}

export const searchedDocumentIds = () => idsIn(FOLDER);

/**
 * Searches under way, in the same way, so that the background workflow
 * can find one to carry on. The file goes when the search ends.
 */
const UNDER_WAY = "aids/searching";

export async function markSearching(documentId: number): Promise<void> {
  await createAdminClient()
    .storage.from("sources")
    .upload(`${UNDER_WAY}/${documentId}.json`, new Blob(["{}"], { type: "application/json" }), { upsert: true, contentType: "application/json" });
}

export async function clearSearching(documentId: number): Promise<void> {
  await createAdminClient().storage.from("sources").remove([`${UNDER_WAY}/${documentId}.json`]);
}

export const searchingDocumentIds = () => idsIn(UNDER_WAY);
