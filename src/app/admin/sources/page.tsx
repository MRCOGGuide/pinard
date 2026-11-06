import { TraceHeader } from "@/components/TraceHeader";
import { searchedDocumentIds } from "@/lib/decision-aid-searched";
import { createClient } from "@/lib/supabase/server";
import { sectionOptions } from "@/lib/sections";
import { questionCountsByDocument, type QuestionCounts } from "@/lib/source-question-counts";
import { maxReachedSources } from "@/lib/source-max";
import { sameFileTwins, type Twin } from "@/lib/source-twins";
import { sourceProgress, type SourceProgress } from "@/lib/source-status";
import { fetchAll } from "@/lib/supabase/all";
import type { ContentDocument, Section } from "@/lib/types";
import { SourcesWorkspace } from "./SourcesWorkspace";
import { RetrievalTest } from "./RetrievalTest";

export type DocumentWithSection = ContentDocument & {
  sections: { title: string } | null;
};

export type IngestStats = {
  chunk_count: number;
  fact_count: number;
  /** Aids the owner has not rejected. */
  aid_count: number;
  /** Whether it has been searched for aids, so that none found is not read as never looked. */
  aids_searched: boolean;
  questions: QuestionCounts;
  /** It has no more of this format to give (lib/source-max). */
  max: { sba: boolean; emq: boolean };
  /** The same file held as another source that has been searched, which answers for this one's aids. */
  twin: Twin | null;
  progress: SourceProgress;
};

export default async function SourcesPage() {
  const supabase = await createClient();

  const [{ data: sections }, { data: documents }, { data: stats }, { data: aids }, questions, searched, maxed] =
    await Promise.all([
      supabase.from("sections").select("*").order("sort_order"),
      supabase
        .from("content_documents")
        .select("*, sections(title)")
        .order("uploaded_at", { ascending: false }),
      supabase.rpc("document_ingest_stats"),
      supabase.from("decision_aids").select("document_id, status"),
      fetchAll<Parameters<typeof questionCountsByDocument>[0][number]>((from, to) =>
        supabase
          .from("generated_questions")
          .select("id, format, status, emq_group_id, source_document_ids")
          .order("id")
          .range(from, to)
      ),
      searchedDocumentIds(),
      maxReachedSources(),
    ]);

  const allSections = (sections ?? []) as Section[];
  const options = sectionOptions(allSections);
  const docs = (documents ?? []) as DocumentWithSection[];

  // Parent lookup so the workspace can roll subsections up into their
  // parent section when filtering and counting.
  const sectionParents: Record<number, number | null> = {};
  for (const s of allSections) sectionParents[s.id] = s.parent_id;

  // Plain object (not a Map) so it can cross into the client component.
  const questionCounts = questionCountsByDocument(questions);
  const twins = await sameFileTwins(docs);
  const statsByDoc: Record<number, IngestStats> = {};
  for (const row of (stats ?? []) as {
    document_id: number;
    chunk_count: number;
    fact_count: number;
  }[]) {
    statsByDoc[row.document_id] = {
      chunk_count: Number(row.chunk_count),
      fact_count: Number(row.fact_count),
      aid_count: 0,
      aids_searched: searched.has(row.document_id),
      questions: questionCounts[row.document_id] ?? { sba: 0, emq: 0, waiting: 0, waitingSba: 0, waitingEmq: 0 },
      max: maxed[row.document_id] ?? { sba: false, emq: false },
      twin: null,
      progress: { state: "none", missing: [] },
    };
  }
  for (const aid of (aids ?? []) as { document_id: number; status: string }[]) {
    const entry = statsByDoc[aid.document_id];
    if (!entry) continue;
    entry.aids_searched = true;
    if (aid.status !== "rejected") entry.aid_count += 1;
  }
  for (const doc of docs) {
    const s = statsByDoc[doc.id];
    if (!s) continue;
    const held = (twins[doc.id] ?? [])
      .filter((id) => statsByDoc[id]?.aids_searched)
      .sort((a, b) => statsByDoc[b].aid_count - statsByDoc[a].aid_count)[0];
    if (held && s.aid_count === 0) {
      const title = docs.find((d) => d.id === held)?.title ?? "";
      s.twin = { id: held, title, aids: statsByDoc[held].aid_count, searched: true };
    }
    s.progress = sourceProgress({
      chunks: s.chunk_count,
      facts: s.fact_count,
      factsChecked: Boolean(doc.facts_extracted_at),
      sba: s.questions.sba + s.questions.waitingSba,
      emq: s.questions.emq + s.questions.waitingEmq,
      sbaMax: s.max.sba,
      emqMax: s.max.emq,
      aids: s.aid_count,
      searched: s.aids_searched || Boolean(s.twin),
      pdf: Boolean(doc.file_url?.endsWith(".pdf")),
    });
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
        lede="Upload a guideline PDF or paste text. Ingestion chunks the document, embeds it and extracts key facts, everything question generation will draw on."
      />

      {options.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-4 text-sm text-ink/65">
          Create at least one section first, every document belongs to a
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

      <h2 className="mb-3 mt-10 font-display text-xl font-semibold text-ink-strong">
        Retrieval test
      </h2>
      <p className="mb-3 text-sm text-ink/65">
        Ask a question and see the top passages the generator would be given.
      </p>
      <RetrievalTest options={options} />
    </>
  );
}
