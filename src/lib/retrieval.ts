import { createAdminClient } from "@/lib/supabase/admin";
import { embedTexts } from "@/lib/voyage";

/**
 * Retrieval: given a query string and section(s), return the top
 * chunks by vector similarity with document titles and references.
 * Server only — callers must gate on admin/user permissions first.
 */

export type RetrievedChunk = {
  chunk_id: number;
  document_id: number;
  section_id: number;
  chunk_index: number;
  text: string;
  similarity: number;
  document_title: string;
  source_reference: string;
};

export async function retrieveChunks(
  query: string,
  sectionIds: number[] | null,
  count = 8
): Promise<RetrievedChunk[]> {
  const [embedding] = await embedTexts([query], "query");

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: embedding,
    section_ids: sectionIds,
    match_count: count,
  });
  if (error) throw new Error(`match_chunks failed: ${error.message}`);

  return (data ?? []) as RetrievedChunk[];
}
