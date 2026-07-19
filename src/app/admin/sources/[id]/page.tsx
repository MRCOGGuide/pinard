import Link from "next/link";
import { notFound } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";

type ChunkRow = {
  id: number;
  chunk_index: number;
  token_count: number | null;
  text: string;
};

type FactRow = {
  id: number;
  chunk_id: number;
  subject: string;
  fact_type: string;
  value_numeric: number | null;
  value_text: string | null;
  statement: string;
  source_reference: string | null;
  content_chunks: { chunk_index: number } | null;
};

export default async function DocumentInspectPage({
  params,
}: {
  params: { id: string };
}) {
  const documentId = Number(params.id);
  if (!documentId) notFound();

  const supabase = createClient();

  const { data: doc } = await supabase
    .from("content_documents")
    .select("*, sections(title)")
    .eq("id", documentId)
    .single();
  if (!doc) notFound();

  const [{ data: chunks }, { data: facts }] = await Promise.all([
    supabase
      .from("content_chunks")
      .select("id, chunk_index, token_count, text")
      .eq("document_id", documentId)
      .order("chunk_index"),
    supabase
      .from("key_facts")
      .select("*, content_chunks!inner(chunk_index, document_id)")
      .eq("content_chunks.document_id", documentId)
      .order("id"),
  ]);

  const chunkRows = (chunks ?? []) as ChunkRow[];
  const factRows = (facts ?? []) as unknown as FactRow[];

  return (
    <>
      <Link
        href="/admin/sources"
        className="mb-4 inline-block text-sm font-medium text-greentop hover:text-theatre"
      >
        ← Source library
      </Link>

      <TraceHeader
        title={doc.title}
        eyebrow={doc.source_reference}
        lede={`${doc.sections?.title ?? "Unassigned"} · status ${doc.status} · ${
          chunkRows.length
        } chunks · ${factRows.length} key facts`}
      />

      <h2 className="mb-3 font-display text-xl font-semibold text-theatre">
        Key facts
      </h2>
      {factRows.length === 0 ? (
        <p className="mb-8 text-sm text-graphite/60">
          No key facts extracted{doc.status === "ingested" ? " from this document" : " yet"}.
        </p>
      ) : (
        <ul className="mb-8 space-y-2">
          {factRows.map((fact) => (
            <li
              key={fact.id}
              className="rounded-card border border-hairline bg-porcelain p-3 shadow-card"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-[11px] text-graphite/60">
                  {fact.fact_type}
                </span>
                <span className="font-mono text-sm font-medium text-heartbeat">
                  {fact.value_text ?? fact.value_numeric ?? "—"}
                </span>
                <span className="text-sm font-medium">{fact.subject}</span>
              </div>
              <p className="mt-1 text-sm text-graphite/80">{fact.statement}</p>
              <p className="mt-1 font-mono text-[11px] text-graphite/50">
                chunk {fact.content_chunks?.chunk_index ?? "?"} ·{" "}
                {fact.source_reference ?? doc.source_reference}
              </p>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 font-display text-xl font-semibold text-theatre">
        Chunks
      </h2>
      {chunkRows.length === 0 ? (
        <p className="text-sm text-graphite/60">
          No chunks yet — run Ingest from the Source library.
        </p>
      ) : (
        <ol className="space-y-2">
          {chunkRows.map((chunk) => (
            <li
              key={chunk.id}
              className="rounded-card border border-hairline bg-porcelain p-3 shadow-card"
            >
              <details>
                <summary className="cursor-pointer font-mono text-xs text-graphite/70">
                  chunk {chunk.chunk_index} · id {chunk.id} ·{" "}
                  {chunk.token_count ?? "?"} tokens ·{" "}
                  {chunk.text.slice(0, 90)}…
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-graphite/90">
                  {chunk.text}
                </p>
              </details>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
