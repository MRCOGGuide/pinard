import Link from "next/link";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { findSupersededGroups, type DuplicateDoc } from "@/lib/duplicates";
import { PRIORITY_SHORT, type Priority } from "@/lib/priority";

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
        "id, title, source_reference, source_year, tog_year, priority, sections(title)"
      ),
    supabase
      .from("generated_questions")
      .select("source_document_ids")
      .eq("status", "approved"),
  ]);

  // Approved questions attributable to each document.
  const questionCounts = new Map<number, number>();
  for (const q of (questions ?? []) as { source_document_ids: number[] | null }[]) {
    for (const id of q.source_document_ids ?? []) {
      questionCounts.set(id, (questionCounts.get(id) ?? 0) + 1);
    }
  }

  const docs: DuplicateDoc[] = ((documents ?? []) as unknown as {
    id: number;
    title: string;
    source_reference: string;
    source_year: number | null;
    tog_year: number | null;
    priority: number | null;
    sections: { title: string } | null;
  }[]).map((d) => ({
    id: d.id,
    title: d.title,
    sourceReference: d.source_reference ?? "",
    year: d.source_year ?? d.tog_year ?? yearFrom(d.source_reference ?? ""),
    sectionTitle: d.sections?.title ?? "Unassigned",
    approvedQuestions: questionCounts.get(d.id) ?? 0,
    priority: d.priority ?? 2,
  }));

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

          <ul className="space-y-3">
            {groups.map((group) => {
              const newest = group.documents[0];
              return (
                <li
                  key={newest.id}
                  className="rounded-card border border-hairline bg-porcelain p-4 shadow-card"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-display text-base font-semibold text-theatre">
                      {newest.title}
                    </h2>
                    <span className="font-mono text-[11px] text-graphite/55">
                      {group.documents.length} editions
                      {group.yearGap !== null && ` · ${group.yearGap} years apart`}
                    </span>
                  </div>

                  {group.staleQuestions > 0 && (
                    <p className="mt-1.5 text-xs text-heartbeat">
                      {group.staleQuestions} approved question
                      {group.staleQuestions === 1 ? "" : "s"} came from an older
                      edition — review them against the current version.
                    </p>
                  )}

                  <ul className="mt-3 space-y-1.5">
                    {group.documents.map((d, i) => (
                      <li
                        key={d.id}
                        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border px-3 py-2 text-sm ${
                          i === 0
                            ? "border-greentop/40 bg-white/70"
                            : "border-hairline bg-white/40"
                        }`}
                      >
                        <span
                          className={`font-mono text-[11px] ${i === 0 ? "text-greentop" : "text-graphite/50"}`}
                        >
                          {i === 0 ? "newest" : "older"}
                        </span>
                        <span className="min-w-0 flex-1 text-graphite/85">
                          {d.title}
                          <span className="ml-2 font-mono text-[11px] text-graphite/50">
                            {d.sourceReference || "no reference"}
                            {d.year ? ` · ${d.year}` : " · year unknown"} ·{" "}
                            {d.sectionTitle} ·{" "}
                            {PRIORITY_SHORT[(d.priority ?? 2) as Priority]}
                          </span>
                        </span>
                        <span
                          className={`font-mono text-[11px] ${
                            i > 0 && d.approvedQuestions > 0
                              ? "text-heartbeat"
                              : "text-graphite/50"
                          }`}
                        >
                          {d.approvedQuestions} question
                          {d.approvedQuestions === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-2.5 text-xs text-graphite/60">
                    <Link href="/admin/sources" className="text-greentop">
                      Open the source library
                    </Link>{" "}
                    to delete or re-prioritise the superseded edition, or{" "}
                    <Link href="/admin/bank" className="text-greentop">
                      the question bank
                    </Link>{" "}
                    to filter its questions by guideline and clear them out.
                  </p>
                </li>
              );
            })}
          </ul>
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
