import { withoutReferenceLists } from "@/lib/bibliography";
import { createAdminClient } from "@/lib/supabase/admin";
import { type RetrievedChunk } from "@/lib/retrieval";
import {
  generateVerifiedQuestion,
  generateVerifiedEmqSet,
  groupEmqExamples,
  type StyleExample,
} from "@/lib/generation";
import { EXAM_LABELS, type ExamPart, type QuestionFormat } from "@/lib/types";

/**
 * One batch of question generation, start to finish: build the passage
 * pool, pick style examples, generate, verify, store. SERVER ONLY, and
 * callers must check permissions first — this uses the service role.
 *
 * Lifted out of the /api/generate route so the queue worker can run
 * exactly the same batch unattended. The route is now a thin wrapper
 * over it.
 */

const PER_QUESTION = 10; // chunks sampled per question, for variety
// Upper bound on a whole-section pool. Sections run to a few hundred
// chunks; this only guards against an unexpectedly huge one.
const SECTION_POOL_CAP = 1000;
/**
 * Target difficulties, cycled across a batch so a section ends up with a
 * spread rather than a single band. Weighted the way a paper is —
 * mostly middling, a few at each extreme — rather than uniformly.
 *
 * What is stored is the difficulty we ASKED for, not the one the model
 * reports. Asked for 2, 3 and 4 in rotation, it self-assessed 84 of its
 * first 101 questions as a 2: the self-report clusters and carries no
 * information, while the requested level is the one the prompt actually
 * steers the question toward.
 */
const DIFFICULTIES = [2, 3, 4, 3, 5, 2, 4, 1, 3, 4];
// Real EMQ sets vary in size; cycling keeps a batch from looking uniform.
const EMQ_OPTION_COUNTS = [10, 12, 14];
// Four first, not three: three is the floor for a valid set, so a set of
// three that loses one scenario to the grounding check is lost entirely.
// Asking for four leaves the salvage in generateVerifiedEmqSet somewhere
// to go, which matters most when only one set is being generated.
const EMQ_SCENARIO_COUNTS = [4, 4, 3];

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

/**
 * Passages for one EMQ set: consecutive chunks from a single document,
 * so the scenarios share a topic and can carry distinct answers. Sets
 * built from unrelated chunks routinely fail as
 * "insufficient_source_material". `nth` walks through the available
 * documents so a batch spreads across the section.
 */
