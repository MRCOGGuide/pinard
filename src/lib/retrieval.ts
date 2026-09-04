import { withoutReferenceLists } from "@/lib/bibliography";
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

/** A chunk fetched by id, carrying enough of its document to cite it. */
export type ChunkWithDocument = RetrievedChunk & {
  source_year: number | null;
  tog_year: number | null;
  tog_issue: number | null;
};

/**
 * The passages behind given chunk ids — the ones a question already
 * cites, or the ones a reply cited back. Similarity is meaningless
 * here (nothing was matched), so it is reported as 1.
 */
export async function getChunksByIds(
  ids: number[]
): Promise<ChunkWithDocument[]> {
  if (ids.length === 0) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("content_chunks")
    .select(
      "id, document_id, section_id, chunk_index, text, content_documents(title, source_reference, source_year, tog_year, tog_issue)"
    )
    .in("id", ids);
  if (error) throw new Error(`chunk lookup failed: ${error.message}`);

  const rows = (data ?? []) as unknown as {
    id: number;
    document_id: number;
    section_id: number;
    chunk_index: number;
    text: string;
    content_documents: {
      title: string | null;
      source_reference: string | null;
      source_year: number | null;
      tog_year: number | null;
      tog_issue: number | null;
    } | null;
  }[];

  return rows.map((row) => ({
    chunk_id: row.id,
    document_id: row.document_id,
    section_id: row.section_id,
    chunk_index: row.chunk_index,
    text: row.text,
    similarity: 1,
    document_title: row.content_documents?.title ?? "",
    source_reference: row.content_documents?.source_reference ?? "",
    source_year: row.content_documents?.source_year ?? null,
    tog_year: row.content_documents?.tog_year ?? null,
    tog_issue: row.content_documents?.tog_issue ?? null,
  }));
}

/**
 * How many extra candidates to ask the index for, so that dropping the
 * reference lists still leaves a full set. Back matter clusters — a
 * guideline's references sit together and so match together — so the
 * margin is generous rather than tight.
 */
const OVERFETCH = 3;

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
    match_count: count * OVERFETCH,
  });
  if (error) throw new Error(`match_chunks failed: ${error.message}`);

  const matched = (data ?? []) as RetrievedChunk[];

  // Generation keeps back matter out of its own pool; retrieval did not,
  // so Ask Pinard could spend its passages on a page of citations and
  // then truthfully report that the sources do not cover the question.
  // Half a set of real guidance answers better than a full set padded
  // with references, and the floor still leaves a thin section
  // answerable rather than blank.
  return withoutReferenceLists(matched, Math.ceil(count / 2)).slice(0, count);
}
