import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { sectionOptions } from "@/lib/sections";
import type { ContentDocument, Section } from "@/lib/types";
import { SourcesWorkspace } from "./SourcesWorkspace";
import { RetrievalTest } from "./RetrievalTest";

export type DocumentWithSection = ContentDocument & {
  sections: { title: string } | null;
};

export type IngestStats = { chunk_count: number; fact_count: number };

export default async function SourcesPage() {
  const supabase = createClient();

  const [{ data: sections }, { data: documents }, { data: stats }] =
    await Promise.all([
      supabase.from("sections").select("*").order("sort_order"),
      supabase
        .from("content_documents")
        .select("*, sections(title)")
        .order("uploaded_at", { ascending: false }),
      supabase.rpc("document_ingest_stats"),
    ]);

  const allSections = (sections ?? []) as Section[];
  const options = sectionOptions(allSections);
  const docs = (documents ?? []) as DocumentWithSection[];

  // Parent lookup so the workspace can roll subsections up into their
  // parent section when filtering and counting.
  const sectionParents: Record<number, number | null> = {};
  for (const s of allSections) sectionParents[s.id] = s.parent_id;

  // Plain object (not a Map) so it can cross into the client component.
  const statsByDoc: Record<number, IngestStats> = {};
  for (const row of (stats ?? []) as {
    document_id: number;
    chunk_count: number;
    fact_count: number;
  }[]) {
    statsByDoc[row.document_id] = {
      chunk_count: Number(row.chunk_count),
      fact_count: Number(row.fact_count),
    };
  }

  // Self-heal stale statuses: a platform timeout can kill an ingest run
  // AFTER its chunks were stored but before the status was finalised,
  // leaving "processing" forever. If such a doc has content, mark it
  // ingested (an actively running ingest re-finalises its own status
  // when it completes, so this never fights a live run).
  const stale = docs.filter(
    (d) =>
      d.status === "processing" && (statsByDoc[d.id]?.chunk_count ?? 0) > 0
  );
  if (stale.length > 0) {
    await supabase
      .from("content_documents")
      .update({ status: "ingested" })
      .in(
        "id",
        stale.map((d) => d.id)
      );
    for (const d of stale) d.status = "ingested";
  }

  return (
    <>
      <TraceHeader
        title="Source library"
        lede="Upload a guideline PDF or paste text. Ingestion chunks the document, embeds it and extracts key facts — everything question generation will draw on."
      />

      {options.length === 0 ? (
        <p className="rounded-card border border-hairline bg-porcelain p-4 text-sm text-graphite/60">
          Create at least one section first — every document belongs to a
          section.
        </p>
      ) : (
        <SourcesWorkspace
          options={options}
          docs={docs}
          stats={statsByDoc}
          sectionParents={sectionParents}
        />
      )}

      <h2 className="mb-3 mt-10 font-display text-xl font-semibold text-theatre">
        Retrieval test
      </h2>
      <p className="mb-3 text-sm text-graphite/60">
        Ask a question and see the top passages the generator would be given.
      </p>
      <RetrievalTest options={options} />
    </>
  );
}