const EMQ_PASSAGE_COUNT = 14;
function passagesForEmq(
  pool: RetrievedChunk[],
  nth: number
): RetrievedChunk[] {
  const byDocument = new Map<number, RetrievedChunk[]>();
  for (const chunk of pool) {
    const list = byDocument.get(chunk.document_id) ?? [];
    list.push(chunk);
    byDocument.set(chunk.document_id, list);
  }

  // Richest documents first — they can support a whole set.
  const documents = Array.from(byDocument.values()).sort(
    (a, b) => b.length - a.length
  );
  if (documents.length === 0) return pool.slice(0, EMQ_PASSAGE_COUNT);

  const chosen = documents[nth % documents.length];
  // Keep chunk order: adjacent text reads as one coherent topic.
  const ordered = [...chosen].sort((a, b) => a.chunk_index - b.chunk_index);
  if (ordered.length <= EMQ_PASSAGE_COUNT) {
    // Thin document — top up from the next richest for enough material.
    const filler = documents
      .filter((d) => d !== chosen)
      .flat()
      .slice(0, EMQ_PASSAGE_COUNT - ordered.length);
    return [...ordered, ...filler];
  }
  // Long document: take a contiguous window, varying where it starts.
  const start =
    (nth * EMQ_PASSAGE_COUNT) % Math.max(1, ordered.length - EMQ_PASSAGE_COUNT);
  return ordered.slice(start, start + EMQ_PASSAGE_COUNT);
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

export type BatchResult =
  | { ok: false; error: string; status: number }
  | {
      ok: true;
      created: number;
      emqScenarios: number;
      flagged: number;
      insufficient: number;
      problems: string[];
      /** True when the deadline stopped the batch before `count`. */
      stoppedEarly: boolean;
    };

export async function runGenerationBatch(params: {
  sectionId: number;
  documentId?: number | null;
  format: QuestionFormat;
  count: number;
  /**
   * Epoch ms after which no further question is started. The worker
   * sets this so a batch returns before the platform kills it, leaving
   * the job's progress recorded rather than lost.
   */
  deadline?: number;
  /**
   * Where to start in the difficulty cycle. Without it every batch
   * begins at the first entry, so a queue that generates three at a
   * time only ever emits the first three levels — the queue passes how
   * many questions the job has already made, and the cycle continues
   * across runs instead of restarting.
   */
  difficultyOffset?: number;
}): Promise<BatchResult> {
  const requestedSectionId = Number(params.sectionId);
  const documentId = Number(params.documentId) || null;
  const format: QuestionFormat = params.format === "emq" ? "emq" : "sba";
  const count = Math.min(Math.max(Number(params.count) || 0, 1), 20);
  if (!requestedSectionId && !documentId) {
    return { ok: false, error: "sectionId is required", status: 400 };
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
      return { ok: false, error: "Document not found", status: 404 };
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
    return { ok: false, error: "Section not found", status: 404 };
  }
  const examLabel = EXAM_LABELS[section.exam as ExamPart];

  // Documents hang off sub-topics, not their parent section, so
  // generating for "Obstetrics" must reach into its sub-topics.
  const { data: children } = await supabase
    .from("sections")
    .select("id")
    .eq("parent_id", sectionId);
  const childIds = (children ?? []).map((c) => c.id as number);
  const sectionIds = [sectionId, ...childIds];
  const isParent = childIds.length > 0;

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
      return { ok: false, error: "No articles found for this TOG issue — upload and ingest the issue's articles first, so questions can cite them (CPD questions are a topic guide, not a fact source).", status: 400 };
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
      return { ok: false, error: "This issue's articles have no ingested chunks yet — ingest them first.", status: 400 };
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
      return { ok: false, error: "This document has no ingested chunks yet — ingest it first.", status: 400 };
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
    // Take the section's own chunks, not the ones a search says look
    // most like its name.
    //
    // This used to embed the section title and keep the 24 nearest
    // chunks. But there is no question being answered here — the
    // "query" is a topic name — and nearest to a bare topic name is
    // systematically the wrong material: title pages, running headers
    // and reference entries repeat the topic words densely, while the
    // paragraph that actually states a threshold rarely names the topic
    // at all. Generating for Multiple Pregnancy returned a pool of
    // citations titled "...monochorionic versus dichorionic twin
    // pregnancies", from which no question can be written, out of a
    // section holding 128 usable chunks.
    //
    // A whole-section run wants breadth over the section, so the pool
    // is every chunk in it and the per-question sampling provides the
    // variety.
    const { data: chunks, error: poolError } = await supabase
      .from("content_chunks")
      .select(
        "id, document_id, section_id, chunk_index, text, content_documents(title, source_reference)"
      )
      .in("section_id", sectionIds)
      .order("document_id")
      .order("chunk_index")
      .limit(SECTION_POOL_CAP);
    if (poolError) {
      return { ok: false, error: poolError.message, status: 500 };
    }
    pool = ((chunks ?? []) as unknown as {
      id: number;
      document_id: number;
      section_id: number;
      chunk_index: number;
      text: string;
      content_documents: { title: string; source_reference: string } | null;
    }[]).map((c) => ({
      chunk_id: c.id,
      document_id: c.document_id,
      section_id: c.section_id,
      chunk_index: c.chunk_index,
      text: c.text,
      similarity: 1,
      document_title: c.content_documents?.title ?? "",
      source_reference: c.content_documents?.source_reference ?? "",
    }));

    // Document metadata for source exclusions and TOG recency weighting.
    const docIds = Array.from(new Set(pool.map((p) => p.document_id)));
    const { data: metas } = await supabase
      .from("content_documents")
      .select("id, tog_year, tog_category, priority")
      .in("id", docIds);
    const metaById = new Map(
      (metas ?? []).map((m) => [
        m.id as number,
        m as {
          id: number;
          tog_year: number | null;
          tog_category: string | null;
          priority: number | null;
        },
      ])
    );

    // CPD questions are never citable facts.
    //
    // Nor is background material (priority 3): "Spotlight on..."
    // editorials, correspondence, corrections and patient leaflets. A
    // Spotlight piece is an annotated contents page — its only "facts"
    // are that an article exists on a topic, so questions written from
    // it test the contents page rather than clinical knowledge.
    pool = pool.filter((p) => {
      const meta = metaById.get(p.document_id);
      return meta?.tog_category !== "cpd" && meta?.priority !== 3;
    });

    // A guideline's back matter — numbered citations, author statements,
    // URL lists — is correctly ingested but states no clinical fact, so
    // it can never ground a question. Around a fifth of chunks are back
    // matter, and enough of them in one batch makes the model report a
    // perfectly substantial section as having insufficient source
    // material. The floor keeps a section that really is mostly
    // references attemptable rather than silently ungeneratable.
    pool = withoutReferenceLists(pool, PER_QUESTION * 2);
    if (pool.length === 0) {
      return {
        ok: false,
        error: isParent
          ? `No ingested source passages under "${section.title}" or its ${childIds.length} sub-topics. Check the Source library for documents that are uploaded but not yet ingested.`
          : `No ingested source passages in "${section.title}". Upload and ingest a document for it first.`,
        status: 400,
      };
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
      .in("section_id", sectionIds)
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
    "format, stem, options, correct_key, lead_in, rationale, emq_group_id";
  // EMQ exemplars are stored one row per scenario, so a set needs all
  // of its rows — fetch generously and regroup into whole sets.
  const exampleLimit = format === "emq" ? 80 : EXAMPLE_TARGET;

  const { data: sectionExamples } = await supabase
    .from("example_questions")
    .select(exampleColumns)
    .eq("format", format)
    .in("section_id", sectionIds)
    .limit(exampleLimit);
  const examples = (sectionExamples ?? []) as StyleExample[];

  if (examples.length < exampleLimit) {
    const { data: globalExamples } = await supabase
      .from("example_questions")
      .select(exampleColumns)
      .eq("format", format)
      .is("section_id", null)
      .limit(exampleLimit - examples.length);
    examples.push(...((globalExamples ?? []) as StyleExample[]));
  }

  // Whole EMQ sets — showing individual scenario rows would teach the
  // model to write an SBA with a long option list, which is the bug
  // this replaces. Cap at 3 sets to keep the prompt affordable.
  const exampleSets =
    format === "emq"
      ? groupEmqExamples(
          examples as unknown as Parameters<typeof groupEmqExamples>[0]
        ).slice(0, 3)
      : [];

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
  const sectionByChunk = new Map(pool.map((p) => [p.chunk_id, p.section_id]));

  /**
   * File each question under the sub-topic its sources actually belong
   * to. Generating for a parent section must not store questions on the
   * parent: study plans and sessions work from sub-topics, so anything
   * left on a parent would never be served to a candidate.
   */
  const sectionForCitations = (citationIds: number[]): number => {
    const counts = new Map<number, number>();
    for (const id of citationIds) {
      const s = sectionByChunk.get(id);
      if (typeof s === "number") counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    let best = sectionId;
    let bestCount = 0;
    for (const [s, n] of Array.from(counts)) {
      if (n > bestCount) {
        best = s;
        bestCount = n;
      }
    }
    return best;
  };

  // A question is as important as the most important source it cites,
  // so sessions can favour core guidance without joining documents.
  const docIdsInPool = Array.from(new Set(pool.map((p) => p.document_id)));
  const { data: priorityRows } = await supabase
    .from("content_documents")
    .select("id, priority")
    .in("id", docIdsInPool);
  const priorityByDocument = new Map(
    (priorityRows ?? []).map((r) => [r.id as number, r.priority as number])
  );

  // What has already been asked here, so this batch doesn't re-test the
  // same points. Approved AND pending both count — a pending duplicate
  // is just as wasteful to review.
  const existingQuery = supabase
    .from("generated_questions")
    .select("stem, coverage_note, citation_chunk_ids")
    .in("status", ["approved", "pending"]);
  const { data: existingRows } = await (focusDoc
    ? existingQuery.overlaps("source_document_ids", [focusDoc.id])
    : existingQuery.eq("section_id", sectionId));

  // What each existing question tests, for the generator to avoid.
  //
  // The coverage note in preference to the stem: a stem is a vignette
  // of several hundred characters, most of them the woman rather than
  // the knowledge, and the whole history has to fit in one prompt.
  // Questions written before the note was stored fall back to their
  // stem, so nothing is invisible while the bank catches up.
  const askedStems: string[] = [];
  const usedChunkIds = new Set<number>();
  for (const row of (existingRows ?? []) as {
    stem: string;
    coverage_note: string | null;
    citation_chunk_ids: number[] | null;
  }[]) {
    const note = row.coverage_note?.trim();
    if (note) askedStems.push(note);
    else if (row.stem) askedStems.push(row.stem);
    for (const id of row.citation_chunk_ids ?? []) usedChunkIds.add(id);
  }

  // Passages already mined are held back while unused ones remain, so a
  // batch works through fresh material before revisiting anything.
  let freshPool = pool.filter((p) => !usedChunkIds.has(p.chunk_id));

  // 3–5. Generate, verify, store.
  let created = 0;
  let flagged = 0;
  let insufficient = 0;
  const problems: string[] = [];

  let emqScenarios = 0;
  let stoppedEarly = false;

  for (let i = 0; i < count; i++) {
    // Stop cleanly rather than being killed mid-question: whatever has
    // been created is already stored, and the caller records progress.
    if (params.deadline && Date.now() >= params.deadline) {
      stoppedEarly = true;
      break;
    }

    // Prefer unmined passages; top up from used ones only if needed.
    const preferred = freshPool.length >= PER_QUESTION ? freshPool : pool;
    const passages = weightOf
      ? weightedSample(preferred, weightOf, PER_QUESTION)
      : sample(preferred, PER_QUESTION);
    const difficulty =
      DIFFICULTIES[
        (i + (params.difficultyOffset ?? 0)) % DIFFICULTIES.length
      ];

    // EMQs are generated as complete sets: one shared option list, a
    // lead-in, and several scenarios stored as rows sharing a group id.
    if (format === "emq") {
      // A set needs 3-4 scenarios on ONE coherent topic with distinct
      // answers. Ten chunks scattered across unrelated documents can't
      // support that, which is what produced insufficient_source_material.
      // Draw instead from a single document, deepest first.
      const emqPassages = passagesForEmq(preferred.length ? preferred : pool, i);

      const setOutcome = await generateVerifiedEmqSet({
        examPart: examLabel,
        sectionTitle: section.title,
        difficulty,
        optionCount: EMQ_OPTION_COUNTS[i % EMQ_OPTION_COUNTS.length],
        scenarioCount: EMQ_SCENARIO_COUNTS[i % EMQ_SCENARIO_COUNTS.length],
        passages: emqPassages,
        exampleSets,
        highYieldGuide: highYieldGuide || undefined,
        alreadyAsked: askedStems,
      });

      if (setOutcome.status === "ok") {
        const set = setOutcome.set;
        const groupId = crypto.randomUUID();
        const sourceDocumentIds = Array.from(
          new Set(
            set.scenarios
              .flatMap((s) => s.citation_chunk_ids)
              .map((id) => documentByChunk.get(id))
              .filter((d): d is number => typeof d === "number")
          )
        );
        const priority = Math.min(
          ...sourceDocumentIds.map((id) => priorityByDocument.get(id) ?? 2),
          3
        );

        const rows = set.scenarios.map((scenario) => ({
          section_id: sectionId,
          format: "emq" as const,
          stem: scenario.stem,
          options: set.options,
          correct_key: scenario.correct_key,
          // EMQs carry no combined paragraph: the card falls through to
          // the correct option's explanation, which is the only one
          // there is. SBAs still store theirs.
          explanation: null,
          explanations: scenario.explanations.map((e) => {
            const refs = Array.from(
              new Set(
                e.citation_chunk_ids
                  .map((id) => referenceByChunk.get(id))
                  .filter((r): r is string => Boolean(r))
              )
            );
            return refs.length > 0
              ? { ...e, source_reference: refs.join("; ") }
              : e;
          }),
          difficulty,
          citation_chunk_ids: scenario.citation_chunk_ids,
          source_document_ids: sourceDocumentIds,
          // One note for the set: its scenarios share their material.
          coverage_note: set.coverage_note || null,
          priority,
          lead_in: set.lead_in,
          emq_group_id: groupId,
          status: "pending",
        }));

        const { error } = await supabase
          .from("generated_questions")
          .insert(rows);
        if (error) {
          flagged++;
          problems.push(`store failed: ${error.message}`);
        } else {
          created++;
          emqScenarios += rows.length;
          for (const scenario of set.scenarios) {
            askedStems.push(scenario.stem);
            for (const id of scenario.citation_chunk_ids) usedChunkIds.add(id);
          }
          freshPool = freshPool.filter((p) => !usedChunkIds.has(p.chunk_id));
        }
      } else if (setOutcome.status === "insufficient") {
        insufficient++;
        await supabase.from("generation_failures").insert({
          section_id: sectionId,
          format,
          reason: "model reported insufficient_source_material",
          raw_response: null,
        });
      } else {
        flagged++;
        problems.push(setOutcome.reason);
        await supabase.from("generation_failures").insert({
          section_id: sectionId,
          format,
          reason: setOutcome.reason,
          raw_response: setOutcome.raw.slice(0, 4000),
        });
      }
      continue;
    }

    const outcome = await generateVerifiedQuestion({
      examPart: examLabel,
      sectionTitle: section.title,
      format,
      difficulty,
      passages,
      examples,
      highYieldGuide: highYieldGuide || undefined,
      alreadyAsked: askedStems,
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
        section_id: sectionForCitations(q.citation_chunk_ids),
        format,
        stem: q.stem,
        options: q.options,
        correct_key: q.correct_key,
        explanation: q.explanation,
        explanations,
        difficulty,
        citation_chunk_ids: q.citation_chunk_ids,
        source_document_ids: sourceDocumentIds,
        // What this question tests, in one line. Shown to a later batch
        // as the already-asked list, in place of the full stem.
        coverage_note: q.coverage_note || null,
        explanation_table: q.explanation_table,
        priority: Math.min(
          ...sourceDocumentIds.map((id) => priorityByDocument.get(id) ?? 2),
          3
        ),
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
        // Feed this question back in, so the rest of the batch neither
        // re-tests its point nor re-mines the passages it used.
        askedStems.push(q.stem);
        for (const id of q.citation_chunk_ids) usedChunkIds.add(id);
        freshPool = freshPool.filter((p) => !usedChunkIds.has(p.chunk_id));
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

  return {
    ok: true,
    created,
    emqScenarios,
    flagged,
    insufficient,
    problems: problems.slice(0, 5),
    stoppedEarly,
  };
}
