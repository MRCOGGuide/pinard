"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { Priority } from "@/lib/priority";

/** Re-tier one document, and re-derive its questions' priority. */
export async function setDocumentPriority(id: number, priority: Priority) {
  if (![1, 2, 3].includes(priority)) return { error: "Invalid priority" };
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("content_documents")
    .update({ priority })
    .eq("id", id);
  if (error) return { error: error.message };

  // A question is as important as the most important source it cites,
  // so re-derive rather than copying this document's new tier over.
  const { data: affected } = await supabase
    .from("generated_questions")
    .select("id, source_document_ids")
    .overlaps("source_document_ids", [id]);

  const docIds = Array.from(
    new Set(
      (affected ?? []).flatMap(
        (q) => (q.source_document_ids as number[] | null) ?? []
      )
    )
  );
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from("content_documents")
      .select("id, priority")
      .in("id", docIds);
    const priorityById = new Map(
      (docs ?? []).map((d) => [d.id as number, d.priority as number])
    );
    for (const q of affected ?? []) {
      const sources = (q.source_document_ids as number[] | null) ?? [];
      if (sources.length === 0) continue;
      await supabase
        .from("generated_questions")
        .update({
          priority: Math.min(
            ...sources.map((s) => priorityById.get(s) ?? 2)
          ),
        })
        .eq("id", q.id);
    }
  }

  revalidatePath("/admin/superseded");
  revalidatePath("/admin/sources");
  return {};
}

/**
 * Remove every question generated from a superseded document. Deleting
 * the document alone does NOT do this — questions record their sources
 * as an id list, not a foreign key — so outdated questions would
 * otherwise stay live in the bank.
 */
export async function deleteQuestionsFromDocument(id: number) {
  const { supabase } = await requireAdmin();

  const { data: doomed, error: findError } = await supabase
    .from("generated_questions")
    .select("id")
    .overlaps("source_document_ids", [id]);
  if (findError) return { error: findError.message };

  const ids = (doomed ?? []).map((q) => q.id as number);
  if (ids.length === 0) return { deleted: 0 };

  const { error } = await supabase
    .from("generated_questions")
    .delete()
    .in("id", ids);
  if (error) return { error: error.message };

  revalidatePath("/admin/superseded");
  revalidatePath("/admin/bank");
  return { deleted: ids.length };
}

/**
 * Delete a superseded document: its stored file, chunks and key facts.
 * Questions are handled separately and deliberately — losing them
 * silently would be worse than leaving them.
 */
export async function deleteSupersededDocument(id: number) {
  const { supabase } = await requireAdmin();

  const { data: doc } = await supabase
    .from("content_documents")
    .select("file_url")
    .eq("id", id)
    .single();

  if (doc?.file_url) {
    await supabase.storage.from("sources").remove([doc.file_url]);
  }

  const { error } = await supabase
    .from("content_documents")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/superseded");
  revalidatePath("/admin/sources");
  return {};
}
