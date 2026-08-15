import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { sectionOptions } from "@/lib/sections";
import { buildCoverage } from "@/lib/coverage";
import type { QuestionFormat, Section } from "@/lib/types";
import { CoverageTable } from "./CoverageTable";

export default async function CoveragePage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const days = Math.min(
    365,
    Math.max(30, Number(searchParams.days) || 120)
  );

  const supabase = createClient();

  const [{ data: sections }, { data: documents }, { data: stats }, { data: questions }] =
    await Promise.all([
      supabase.from("sections").select("*").order("sort_order"),
      supabase.from("content_documents").select("id, title, section_id"),
      supabase.rpc("document_ingest_stats"),
      supabase
        .from("generated_questions")
        .select("section_id, format, source_document_ids")
        .eq("status", "approved"),
    ]);

  const chunksByDoc = new Map<number, number>();
  for (const row of (stats ?? []) as {
    document_id: number;
    chunk_count: number;
  }[]) {
    chunksByDoc.set(Number(row.document_id), Number(row.chunk_count));
  }

  const coverage = buildCoverage({
    sections: sectionOptions((sections ?? []) as Section[]),
    documents: ((documents ?? []) as {
      id: number;
      title: string;
      section_id: number;
    }[]).map((d) => ({
      id: d.id,
      title: d.title,
      sectionId: d.section_id,
      chunks: chunksByDoc.get(d.id) ?? 0,
    })),
    questions: ((questions ?? []) as {
      section_id: number;
      format: QuestionFormat;
      source_document_ids: number[] | null;
    }[]).map((q) => ({
      sectionId: q.section_id,
      format: q.format,
      sourceDocumentIds: q.source_document_ids ?? [],
    })),
    days,
  });

  return (
    <>
      <TraceHeader
        title="Coverage planner"
        lede="How many approved questions each section needs, and what's still missing. Targets are measured by running the real study-plan algorithm for a candidate weak in every topic — so a candidate never meets the same question twice."
      />

      <CoverageTable rows={coverage} days={days} />
    </>
  );
}
