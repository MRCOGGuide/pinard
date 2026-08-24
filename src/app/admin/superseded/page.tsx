import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import {
  findSupersededGroups,
  groupKey,
  type DuplicateDoc,
} from "@/lib/duplicates";
import { SupersededGroups, type DocExtras } from "./SupersededGroups";

/** Any 4-digit year in the reference, as a fallback. */
function yearFrom(reference: string): number | null {
  const match = reference.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export default async function SupersededPage() {
  const supabase = createClient();

  const [{ data: documents }, { data: questions }, { data: reviews }] =
    await Promise.all([
    supabase
      .from("content_documents")
      .select(
        "id, title, source_reference, source_year, tog_year, priority, file_url, sections(title)"
      ),
    // Every status: deleting a superseded document should be able to
    // take its pending and rejected questions with it too.
    supabase
      .from("generated_questions")
      .select("source_document_ids, status"),
    supabase.from("superseded_reviews").select("group_key"),
  ]);

  // Groups the owner has already checked and chosen to keep.
  const reviewedKeys = new Set(
    ((reviews ?? []) as { group_key: string }[]).map((r) => r.group_key)
  );

  // Questions attributable to each document, approved and in total.
  const approvedCounts = new Map<number, number>();
  const totalCounts = new Map<number, number>();
  for (const q of (questions ?? []) as {
    source_document_ids: number[] | null;
    status: string;
  }[]) {
    for (const id of q.source_document_ids ?? []) {
      totalCounts.set(id, (totalCounts.get(id) ?? 0) + 1);
      if (q.status === "approved") {
        approvedCounts.set(id, (approvedCounts.get(id) ?? 0) + 1);
      }
    }
  }

  const rows = (documents ?? []) as unknown as {
    id: number;
    title: string;
    source_reference: string;
    source_year: number | null;
    tog_year: number | null;
    priority: number | null;
    file_url: string | null;
    sections: { title: string } | null;
  }[];

  const docs: DuplicateDoc[] = rows.map((d) => ({
    id: d.id,
    title: d.title,
    sourceReference: d.source_reference ?? "",
    year: d.source_year ?? d.tog_year ?? yearFrom(d.source_reference ?? ""),
    sectionTitle: d.sections?.title ?? "Unassigned",
    approvedQuestions: approvedCounts.get(d.id) ?? 0,
    priority: d.priority ?? 2,
  }));

  const extras: DocExtras = {};
  for (const d of rows) {
    extras[d.id] = {
      fileUrl: d.file_url,
      totalQuestions: totalCounts.get(d.id) ?? 0,
    };
  }

  const allGroups = findSupersededGroups(docs);
  const groups = allGroups.filter((g) => !reviewedKeys.has(groupKey(g.documents)));
  const keptGroups = allGroups.filter((g) => reviewedKeys.has(groupKey(g.documents)));
  const staleTotal = groups.reduce((s, g) => s + g.staleQuestions, 0);

  return (
    <>
      <TraceHeader
        title="Superseded guidance"
        lede="Documents that look like editions of the same guidance. Check which is current before approving questions from either — guidance changes, and a question written from an old edition teaches what is no longer true."
      />

      {groups.length === 0 ? (
        <p className="rounded-card border border-hairline bg-porcelain p-5 text-sm text-greentop">
          No likely duplicate editions found. Every document looks like
          distinct guidance.
        </p>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-card border border-hairline bg-porcelain p-4 shadow-card">
              <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/55">
                Possible duplicate sets
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-theatre">
                {groups.length}
              </p>
            </div>
            <div className="rounded-card border border-hairline bg-porcelain p-4 shadow-card">
              <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/55">
                Approved questions from older editions
              </p>
              <p
                className={`mt-1 font-display text-2xl font-semibold ${staleTotal > 0 ? "text-heartbeat" : "text-theatre"}`}
              >
                {staleTotal}
              </p>
            </div>
          </div>

          <SupersededGroups groups={groups} extras={extras} />
        </>
      )}

      {keptGroups.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-base font-semibold text-theatre">
            Checked — keeping both
          </h2>
          <p className="mt-1 text-xs text-graphite/65">
            {keptGroups.length} set{keptGroups.length === 1 ? "" : "s"} you have
            reviewed. Adding a document to one brings it back above for a fresh
            look.
          </p>
          <div className="mt-3 opacity-75">
            <SupersededGroups groups={keptGroups} extras={extras} reviewed />
          </div>
        </div>
      )}

      <div className="mt-6 rounded-card border border-hairline bg-porcelain p-4">
        <h2 className="font-display text-base font-semibold text-theatre">
          How these are matched
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-graphite/75">
          Only documents of the same kind are compared: a guideline, its
          summary, its patient leaflet and a TOG article on the subject all
          coexist by design, so none of them supersedes another. Recurring
          columns, letters and corrections are skipped for the same reason.
          Within a kind, documents are compared by their guideline number
          where one exists (so a Green-top keeps its identity through a
          retitling), otherwise by how much of their titles overlap once
          generic words like &ldquo;guideline&rdquo; and
          &ldquo;management&rdquo; are ignored. A set is shown when the
          editions are at least two years apart, or when the titles are
          near-identical — a likely re-upload. This is a prompt to check,
          not a verdict: confirm before deleting anything, and use
          &ldquo;Keep both&rdquo; when both versions should stay.
        </p>
      </div>
    </>
  );
}
