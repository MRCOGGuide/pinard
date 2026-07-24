"use client";

import { useState } from "react";
import type { SectionOption } from "@/lib/sections";
import type { DocumentWithSection, IngestStats } from "./page";
import { SourceUploadForm } from "./SourceUploadForm";
import { DocumentList } from "./DocumentList";

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

  const visible = showAll
    ? docs
    : docs.filter((d) => inSection(d.section_id, sectionId));

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

      {docs.length === 0 ? (
        <p className="text-sm text-graphite/60">
          Nothing uploaded yet. Your first document will appear here.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-graphite/60">
          No documents in this section yet — upload the first one above, or
          tick &ldquo;Show all sections&rdquo; to see everything.
        </p>
      ) : (
        <DocumentList docs={visible} stats={stats} options={options} />
      )}
    </>
  );
}
