"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { retrieveChunks, type RetrievedChunk } from "@/lib/retrieval";

export async function createDocument(input: {
  sectionId: number;
  title: string;
  sourceReference: string;
  sourceYear: number | null;
  filePath: string;
}) {
  const title = input.title.trim();
  const sourceReference = input.sourceReference.trim();
  if (!title || !sourceReference || !input.sectionId) {
    return { error: "Section, title and source reference are all required" };
  }

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
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Insert failed" };

  revalidatePath("/admin/sources");
  return { id: data.id as number };
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
