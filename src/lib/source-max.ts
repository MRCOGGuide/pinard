import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sources that have given all they can of a format (owner, 6 November
 * 2026): "if I hit generate and the model couldn't generate more than what
 * is already there, it needs to say it reached max."
 *
 * A small file for each, all in one folder, as for searched sources, so
 * that one listing answers for the whole library. Written when a job gives
 * up for want of anything new, and removed when one writes something.
 */
const FOLDER = "questions/max";
type Format = "sba" | "emq";

const path = (documentId: number, format: Format) => `${FOLDER}/${documentId}-${format}.json`;
const storage = () => createAdminClient().storage.from("sources");

export async function markMaxReached(documentId: number, format: Format): Promise<void> {
  await storage().upload(path(documentId, format), new Blob([JSON.stringify({ at: new Date().toISOString() })], { type: "application/json" }), {
    upsert: true,
    contentType: "application/json",
  });
}

export async function clearMaxReached(documentId: number, format: Format): Promise<void> {
  await storage().remove([path(documentId, format)]);
}

export async function maxReachedSources(): Promise<Record<number, { sba: boolean; emq: boolean }>> {
  const reached: Record<number, { sba: boolean; emq: boolean }> = {};
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const { data } = await storage().list(FOLDER, { limit: page, offset });
    for (const file of data ?? []) {
      const match = /^(\d+)-(sba|emq)\.json$/.exec(file.name);
      if (!match) continue;
      const id = Number(match[1]);
      reached[id] ??= { sba: false, emq: false };
      reached[id][match[2] as Format] = true;
    }
    if (!data || data.length < page) return reached;
  }
}
