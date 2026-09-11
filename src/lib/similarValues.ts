import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { EXAMINABLE_FACT_TYPES, isExaminableFact } from "@/lib/factQuality";
import { formatReference } from "@/lib/reference";
import {
  buildSectionLookup,
  isAllowedSimilarValuesSource,
  type SectionLookup,
} from "@/lib/sourcePolicy";

/**
 * The Similar Values review surface.
 *
 * Only a fact that shares its value with another can ever appear under
 * an answer — the panel exists to pair figures — so the unit of review
 * is the value group, not the individual fact. Judging "everything that
 * is 1%" in one sitting is also how the owner actually reads them.
 *
 * Read in two passes, because the screen shows ten groups and the
 * decision about which ten needs every fact.
 *
 * Whether a fact belongs here at all depends on its statement and its
 * subject — isExaminableFact reads both — so the grouping pass cannot
 * avoid touching all 39,747 rows. What it can avoid is carrying them
 * any further: it keeps a line per value group, a few dozen bytes
 * each, and that index is what gets cached. The second pass then
 * fetches whole facts for the ten values actually on screen, which is
 * one query returning about forty rows.
 *
 * Before this, every page load paged through all 39,747 rows one
 * thousand at a time with a nested document join, took 12 seconds, and
 * sliced ten groups out of the result. Paging was therefore as slow as
 * first load, and the page-size control looked broken because it too
 * waited 12 seconds to do anything.
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

/** One line per group: enough to sort, filter and page, nothing more. */
export type ValueIndexEntry = {
  /** Lowercased and trimmed — how a group is identified and displayed. */
  value: string;
  /** The spellings this value is stored under, for the second pass. */
  raw: string[];
  count: number;
  excluded: number;
  reviewed: boolean;
};

export type ValueIndex = {
  groups: ValueIndexEntry[];
  factCount: number;
  excludedCount: number;
};

/** Busted by declining or reviewing, which are the only things that
 *  change what this screen shows. */
export const SIMILAR_VALUES_TAG = "similar-values";

const PAGE = 1000;

/** PostgREST caps a response at 1000 rows, so a full read is always
 *  several requests. Sending them together rather than one after the
 *  other is the difference between 12 seconds and 2. */
async function readAll<T>(
  total: number,
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) => read(i * PAGE, i * PAGE + PAGE - 1))
  );
  const rows: T[] = [];
  for (const r of results) {
    if (r.error) throw new Error(r.error.message);
    rows.push(...(r.data ?? []));
  }
  return rows;
}

type DocumentMeta = {
  title: string | null;
  source_year: number | null;
  tog_year: number | null;
  tog_issue: number | null;
  tog_category: string | null;
  section_id: number | null;
};

/**
 * The document behind a fact, and whether its source may supply a
 * figure to the panel at all. key_facts carries chunk_id, and the
 * chunk carries document_id, so the two small lookups are resolved
 * once rather than joined onto forty thousand rows.
 */
type Lookups = {
  chunkToDocument: Map<number, number>;
  documents: Map<number, DocumentMeta>;
  sections: SectionLookup;
};

async function loadLookups(supabase: SupabaseClient): Promise<Lookups> {
  const { count: chunkCount } = await supabase
    .from("content_chunks")
    .select("id", { count: "exact", head: true });

  const [chunks, documents, sectionRows] = await Promise.all([
    readAll<{ id: number; document_id: number }>(chunkCount ?? 0, (from, to) =>
      supabase.from("content_chunks").select("id, document_id").order("id").range(from, to)
    ),
    supabase
      .from("content_documents")
      .select("id, title, source_year, tog_year, tog_issue, tog_category, section_id"),
    supabase.from("sections").select("id, title, parent_id"),
  ]);

  return {
    chunkToDocument: new Map(chunks.map((c) => [c.id, c.document_id])),
    documents: new Map(
      ((documents.data ?? []) as ({ id: number } & DocumentMeta)[]).map((d) => [d.id, d])
    ),
    sections: buildSectionLookup(
      (sectionRows.data ?? []) as { id: number; title: string; parent_id: number | null }[]
    ),
  };
}

/** May this fact's source supply a figure to the panel? */
function allowedSource(chunkId: number, lookups: Lookups): boolean {
  const documentId = lookups.chunkToDocument.get(chunkId);
  const doc = documentId === undefined ? null : lookups.documents.get(documentId) ?? null;
  const section = doc?.section_id ? lookups.sections.get(doc.section_id) : null;
  return isAllowedSimilarValuesSource({
    togCategory: doc?.tog_category ?? null,
    sectionTitle: section?.title ?? null,
    parentTitle: section?.parentTitle ?? null,
  });
}

function referenceFor(
  chunkId: number,
  sourceReference: string | null,
  lookups: Lookups
): string {
  const documentId = lookups.chunkToDocument.get(chunkId);
  const doc = documentId === undefined ? null : lookups.documents.get(documentId) ?? null;
  const ref = formatReference({
    reference: sourceReference,
    year: doc?.source_year ?? null,
    togYear: doc?.tog_year ?? null,
    togIssue: doc?.tog_issue ?? null,
  });
  const title = doc?.title?.trim();
  return title && ref ? `${title} — ${ref}` : title || ref;
}

