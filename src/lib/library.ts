import { createAdminClient } from "@/lib/supabase/admin";

/**
 * How big the library actually is, for the page that claims it.
 *
 * The landing page states these as fact — "952 curated source
 * documents, 16,491 indexed passages" — and they were written into the
 * component by hand. A figure typed into a page is true on the day it
 * is typed: this library is ingested continuously, so the numbers a
 * visitor is asked to judge the product by would quietly drift away
 * from the product.
 *
 * Counted rather than read from a cached total, with `head: true` so
 * the rows themselves never leave the database. The service role is
 * what reads them: content_documents and content_chunks are admin-only
 * at the row level, and this page's whole audience is signed out.
 */
export type LibrarySize = {
  documents: number;
  passages: number;
  questions: number;
};

/* Printed on the page if the count fails, so a database hiccup leaves
   a stale figure rather than a zero under a claim about size. */
const LAST_KNOWN: LibrarySize = {
  documents: 952,
  passages: 16491,
  questions: 1958,
};

export async function getLibrarySize(): Promise<LibrarySize> {
  const supabase = createAdminClient();

  const [documents, passages, questions] = await Promise.all([
    supabase.from("content_documents").select("id", { count: "exact", head: true }),
    supabase.from("content_chunks").select("id", { count: "exact", head: true }),
    supabase
      .from("generated_questions")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
  ]);

  return {
    documents: documents.count ?? LAST_KNOWN.documents,
    passages: passages.count ?? LAST_KNOWN.passages,
    questions: questions.count ?? LAST_KNOWN.questions,
  };
}
