import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { sectionOptions } from "@/lib/sections";
import type { ContentDocument, Section } from "@/lib/types";
import { SourceUploadForm } from "./SourceUploadForm";
import { DocumentCard } from "./DocumentCard";
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

  const options = sectionOptions((sections ?? []) as Section[]);
  const docs = (documents ?? []) as DocumentWithSection[];

  const statsByDoc = new Map<number, IngestStats>();
  for (const row of (stats ?? []) as {
    document_id: number;
    chunk_count: number;
    fact_count: number;
  }[]) {
    statsByDoc.set(row.document_id, {
      chunk_count: Number(row.chunk_count),
      fact_count: Number(row.fact_count),
    });
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
        <SourceUploadForm options={options} />
      )}

      <h2 className="mb-3 mt-8 font-display text-xl font-semibold text-theatre">
        Documents
      </h2>
      {docs.length === 0 ? (
        <p className="text-sm text-graphite/60">
          Nothing uploaded yet. Your first document will appear here.
        </p>
      ) : (
        <ul className="space-y-3">
          {docs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              stats={statsByDoc.get(doc.id) ?? null}
            />
          ))}
        </ul>
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