type ScanRow = {
  id: number;
  chunk_id: number;
  subject: string | null;
  fact_type: string | null;
  value_text: string | null;
  statement: string | null;
  similar_excluded: boolean | null;
  similar_reviewed_at: string | null;
};

/** The uncached scan. Exported so it can be exercised directly:
 *  unstable_cache only runs inside a request. */
export async function buildValueIndex(): Promise<ValueIndex> {
  const supabase = createAdminClient();
  const factTypes = Array.from(EXAMINABLE_FACT_TYPES);

  const { count } = await supabase
    .from("key_facts")
    .select("id", { count: "exact", head: true })
    .in("fact_type", factTypes);

  const [rows, lookups] = await Promise.all([
    readAll<ScanRow>(count ?? 0, (from, to) =>
      supabase
        .from("key_facts")
        .select(
          "id, chunk_id, subject, fact_type, value_text, statement, similar_excluded, similar_reviewed_at"
        )
        .in("fact_type", factTypes)
        .order("id")
        .range(from, to)
    ),
    loadLookups(supabase),
  ]);

  const byValue = new Map<
    string,
    { raw: Set<string>; count: number; excluded: number; reviewed: boolean }
  >();

  for (const row of rows) {
    if (!isExaminableFact(row)) continue;
    const key = (row.value_text ?? "").trim().toLowerCase();
    if (!key) continue;
    if (!allowedSource(row.chunk_id, lookups)) continue;

    let entry = byValue.get(key);
    if (!entry) {
      entry = { raw: new Set(), count: 0, excluded: 0, reviewed: true };
      byValue.set(key, entry);
    }
    if (row.value_text) entry.raw.add(row.value_text);
    entry.count += 1;
    if (row.similar_excluded) entry.excluded += 1;
    if (row.similar_reviewed_at === null) entry.reviewed = false;
  }

  // A lone fact has nothing to pair with, so it can never be shown and
  // is not worth the owner's time.
  const groups: ValueIndexEntry[] = Array.from(byValue.entries())
    .filter(([, g]) => g.count > 1)
    .map(([value, g]) => ({
      value,
      raw: Array.from(g.raw),
      count: g.count,
      excluded: g.excluded,
      reviewed: g.reviewed,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    groups,
    factCount: groups.reduce((n, g) => n + g.count, 0),
    excludedCount: groups.reduce((n, g) => n + g.excluded, 0),
  };
}

/**
 * Cached, because the scan behind it costs two seconds and changes only
 * when the owner declines or reviews something — both of which bust the
 * tag. Without this, turning to page two costs as much as arriving.
 */
export const fetchValueIndex = unstable_cache(buildValueIndex, ["similar-value-index"], {
  tags: [SIMILAR_VALUES_TAG],
});

/**
 * Whole facts, for the handful of value groups actually on screen.
 * About forty rows and under a tenth of a second, so it is read fresh
 * every time and always reflects what was just declined.
 */
export async function fetchGroupsForValues(
  entries: ValueIndexEntry[]
): Promise<ValueGroup[]> {
  if (entries.length === 0) return [];
  const supabase = createAdminClient();
  const raw = entries.flatMap((e) => e.raw);

  // The 1000-row cap applies here too. "50%" alone has hundreds of
  // facts, so a page of 25 groups overruns it — and the symptom is
  // quiet: groups render with some of their facts missing rather than
  // with an error. Counted first, then read in full.
  const factTypes = Array.from(EXAMINABLE_FACT_TYPES);
  const detail = () =>
    supabase
      .from("key_facts")
      .select(
        "id, chunk_id, subject, fact_type, value_text, statement, source_reference, similar_excluded, similar_reviewed_at"
      )
      .in("fact_type", factTypes)
      .in("value_text", raw);

  const { count } = await supabase
    .from("key_facts")
    .select("id", { count: "exact", head: true })
    .in("fact_type", factTypes)
    .in("value_text", raw);

  const [rows, lookups] = await Promise.all([
    readAll<ScanRow & { source_reference: string | null }>(count ?? 0, (from, to) =>
      detail().order("id").range(from, to)
    ),
    loadLookups(supabase),
  ]);

  const wanted = new Map(entries.map((e) => [e.value, [] as ReviewFact[]]));
  for (const row of rows) {
    if (!isExaminableFact(row)) continue;
    const key = (row.value_text ?? "").trim().toLowerCase();
    const bucket = wanted.get(key);
    if (!bucket) continue;
    if (!allowedSource(row.chunk_id, lookups)) continue;
    bucket.push({
      id: row.id,
      subject: row.subject,
      statement: row.statement ?? "",
      reference: referenceFor(row.chunk_id, row.source_reference, lookups),
      excluded: Boolean(row.similar_excluded),
      reviewedAt: row.similar_reviewed_at,
    });
  }

  // Kept in the order the index gave them, which is the order the page
  // decided to show.
  return entries.map((e) => {
    const facts = wanted.get(e.value) ?? [];
    return {
      value: e.value,
      facts,
      reviewed: facts.length > 0 && facts.every((f) => f.reviewedAt !== null),
    };
  });
}
