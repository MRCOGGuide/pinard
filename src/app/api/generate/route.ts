import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveChunks, type RetrievedChunk } from "@/lib/retrieval";
import {
  generateVerifiedQuestion,
  type StyleExample,
} from "@/lib/generation";
import { EXAM_LABELS, type ExamPart, type QuestionFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const POOL_SIZE = 24; // chunks retrieved for the section
const PER_QUESTION = 10; // chunks sampled per question, for variety
const DIFFICULTIES = [2, 3, 4]; // cycled across the batch

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export async function POST(request: Request) {
  // Admin only.
  const authClient = createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    sectionId?: number;
    format?: QuestionFormat;
    count?: number;
    documentId?: number;
  } | null;
  const requestedSectionId = Number(body?.sectionId);
  const documentId = Number(body?.documentId) || null;
  const format: QuestionFormat = body?.format === "emq" ? "emq" : "sba";
  const count = Math.min(Math.max(Number(body?.count) || 0, 1), 20);
  if (!requestedSectionId && !documentId) {
    return NextResponse.json({ error: "sectionId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Optional focus document: questions draw only on its chunks.
  let focusDoc: {
    id: number;
    title: string;
    source_reference: string;
    section_id: number;
  } | null = null;
  if (documentId) {
    const { data } = await supabase
      .from("content_documents")
      .select("id, title, source_reference, section_id")
      .eq("id", documentId)
      .single();
    if (!data) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    focusDoc = data;
  }

  // The document's own section wins, so questions are always stored
  // against the section the source actually belongs to.
  const sectionId = focusDoc ? focusDoc.section_id : requestedSectionId;

  const { data: section } = await supabase
    .from("sections")
    .select("id, title, exam")
    .eq("id", sectionId)
    .single();
  if (!section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }
  const examLabel = EXAM_LABELS[section.exam as ExamPart];

  // 1. Build the passage pool: the focus document's chunks, or a
  // section-wide retrieval (query = the section title) for breadth.
  let pool: RetrievedChunk[];
  if (focusDoc) {
    const { data: chunks } = await supabase
      .from("content_chunks")
      .select("id, document_id, section_id, chunk_index, text")
      .eq("document_id", focusDoc.id)
      .order("chunk_index");
    pool = (chunks ?? []).map((c) => ({
      chunk_id: c.id as number,
      document_id: c.document_id as number,
      section_id: c.section_id as number,
      chunk_index: c.chunk_index as number,
      text: c.text as string,
      similarity: 1,
      document_title: focusDoc!.title,
      source_reference: focusDoc!.source_reference,
    }));
    if (pool.length === 0) {
      return NextResponse.json(
        { error: "This document has no ingested chunks yet — ingest it first." },
        { status: 400 }
      );
    }
  } else {
    try {
      pool = await retrieveChunks(section.title, [sectionId], POOL_SIZE);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Retrieval failed" },
        { status: 500 }
      );
    }
    if (pool.length === 0) {
      return NextResponse.json(
        {
          error:
            "No source passages for this section. Ingest a document for it first.",
        },
        { status: 400 }
      );
    }
  }

  // 2. Style examples of the chosen format (this section first, else any).
  const { data: sectionExamples } = await supabase
    .from("example_questions")
    .select("format, stem, options, correct_key, lead_in, rationale")
    .eq("format", format)
    .eq("section_id", sectionId)
    .limit(4);
  let examples = (sectionExamples ?? []) as StyleExample[];
  if (examples.length < 3) {
    const { data: anyExamples } = await supabase
      .from("example_questions")
      .select("format, stem, options, correct_key, lead_in, rationale")
      .eq("format", format)
      .limit(4);
    if ((anyExamples?.length ?? 0) > examples.length) {
      examples = (anyExamples ?? []) as StyleExample[];
    }
  }

  // Authoritative citation labels. The model also reports a
  // source_reference per explanation, but that is its own prose; the
  // reference a candidate sees is derived from the cited chunks
  // themselves so it always names the real guideline.
  const referenceByChunk = new Map(
    pool.map((p) => [p.chunk_id, p.source_reference])
  );
  const documentByChunk = new Map(
    pool.map((p) => [p.chunk_id, p.document_id])
  );

  // 3–5. Generate, verify, store.
  let created = 0;
  let flagged = 0;
  let insufficient = 0;
  const problems: string[] = [];

  for (let i = 0; i < count; i++) {
    const passages = sample(pool, PER_QUESTION);
    const difficulty = DIFFICULTIES[i % DIFFICULTIES.length];

    const outcome = await generateVerifiedQuestion({
      examPart: examLabel,
      sectionTitle: section.title,
      format,
      difficulty,
      passages,
      examples,
    });

    if (outcome.status === "ok") {
      const q = outcome.question;
      const explanations = q.explanations.map((e) => {
        const refs = Array.from(
          new Set(
            e.citation_chunk_ids
              .map((id) => referenceByChunk.get(id))
              .filter((r): r is string => Boolean(r))
          )
        );
        return refs.length > 0 ? { ...e, source_reference: refs.join("; ") } : e;
      });

      // Guideline provenance that survives re-ingestion (chunk ids don't).
      const sourceDocumentIds = Array.from(
        new Set(
          q.citation_chunk_ids
            .map((id) => documentByChunk.get(id))
            .filter((d): d is number => typeof d === "number")
        )
      );

      const { error } = await supabase.from("generated_questions").insert({
        section_id: sectionId,
        format,
        stem: q.stem,
        options: q.options,
        correct_key: q.correct_key,
        explanations,
        difficulty: Math.min(Math.max(q.difficulty, 1), 5),
        citation_chunk_ids: q.citation_chunk_ids,
        source_document_ids: sourceDocumentIds,
        status: "pending",
      });
      if (error) {
        flagged++;
        problems.push(`store failed: ${error.message}`);
        await supabase.from("generation_failures").insert({
          section_id: sectionId,
          format,
          reason: `store failed: ${error.message}`,
          raw_response: JSON.stringify(q).slice(0, 4000),
        });
      } else {
        created++;
      }
    } else if (outcome.status === "insufficient") {
      insufficient++;
      await supabase.from("generation_failures").insert({
        section_id: sectionId,
        format,
        reason: "model reported insufficient_source_material",
        raw_response: null,
      });
    } else {
      flagged++;
      problems.push(outcome.reason);
      await supabase.from("generation_failures").insert({
        section_id: sectionId,
        format,
        reason: outcome.reason,
        raw_response: outcome.raw.slice(0, 4000),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    flagged,
    insufficient,
    problems: problems.slice(0, 5),
  });
}
