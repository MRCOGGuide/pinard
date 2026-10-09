import { createAdminClient } from "@/lib/supabase/admin";
import { getExamAvailability } from "@/lib/examAvailability";
import { leafSections } from "@/lib/performance";
import type { Section } from "@/lib/types";

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
  /** Pinard's revision sections for the parts on sale: the active
   *  sections inside the modules (see getLibrarySize). */
  sections: number;
};

/* Printed on the page if the count fails, so a database hiccup leaves
   a stale figure rather than a zero under a claim about size. */
const LAST_KNOWN: LibrarySize = {
  documents: 952,
  passages: 16491,
  questions: 1958,
  sections: 35,
};

export async function getLibrarySize(): Promise<LibrarySize> {
  const supabase = createAdminClient();

  const [documents, passages, questions, availability, sectionRows] = await Promise.all([
    supabase.from("content_documents").select("id", { count: "exact", head: true }),
    supabase.from("content_chunks").select("id", { count: "exact", head: true }),
    supabase
      .from("generated_questions")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
    getExamAvailability(supabase),
    supabase.from("sections").select("*"),
  ]);

  // Counted, like the rest, so the page says what the library holds:
  // the revision sections inside the modules (Obstetrics, Gynaecology,
  // Governance) of the parts on sale, which the owner can add to or
  // retire in Admin. A top-level section with nothing under it, such as
  // TOG Articles, is a collection of sources rather than a revision
  // section, and is not counted.
  const live = (sectionRows.data ?? []).filter((s) => availability[(s as Section).exam]) as Section[];
  const sections = leafSections(live).filter((s) => s.parent_id !== null).length;

  return {
    documents: documents.count ?? LAST_KNOWN.documents,
    passages: passages.count ?? LAST_KNOWN.passages,
    questions: questions.count ?? LAST_KNOWN.questions,
    sections: sections || LAST_KNOWN.sections,
  };
}
