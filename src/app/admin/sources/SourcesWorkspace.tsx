"use client";

import { useState } from "react";
import type { SectionOption } from "@/lib/sections";
import { TOG_ISSUE_MONTHS } from "@/lib/tog";
import type { DocumentWithSection, IngestStats } from "./page";
import { SourceUploadForm } from "./SourceUploadForm";
import { DocumentList } from "./DocumentList";

type IngestFilter =
  | "all"
  | "ingested"
  | "partial"
  | "none"
  | "failed"
  | "processing";

const INGEST_FILTERS: { value: IngestFilter; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "ingested", label: "Ingested (chunks + facts)" },
  { value: "partial", label: "Partially ingested (chunks, no facts)" },
  { value: "none", label: "Not ingested" },
  { value: "failed", label: "Failed" },
  { value: "processing", label: "Stuck processing (timed out mid-run)" },
];

/**
 * Shares the selected section between the upload form and the document
 * list: the list shows only the documents in that section (a parent
 * section includes its subsections), so it's easy to see how complete
 * each subsection is. Counts appear next to each option, and a toggle
 * shows everything.
 */
export function SourcesWorkspace({
  options,
  docs,
  stats,
  sectionParents,
}: {
  options: SectionOption[];
  docs: DocumentWithSection[];
  stats: Record<number, IngestStats>;
  sectionParents: Record<number, number | null>;
}) {
  const [sectionId, setSectionId] = useState<number>(options[0]?.id ?? 0);
  const [showAll, setShowAll] = useState(false);
  const [ingestFilter, setIngestFilter] = useState<IngestFilter>("all");
  const [togYearFilter, setTogYearFilter] = useState(0); // 0 = all
  const [togIssueFilter, setTogIssueFilter] = useState(0); // 0 = all

  // A document is "in" a section when it lives there directly, or when
  // the chosen section is the parent of the document's subsection.
  const inSection = (docSectionId: number, target: number) =>
    docSectionId === target || sectionParents[docSectionId] === target;

  const countFor = (target: number) =>
    docs.filter((d) => inSection(d.section_id, target)).length;

  const optionsWithCounts = options.map((o) => ({
    ...o,
    label: `${o.label} (${countFor(o.id)})`,
  }));

  const ingestState = (doc: DocumentWithSection): IngestFilter => {
    if (doc.status === "failed") return "failed";
    // A platform timeout kills the run before the status can be set
    // back, leaving "processing" forever; its chunks/facts are intact.
    if (doc.status === "processing") return "processing";
    const s = stats[doc.id];
    if (!s || s.chunk_count === 0) return "none";
    if (s.fact_count === 0) return "partial";
    return "ingested";
  };

  const inScope = showAll
    ? docs
    : docs.filter((d) => inSection(d.section_id, sectionId));

  // TOG year choices come from what's actually in scope.
  const togYears = Array.from(
    new Set(
      inScope.map((d) => d.tog_year).filter((y): y is number => Boolean(y))
    )
  ).sort((a, b) => b - a);
  const hasTog = togYears.length > 0;

  const visible = inScope.filter((d) => {
    if (ingestFilter !== "all" && ingestState(d) !== ingestFilter) return false;
    if (togYearFilter && d.tog_year !== togYearFilter) return false;
    if (togIssueFilter && d.tog_issue !== togIssueFilter) return false;
    return true;
  });

  const filtersActive =
    ingestFilter !== "all" || togYearFilter !== 0 || togIssueFilter !== 0;

  const currentLabel =
    options.find((o) => o.id === sectionId)?.label ?? "this section";

  return (
    <>
      <SourceUploadForm
        options={optionsWithCounts}
        sectionId={sectionId}
        onSectionChange={(id) => {
          setSectionId(id);
          setShowAll(false);
          setTogYearFilter(0);
          setTogIssueFilter(0);
        }}
      />

      <div className="mb-3 mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-theatre">
          Documents
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-graphite/70">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="h-3.5 w-3.5 accent-theatre"
          />
          Show all sections ({docs.length})
        </label>
      </div>

      {!showAll && (
        <p className="mb-3 text-xs text-graphite/60">
          Showing <span className="font-mono">{visible.length}</span> document
          {visible.length === 1 ? "" : "s"} in{" "}
          <span className="font-medium text-theatre">{currentLabel}</span> —
          change the section above to review another.
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={ingestFilter}
          onChange={(e) => setIngestFilter(e.target.value as IngestFilter)}
          className="rounded-card border border-hairline bg-white px-2 py-1.5 text-xs"
          aria-label="Filter by ingestion status"
        >
          {INGEST_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        {hasTog && (
          <>
            <select
              value={togYearFilter}
              onChange={(e) => setTogYearFilter(Number(e.target.value))}
              className="rounded-card border border-hairline bg-white px-2 py-1.5 text-xs"
              aria-label="Filter by TOG year"
            >
              <option value={0}>TOG: any year</option>
              {togYears.map((y) => (
                <option key={y} value={y}>
                  TOG {y}
                </option>
              ))}
            </select>
            <select
              value={togIssueFilter}
              onChange={(e) => setTogIssueFilter(Number(e.target.value))}
              className="rounded-card border border-hairline bg-white px-2 py-1.5 text-xs"
              aria-label="Filter by TOG issue"
            >
              <option value={0}>Any issue</option>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  Issue {n} ({TOG_ISSUE_MONTHS[n]})
                </option>
              ))}
            </select>
          </>
        )}

        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setIngestFilter("all");
              setTogYearFilter(0);
              setTogIssueFilter(0);
            }}
            className="rounded px-2 py-1 text-xs font-medium text-greentop hover:text-theatre"
          >
            Clear filters
          </button>
        )}
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-graphite/60">
          Nothing uploaded yet. Your first document will appear here.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-graphite/60">
          {filtersActive
            ? "No documents match these filters — clear them to see everything in this section."
            : "No documents in this section yet — upload the first one above, or tick “Show all sections” to see everything."}
        </p>
      ) : (
        <DocumentList docs={visible} stats={stats} options={options} />
      )}
    </>
  );
}
