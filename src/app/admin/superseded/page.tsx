import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { findSupersededGroups, type DuplicateDoc } from "@/lib/duplicates";
import { SupersededGroups, type DocExtras } from "./SupersededGroups";

/** Any 4-digit year in the reference, as a fallback. */
function yearFrom(reference: string): number | null {
  const match = reference.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export default async function SupersededPage() {
  const supabase = createClient();

  const [{ data: documents }, { data: questions }] = await Promise.all([
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
  ]);

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

  const groups = findSupersededGroups(docs);
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

      <div className="mt-6 rounded-card border border-hairline bg-porcelain p-4">
        <h2 className="font-display text-base font-semibold text-theatre">
          How these are matched
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-graphite/75">
          Documents are compared by their guideline number where one exists
          (so a Green-top keeps its identity through a retitling), otherwise
          by how much of their titles overlap once generic words like
          &ldquo;guideline&rdquo; and &ldquo;management&rdquo; are ignored. A
          set is shown when the editions are at least two years apart, or
          when the titles are near-identical — a likely re-upload. This is a
          prompt to check, not a verdict: confirm before deleting anything.
        </p>
      </div>
    </>
  );
}
