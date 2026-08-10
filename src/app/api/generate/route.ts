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

/** Weighted sampling without replacement — recency bias for TOG. */
function weightedSample(
  pool: RetrievedChunk[],
  weightOf: (c: RetrievedChunk) => number,
  n: number
): RetrievedChunk[] {
  if (pool.length <= n) return pool;
  const items = [...pool];
  const picked: RetrievedChunk[] = [];
  while (picked.length < n && items.length > 0) {
    const total = items.reduce((s, c) => s + weightOf(c), 0);
    let r = Math.random() * total;
    let index = items.length - 1;
    for (let i = 0; i < items.length; i++) {
      r -= weightOf(items[i]);
      if (r <= 0) {
        index = i;
        break;
      }
    }
    picked.push(items.splice(index, 1)[0]);
  }
  return picked;
}

/** Concatenated chunk text of the given documents, for the CPD guide. */
const GUIDE_CHAR_CAP = 7000;
async function cpdGuideText(
  supabase: ReturnType<typeof createAdminClient>,
  docIds: number[]
): Promise<string> {
  if (docIds.length === 0) return "";
  const { data } = await supabase
    .from("content_chunks")
    .select("document_id, chunk_index, text")
    .in("document_id", docIds)
    .order("document_id")
    .order("chunk_index");
  let out = "";
  for (const c of data ?? []) {
    if (out.length >= GUIDE_CHAR_CAP) break;
    out += `${c.text}\n\n`;
  }
  return out.slice(0, GUIDE_CHAR_CAP);
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
    tog_year: number | null;
    tog_issue: number | null;
    tog_category: string | null;
  } | null = null;
  if (documentId) {
    const { data } = await supabase
      .from("content_documents")
      .select(
        "id, title, source_reference, section_id, tog_year, tog_issue, tog_category"
      )
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

  // 1. Build the passage pool.
  // - Focus on a TOG CPD document: its questions become the high-yield
  //   guide, and the citation pool is the same issue's ARTICLES — facts
  //   must come from articles, never from the CPD questions themselves.
  // - Focus on any other document: its own chunks (plus, for a TOG
  //   article, the same issue's CPD as guide).
  // - Whole section: retrieval with CPD chunks excluded from citations,
  //   recency-weighted sampling for TOG, and section CPD as guide.
  let pool: RetrievedChunk[];
  let highYieldGuide = "";
  let weightOf: ((c: RetrievedChunk) => number) | null = null;

  if (focusDoc && focusDoc.tog_category === "cpd") {
    const { data: articleDocs } = await supabase
      .from("content_documents")
      .select("id, title, source_reference")
      .eq("tog_year", focusDoc.tog_year)
      .eq("tog_issue", focusDoc.tog_issue)
      .eq("tog_category", "article");
    if (!articleDocs || articleDocs.length === 0) {
      return NextResponse.json(
        {
          error:
            "No articles found for this TOG issue — upload and ingest the issue's articles first, so questions can cite them (CPD questions are a topic guide, not a fact source).",
        },
        { status: 400 }
      );
    }
    const docById = new Map(articleDocs.map((d) => [d.id as number, d]));
    const { data: chunks } = await supabase
      .from("content_chunks")
      .select("id, document_id, section_id, chunk_index, text")
      .in(
        "document_id",
        articleDocs.map((d) => d.id)
      )
      .order("document_id")
      .order("chunk_index");
    pool = (chunks ?? []).map((c) => ({
      chunk_id: c.id as number,
      document_id: c.document_id as number,
      section_id: c.section_id as number,
      chunk_index: c.chunk_index as number,
      text: c.text as string,
      similarity: 1,
      document_title: docById.get(c.document_id as number)?.title ?? "",
      source_reference:
        docById.get(c.document_id as number)?.source_reference ?? "",
    }));
    if (pool.length === 0) {
      return NextResponse.json(
        { error: "This issue's articles have no ingested chunks yet — ingest them first." },
        { status: 400 }
      );
    }
    highYieldGuide = await cpdGuideText(supabase, [focusDoc.id]);
  } else if (focusDoc) {
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
    // A TOG article: use the same issue's CPD questions as the guide.
    if (focusDoc.tog_year) {
      const { data: cpdDocs } = await supabase
        .from("content_documents")
        .select("id")
        .eq("tog_year", focusDoc.tog_year)
        .eq("tog_issue", focusDoc.tog_issue)
        .eq("tog_category", "cpd");
      highYieldGuide = await cpdGuideText(
        supabase,
        (cpdDocs ?? []).map((d) => d.id as number)
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

    // Document metadata for CPD exclusion and TOG recency weighting.
    const docIds = Array.from(new Set(pool.map((p) => p.document_id)));
    const { data: metas } = await supabase
      .from("content_documents")
      .select("id, tog_year, tog_category")
      .in("id", docIds);
    const metaById = new Map(
      (metas ?? []).map((m) => [
        m.id as number,
        m as { id: number; tog_year: number | null; tog_category: string | null },
      ])
    );

    // CPD questions are never citable facts.
    pool = pool.filter(
      (p) => metaById.get(p.document_id)?.tog_category !== "cpd"
    );
    if (pool.length === 0) {
      return NextResponse.json(
        {
          error:
            "No source passages for this section. Ingest a document for it first.",
        },
        { status: 400 }
      );
    }

    // Recency bias applies within TOG only: issues from the last 5
    // years are favoured over older ones. Guidelines are all current
    // editions, so they sit at a neutral weight.
    const thisYear = new Date().getFullYear();
    weightOf = (c) => {
      const togYear = metaById.get(c.document_id)?.tog_year;
      if (!togYear) return 2;
      return togYear >= thisYear - 4 ? 3 : 1;
    };

    // The section's CPD documents (newest first) guide topic choice.
    const { data: cpdDocs } = await supabase
      .from("content_documents")
      .select("id")
      .eq("section_id", sectionId)
      .eq("tog_category", "cpd")
      .order("tog_year", { ascending: false })
      .order("tog_issue", { ascending: false });
    highYieldGuide = await cpdGuideText(
      supabase,
      (cpdDocs ?? []).map((d) => d.id as number)
    );
  }

  // 2. Style examples of the chosen format: this section's own first,
  // topped up from the global pool (section_id null — exemplars that
  // apply to the whole syllabus, e.g. an imported question book), then
  // from any section as a last resort.
  const EXAMPLE_TARGET = 4;
  const exampleColumns =
    "format, stem, options, correct_key, lead_in, rationale";

  const { data: sectionExamples } = await supabase
    .from("example_questions")
    .select(exampleColumns)
    .eq("format", format)
    .eq("section_id", sectionId)
    .limit(EXAMPLE_TARGET);
  const examples = (sectionExamples ?? []) as StyleExample[];

  if (examples.length < EXAMPLE_TARGET) {
    const { data: globalExamples } = await supabase
      .from("example_questions")
      .select(exampleColumns)
      .eq("format", format)
      .is("section_id", null)
      .limit(EXAMPLE_TARGET - examples.length);
    examples.push(...((globalExamples ?? []) as StyleExample[]));
  }

  if (examples.length < EXAMPLE_TARGET) {
    const { data: anyExamples } = await supabase
      .from("example_questions")
      .select(exampleColumns)
      .eq("format", format)
      .limit(EXAMPLE_TARGET - examples.length);
    examples.push(...((anyExamples ?? []) as StyleExample[]));
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
    const passages = weightOf
      ? weightedSample(pool, weightOf, PER_QUESTION)
      : sample(pool, PER_QUESTION);
    const difficulty = DIFFICULTIES[i % DIFFICULTIES.length];

    const outcome = await generateVerifiedQuestion({
      examPart: examLabel,
      sectionTitle: section.title,
      format,
      difficulty,
      passages,
      examples,
      highYieldGuide: highYieldGuide || undefined,
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
