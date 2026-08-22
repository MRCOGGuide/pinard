import type { SupabaseClient } from "@supabase/supabase-js";
import { EXAMINABLE_FACT_TYPES, isExaminableFact } from "@/lib/factQuality";
import { formatReference } from "@/lib/reference";

/**
 * The Similar Values review surface.
 *
 * Only a fact that shares its value with another can ever appear under
 * an answer — the panel exists to pair figures — so the unit of review
 * is the value group, not the individual fact. Judging "everything that
 * is 1%" in one sitting is also how the owner actually reads them.
 */

export type ReviewFact = {
  id: number;
  subject: string | null;
  statement: string;
  reference: string;
  excluded: boolean;
  reviewedAt: string | null;
};

export type ValueGroup = {
  value: string;
  facts: ReviewFact[];
  /** A group counts as reviewed once every fact in it has been stamped. */
  reviewed: boolean;
};

type Row = {
  id: number;
  subject: string | null;
  fact_type: string | null;
  value_text: string | null;
  statement: string | null;
  source_reference: string | null;
  similar_excluded: boolean | null;
  similar_reviewed_at: string | null;
  content_chunks: {
    content_documents: {
      title: string | null;
      source_year: number | null;
      tog_year: number | null;
      tog_issue: number | null;
    } | null;
  } | null;
};

const COLUMNS =
  "id, subject, fact_type, value_text, statement, source_reference, similar_excluded, similar_reviewed_at, content_chunks(content_documents(title, source_year, tog_year, tog_issue))";

const PAGE = 1000;

/**
 * Every examinable fact that shares its value with another, grouped.
 *
 * Paged because PostgREST caps a response at 1000 rows and the
 * examinable fact types run to several thousand. Admin-only and read
 * rarely, so the round trips are affordable; the alternative is
 * duplicating the examinable rules in SQL, where they would drift from
 * the ones the candidate panel applies.
 */
export async function fetchValueGroups(
  supabase: SupabaseClient
): Promise<ValueGroup[]> {
  const factTypes = Array.from(EXAMINABLE_FACT_TYPES);

  const rows: Row[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("key_facts")
      .select(COLUMNS)
      .in("fact_type", factTypes)
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const byValue = new Map<string, ReviewFact[]>();
  for (const row of rows) {
    if (!isExaminableFact(row)) continue;
    const key = (row.value_text ?? "").trim().toLowerCase();
    if (!key) continue;
    const doc = row.content_chunks?.content_documents ?? null;

    const ref = formatReference({
      reference: row.source_reference,
      year: doc?.source_year ?? null,
      togYear: doc?.tog_year ?? null,
      togIssue: doc?.tog_issue ?? null,
    });
    const title = doc?.title?.trim();
    if (!byValue.has(key)) byValue.set(key, []);
    byValue.get(key)!.push({
      id: row.id,
      subject: row.subject,
      statement: row.statement ?? "",
      reference: title && ref ? `${title} — ${ref}` : title || ref,
      excluded: Boolean(row.similar_excluded),
      reviewedAt: row.similar_reviewed_at,
    });
  }

  // A lone fact has nothing to pair with, so it can never be shown and
  // is not worth the owner's time.
  return Array.from(byValue.entries())
    .filter(([, facts]) => facts.length > 1)
    .map(([value, facts]) => ({
      value,
      facts,
      reviewed: facts.every((f) => f.reviewedAt !== null),
    }))
    .sort((a, b) => b.facts.length - a.facts.length);
}
