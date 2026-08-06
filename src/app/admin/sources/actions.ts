"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { retrieveChunks, type RetrievedChunk } from "@/lib/retrieval";
import { TOG_CATEGORIES } from "@/lib/tog";

export type TogFields = {
  togYear: number | null;
  togIssue: number | null;
  togCategory: string | null;
};

/** All three TOG fields together, or none — never a partial identity. */
function validateTog(input: TogFields): string | null {
  const any =
    input.togYear !== null ||
    input.togIssue !== null ||
    input.togCategory !== null;
  if (!any) return null;
  if (!input.togYear || input.togYear < 1999 || input.togYear > 2100) {
    return "TOG items need a valid year";
  }
  if (!input.togIssue || input.togIssue < 1 || input.togIssue > 4) {
    return "TOG items need an issue (1–4)";
  }
  if (!TOG_CATEGORIES.some((c) => c.value === input.togCategory)) {
    return "TOG items need a category";
  }
  return null;
}

export async function createDocument(input: {
  sectionId: number;
  title: string;
  sourceReference: string;
  sourceYear: number | null;
  filePath: string;
} & TogFields) {
  const title = input.title.trim();
  const sourceReference = input.sourceReference.trim();
  if (!title || !sourceReference || !input.sectionId) {
    return { error: "Section, title and source reference are all required" };
  }
  const togProblem = validateTog(input);
  if (togProblem) return { error: togProblem };

  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("content_documents")
    .insert({
      section_id: input.sectionId,
      title,
      source_reference: sourceReference,
      source_year: input.sourceYear,
      file_url: input.filePath,
      status: "uploaded",
      tog_year: input.togYear,
      tog_issue: input.togIssue,
      tog_category: input.togCategory,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Insert failed" };

  revalidatePath("/admin/sources");
  return { id: data.id as number };
}

export async function updateDocument(
  id: number,
  input: {
    sectionId: number;
    title: string;
    sourceReference: string;
    sourceYear: number | null;
  } & TogFields
) {
  const title = input.title.trim();
  const sourceReference = input.sourceReference.trim();
  if (!title || !sourceReference || !input.sectionId) {
    return { error: "Section, title and source reference are all required" };
  }
  const togProblem = validateTog(input);
  if (togProblem) return { error: togProblem };

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("content_documents")
    .update({
      section_id: input.sectionId,
      title,
      source_reference: sourceReference,
      source_year: input.sourceYear,
      tog_year: input.togYear,
      tog_issue: input.togIssue,
      tog_category: input.togCategory,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  // Keep already-ingested content in step: chunks and key facts carry a
  // denormalised section_id used by retrieval filters, so moving the
  // document must move them too. Idempotent when the section is unchanged.
  const { data: chunks } = await supabase
    .from("content_chunks")
    .select("id")
    .eq("document_id", id);
  const chunkIds = (chunks ?? []).map((c) => c.id as number);
  if (chunkIds.length > 0) {
    const { error: chunkError } = await supabase
      .from("content_chunks")
      .update({ section_id: input.sectionId })
      .eq("document_id", id);
    if (chunkError) return { error: chunkError.message };

    const { error: factError } = await supabase
      .from("key_facts")
      .update({ section_id: input.sectionId })
      .in("chunk_id", chunkIds);
    if (factError) return { error: factError.message };
  }

  revalidatePath("/admin/sources");
  return {};
}

export async function deleteDocument(id: number) {
  const { supabase } = await requireAdmin();

  const { data: doc } = await supabase
    .from("content_documents")
    .select("file_url")
    .eq("id", id)
    .single();

  if (doc?.file_url) {
    // Remove the stored file first; ignore failures so a missing file
    // never blocks deleting the row.
    await supabase.storage.from("sources").remove([doc.file_url]);
  }

  const { error } = await supabase
    .from("content_documents")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/sources");
  return {};
}

export async function deleteDocuments(ids: number[]) {
  if (ids.length === 0) return { error: "Nothing selected" };
  const { supabase } = await requireAdmin();

  const { data: docs } = await supabase
    .from("content_documents")
    .select("file_url")
    .in("id", ids);

  const paths = (docs ?? [])
    .map((d) => d.file_url as string | null)
    .filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    // Remove stored files first; ignore failures so a missing file never
    // blocks deleting the rows.
    await supabase.storage.from("sources").remove(paths);
  }

  const { error } = await supabase
    .from("content_documents")
    .delete()
    .in("id", ids);
  if (error) return { error: error.message };

  revalidatePath("/admin/sources");
  return { deleted: ids.length };
}

export async function testRetrieval(
  query: string,
  sectionId: number | null
): Promise<{ results?: RetrievedChunk[]; error?: string }> {
  await requireAdmin();
  const trimmed = query.trim();
  if (!trimmed) return { error: "Type a question first" };

  try {
    const results = await retrieveChunks(
      trimmed,
      sectionId ? [sectionId] : null,
      8
    );
    return { results };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Retrieval failed",
    };
  }
}
