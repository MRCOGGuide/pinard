import { createAdminClient } from "@/lib/supabase/admin";
import type { QuestionOption } from "@/lib/types";

/**
 * The worked examples on the public landing page.
 *
 * Chosen in Admin → Bank rather than written into the code, so changing
 * what a visitor judges the product by does not need a deploy. Read
 * with the service role because the page's whole audience is signed
 * out, and approved questions are not readable to them.
 */

export type ShowcaseSba = {
  stem: string;
  options: QuestionOption[];
  correct: string;
  explanation: string;
  source: string;
};

export type ShowcaseEmq = {
  leadIn: string;
  options: QuestionOption[];
  optionCount: number;
  stem: string;
  correct: string;
  explanation: string;
  source: string;
};

export type Showcase = { sba: ShowcaseSba | null; emq: ShowcaseEmq | null };

/** How the card names a guideline: title, then reference and year. */
function sourceLine(
  docs: { title: string; source_reference: string | null; source_year: number | null }[]
): string {
  const d = docs[0];
  if (!d) return "";
  const ref = [d.source_reference, d.source_year].filter(Boolean).join(", ");
  return ref ? `${d.title} — ${ref}` : d.title;
}

export async function getShowcase(): Promise<Showcase> {
  const supabase = createAdminClient();

  const { data: rows } = await supabase
    .from("generated_questions")
    .select(
      "id, format, stem, lead_in, options, correct_key, explanation, explanations, emq_group_id, source_document_ids"
    )
    .eq("showcase", true)
    .eq("status", "approved");

  if (!rows || rows.length === 0) return { sba: null, emq: null };

  const docIds = Array.from(
    new Set(rows.flatMap((r) => (r.source_document_ids ?? []) as number[]))
  );
  const { data: docs } = docIds.length
    ? await supabase
        .from("content_documents")
        .select("id, title, source_reference, source_year")
        .in("id", docIds)
    : { data: [] };
  const docById = new Map((docs ?? []).map((d) => [d.id as number, d]));
  const sourceFor = (ids: number[] | null) =>
    sourceLine(
      (ids ?? [])
        .map((id) => docById.get(id))
        .filter(Boolean) as Parameters<typeof sourceLine>[0]
    );

  const sbaRow = rows.find((r) => r.format === "sba");
  const sba: ShowcaseSba | null = sbaRow
    ? {
        stem: sbaRow.stem as string,
        options: (sbaRow.options ?? []) as QuestionOption[],
        correct: sbaRow.correct_key as string,
        explanation:
          (sbaRow.explanation as string | null) ??
          ((sbaRow.explanations ?? []) as { verdict: string; text: string }[]).find(
            (e) => e.verdict === "correct"
          )?.text ??
          "",
        source: sourceFor(sbaRow.source_document_ids as number[] | null),
      }
    : null;

  // An EMQ set is stored one row per scenario. The card shows the set's
  // lead-in, its shared option list and the first scenario.
  const emqRows = rows
    .filter((r) => r.format === "emq")
    .sort((a, b) => (a.id as number) - (b.id as number));
  const first = emqRows[0];
  const emq: ShowcaseEmq | null = first
    ? {
        leadIn: (first.lead_in as string | null) ?? "",
        // The whole shared list: the card scrolls, so nothing is cut.
        options: (first.options ?? []) as QuestionOption[],
        optionCount: ((first.options ?? []) as QuestionOption[]).length,
        stem: first.stem as string,
        correct: first.correct_key as string,
        explanation:
          (first.explanation as string | null) ??
          ((first.explanations ?? []) as { verdict: string; text: string }[]).find(
            (e) => e.verdict === "correct"
          )?.text ??
          "",
        source: sourceFor(first.source_document_ids as number[] | null),
      }
    : null;

  return { sba, emq };
}
