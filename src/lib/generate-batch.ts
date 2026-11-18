import { buildExampleIndex, closestExample, questionText, tooClose } from "@/lib/exampleSimilarity";
import { withoutReferenceLists } from "@/lib/bibliography";
import { createAdminClient } from "@/lib/supabase/admin";
import { withYears, type RetrievedChunk } from "@/lib/retrieval";
import {
  generateVerifiedQuestion,
  generateVerifiedEmqSet,
  type StyleEmqSet,
  type StyleExample,
} from "@/lib/generation";
import { EXAM_LABELS, type ExamPart, type QuestionFormat } from "@/lib/types";
import { readsAsPatientInformation } from "@/lib/sourcePolicy";
import { aidsForPassages, approvedAidsForDocuments, formatAidsForGeneration, type ApprovedAid } from "@/lib/decision-aids";
import { askedPoints, nearestPoints, pointLines, type AskedPoint, type AskedRow } from "@/lib/question-points";
import { limitIn, type ModelLimit } from "@/lib/queue";
import { libraryTwins } from "@/lib/source-twins";
import { fetchAll } from "@/lib/supabase/all";

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
// Mostly three, because the host allows a request 60 seconds and the
// scenarios are what a set costs: one generation call whose latency
// tracks how much prose it has to write, then a grounding check for
// each scenario.
//
// This is a saving, not a guarantee, and it was mistaken for one.
// Three runs of a four-scenario set gave 28s, 57s and 40s, which
// looked like sizing had solved it; four more of a three-scenario set
// gave 33.7s, 53.8s, 65.4s and 98.5s. The spread is the model's reply
// time, so no set is small enough to be safe and what actually keeps a
// run inside the limit is the timeout on each call (WORKER_HARD_MS).
// Smaller sets simply make hitting that timeout rarer.
const EMQ_SCENARIO_COUNTS = [3, 3, 4];

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
  // Long document: take a contiguous window, varying where it starts. A
  // quarter of the way on each time, so that a few tries read the whole
  // document before it is called exhausted, not its first few pages.
  const stride = Math.max(EMQ_PASSAGE_COUNT, Math.floor(ordered.length / 4));
  const start = (nth * stride) % Math.max(1, ordered.length - EMQ_PASSAGE_COUNT);
  return ordered.slice(start, start + EMQ_PASSAGE_COUNT);
}

/** A style example taken from the approved bank, with its id for the similarity check. */
type BankExample = StyleExample & { id: number };
type BankEmqSet = Omit<StyleEmqSet, "scenarios"> & { scenarios: (StyleEmqSet["scenarios"][number] & { id: number })[] };

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Style examples from the approved bank (L7.1), outside the sections
 * being written for. An SBA's explanation is its correct option's text,
 * which is the paragraph a candidate reads under the card; an EMQ set is
 * rebuilt whole from its scenario rows, since single rows would teach
 * the model to write an SBA with a long option list.
 */
export async function bankStyleExamples(
  supabase: ReturnType<typeof createAdminClient>,
  format: QuestionFormat,
  sectionIds: number[],
  target: number,
  setTarget: number
): Promise<{ examples: BankExample[]; exampleSets: BankEmqSet[] }> {
  let query = supabase
    .from("generated_questions")
    .select("id, section_id, format, stem, options, correct_key, lead_in, explanations, emq_group_id")
    .eq("status", "approved")
    .eq("format", format);
  if (sectionIds.length > 0) query = query.not("section_id", "in", `(${sectionIds.join(",")})`);
  const { data } = await query.order("id", { ascending: false }).limit(format === "emq" ? 400 : 200);

  type Row = {
    id: number;
    section_id: number;
    stem: string;
    options: StyleExample["options"];
    correct_key: string;
    lead_in: string | null;
    explanations: { key: string; verdict: string; text: string }[] | null;
    emq_group_id: string | null;
  };
  const rows = (data ?? []) as Row[];
  const explanationOf = (r: Row) =>
    (r.explanations ?? []).find((e) => e.verdict === "correct" && e.key === r.correct_key)?.text?.trim() ??
    (r.explanations ?? []).find((e) => e.verdict === "correct")?.text?.trim() ??
    null;

  if (format === "emq") {
    const sets = new Map<string, BankEmqSet & { section: number }>();
    for (const r of rows) {
      if (!r.emq_group_id) continue;
      const scenario = { id: r.id, stem: r.stem, correct_key: r.correct_key, rationale: explanationOf(r) };
      const set = sets.get(r.emq_group_id);
      if (set) set.scenarios.push(scenario);
      else sets.set(r.emq_group_id, { lead_in: r.lead_in ?? "", options: r.options, scenarios: [scenario], section: r.section_id });
    }
    // One set per section where there are enough, for variety of form.
    const chosen: BankEmqSet[] = [];
    const sections = new Set<number>();
    for (const set of shuffled([...sets.values()].filter((s) => s.scenarios.length >= 2))) {
      if (chosen.length >= setTarget) break;
      if (sections.has(set.section)) continue;
      sections.add(set.section);
      chosen.push({ lead_in: set.lead_in, options: set.options, scenarios: set.scenarios.sort((a, b) => a.id - b.id) });
    }
    return { examples: [], exampleSets: chosen };
  }

  const examples: BankExample[] = [];
  const sections = new Set<number>();
  for (const r of shuffled(rows.filter((r) => explanationOf(r)))) {
    if (examples.length >= target) break;
    if (sections.has(r.section_id)) continue;
    sections.add(r.section_id);
    examples.push({ id: r.id, format, stem: r.stem, options: r.options, correct_key: r.correct_key, lead_in: r.lead_in, rationale: explanationOf(r) });
  }
  return { examples, exampleSets: [] };
}

export type BatchResult =
  | { ok: false; error: string; status: number }
  | {
      ok: true;
      created: number;
      emqScenarios: number;
      flagged: number;
      /** Nothing new could be written, or only points already asked. */
      insufficient: number;
      problems: string[];
      /** True when the deadline stopped the batch before `count`. */
      stoppedEarly: boolean;
      /** The model refused for a limit, which says nothing about this job: it should wait. */
      limit: ModelLimit | null;
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
  /** Wall-clock time by which the request itself must have answered. */
  hardDeadline?: number;
  /**
   * Which stretch of a long document an EMQ set is drawn from. A job on
   * one source makes one set, so without this every set and every retry
   * read the document's first 14 passages: the ESC guideline's preface,
   * three sets, eight tries each, all "insufficient" (5 November 2026).
   */
  emqWindow?: number;
  /**
   * Where to start in the difficulty cycle. Without it every batch
   * begins at the first entry, so a queue that generates three at a
   * time only ever emits the first three levels — the queue passes how
   * many questions the job has already made, and the cycle continues
   * across runs instead of restarting.
   */
  difficultyOffset?: number;
  /** What the owner asked an EMQ set to test (see generateVerifiedEmqSet). */
  brief?: string;
  /** Nothing new was found last time: a point may be tested again from another view. */
  allowRetest?: boolean;
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
  // - Focus on a TOG CPD document: the citation pool is the same issue's
  //   ARTICLES, since facts must come from articles, never from the CPD
  //   questions themselves.
  // - Focus on any other document: its own chunks.
  // - Whole section: retrieval with CPD chunks excluded from citations,
  //   and recency-weighted sampling for TOG.
  // The TOG CPD questions are no longer given to the model as a
  // "high-yield guide" (L7.1): they are the TOG's own questions, and the
  // model is shown only Pinard's approved questions.
  let pool: RetrievedChunk[];
  let weightOf: ((c: RetrievedChunk) => number) | null = null;

  if (focusDoc && focusDoc.tog_category === "cpd") {
    const { data: articleDocs } = await supabase
      .from("content_documents")
      .select("id, title, source_reference")
      .eq("tog_year", focusDoc.tog_year)
      .eq("tog_issue", focusDoc.tog_issue)
      .eq("tog_category", "article");
    if (!articleDocs || articleDocs.length === 0) {
      return { ok: false, error: "No articles found for this TOG issue, upload and ingest the issue's articles first, so questions can cite them (CPD questions are a topic guide, not a fact source).", status: 400 };
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
      return { ok: false, error: "This issue's articles have no ingested chunks yet, ingest them first.", status: 400 };
    }
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
      return { ok: false, error: "This document has no ingested chunks yet, ingest it first.", status: 400 };
    }
    // As for a whole section, below. 23 of GTG 69's 57 passages are its
    // reference list, and the leftovers a source is drawn from fill up with
    // them as questions use the rest: a set was asked for from those, was
    // refused, and the source was called exhausted (6 November 2026).
    pool = withoutReferenceLists(pool, PER_QUESTION);
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

    /*
      Patient information out of the pool before anything is written
      from it. The pool is the whole section, so a job aimed at one
      document can still cite a leaflet sitting beside it — which is
      how #1255 came to teach zidovudine monotherapy out of a 2013
      leaflet. Judged per document over the chunks in hand, since a
      single chunk is too short to tell.
    */
    const textsByDoc = new Map<number, string[]>();
    for (const p of pool) {
      const list = textsByDoc.get(p.document_id) ?? [];
      list.push(p.text);
      textsByDoc.set(p.document_id, list);
    }
    const patientDocs = new Set(
      Array.from(textsByDoc.entries())
        .filter(([, texts]) => readsAsPatientInformation(texts))
        .map(([id]) => id)
    );
    if (patientDocs.size > 0) {
      pool = pool.filter((p) => !patientDocs.has(p.document_id));
    }

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
  }

  /*
    2. Style examples: questions Pinard has written and a clinician has
    approved (L7.1; owner, 18 November 2026: the commercial question book
    is no longer used, "let the model use the questions already approved
    in the bank"). They teach the form only, so they come from OTHER
    sections than this one: an example on the same topic invites the
    same scenario. Drawn from the newest approved, which follow the
    current house rules, and picked at random among them so that
    batches do not all see the same few.
  */
  const EXAMPLE_TARGET = 4;
  const EMQ_SET_TARGET = 3;
  const { examples, exampleSets } = await bankStyleExamples(supabase, format, sectionIds, EXAMPLE_TARGET, EMQ_SET_TARGET);

  /*
    The similarity check (Phase 11): a question that echoes a style
    example, in its stem or its explanation, is discarded here rather
    than stored. Checked against the bank examples in this prompt and
    against every question of the old book, which earlier batches were
    shown; the book's rows are read for this check only and never sent
    to the model.
  */
  const { data: bookExamples } = await supabase
    .from("example_questions")
    .select("id, stem, lead_in, rationale")
    .limit(5000);
  const shown: { id: number; stem: string; explanation: string }[] = [
    ...examples.map((e) => ({ id: e.id, stem: `${e.lead_in ?? ""} ${e.stem}`, explanation: e.rationale ?? "" })),
    ...exampleSets.flatMap((s) => s.scenarios.map((sc) => ({ id: sc.id, stem: `${s.lead_in} ${sc.stem}`, explanation: sc.rationale ?? "" }))),
  ];
  const indexes = [
    {
      name: (id: number) => `style example ${id} from the old book`,
      stems: buildExampleIndex((bookExamples ?? []).map((e) => ({ id: e.id as number, text: `${e.lead_in ?? ""} ${e.stem}` }))),
      explanations: buildExampleIndex(
        (bookExamples ?? []).filter((e) => e.rationale).map((e) => ({ id: e.id as number, text: e.rationale as string }))
      ),
    },
    {
      name: (id: number) => `approved question #${id}, shown as a style example`,
      stems: buildExampleIndex(shown.map((e) => ({ id: e.id, text: e.stem }))),
      explanations: buildExampleIndex(shown.filter((e) => e.explanation).map((e) => ({ id: e.id, text: e.explanation }))),
    },
  ];
  /** Why a question is too close to an example, or null if it is not. */
  const echoesExample = (q: Parameters<typeof questionText>[0]): string | null => {
    const text = questionText(q);
    for (const index of indexes) {
      for (const [part, c] of [
        ["stem", closestExample(text.stem, index.stems)],
        ["explanation", closestExample(text.explanation, index.explanations)],
      ] as const) {
        if (tooClose(c) && c.exampleId !== null) {
          return `too close to ${index.name(c.exampleId)} (${part}: ${c.shared} shared phrases, ${Math.round(c.share * 100)}% of its wording)`;
        }
      }
    }
    return null;
  };

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
  // is just as wasteful to review. The whole section, not only this
  // source: a guideline and its patient leaflet state the same facts. A
  // document held twice is one source, and its copies can sit in other sections.
  const focusIds = focusDoc ? [focusDoc.id, ...((await libraryTwins())[focusDoc.id] ?? [])] : [];
  const points: AskedPoint[] = [];
  const usedChunkIds = new Set<number>();
  let newestRead = 0;
  type ExistingRow = AskedRow & { citation_chunk_ids: number[] | null };
  const readExisting = async () => {
    const columns = "id, format, stem, coverage_note, correct_key, options, citation_chunk_ids, source_document_ids";
    const after = newestRead;
    const [inSection, fromSource] = await Promise.all([
      fetchAll<ExistingRow>((from, to) =>
        supabase.from("generated_questions").select(columns).in("status", ["approved", "pending"]).in("section_id", sectionIds).gt("id", after).order("id").range(from, to)
      ),
      focusIds.length
        ? fetchAll<ExistingRow>((from, to) =>
            supabase.from("generated_questions").select(columns).in("status", ["approved", "pending"]).overlaps("source_document_ids", focusIds).gt("id", after).order("id").range(from, to)
          )
        : Promise.resolve([]),
    ]);
    const rows = Array.from(new Map([...inSection, ...fromSource].map((r) => [r.id, r])).values());
    points.push(...askedPoints(rows, focusIds));
    for (const row of rows) {
      newestRead = Math.max(newestRead, row.id);
      for (const id of row.citation_chunk_ids ?? []) usedChunkIds.add(id);
    }
  };
  await readExisting();

  /** What the writer is told to avoid: all of this source, and what is nearest to its passages. */
  const askedFor = (chosen: RetrievedChunk[]) => pointLines(nearestPoints(points, chosen.map((p) => p.text).join(" "), 60, 15));

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
  let limit: ModelLimit | null = null;
  /*
    A near miss a repair saved (see mendQuestion in generation.ts):
    logged as already resolved, so it is counted without reaching the
    Review page's list of failures.
  */
  const noteMended = async (mended: string | undefined, attempts: number) => {
    if (!mended) return;
    await supabase.from("generation_failures").insert({
      section_id: sectionId,
      format,
      reason: `mended after ${attempts} attempts: ${mended}`,
      raw_response: null,
      resolved: true,
    });
  };

  /*
    The owner's approved decision aids that a question's passages bear on,
    from the documents it draws on most, as a guide to what it tests (Ask
    Pinard, part 3). Read once per set of documents in a batch; a failed
    read means no aids, never a failed question.
  */
  const aidsByDocuments = new Map<string, Promise<ApprovedAid[]>>();
  const aidsFor = async (chosen: RetrievedChunk[]): Promise<string | undefined> => {
    const counts = new Map<number, number>();
    for (const p of chosen) counts.set(p.document_id, (counts.get(p.document_id) ?? 0) + 1);
    const documentIds = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
    const key = documentIds.join(",");
    let aids = aidsByDocuments.get(key);
    if (!aids) {
      aids = approvedAidsForDocuments(documentIds).catch(() => []);
      aidsByDocuments.set(key, aids);
    }
    const picked = aidsForPassages(await aids, chosen.map((p) => p.text));
    return picked.length ? formatAidsForGeneration(picked) : undefined;
  };

  for (let i = 0; i < count; i++) {
    // Stop cleanly rather than being killed mid-question: whatever has
    // been created is already stored, and the caller records progress.
    if (params.deadline && Date.now() >= params.deadline) {
      stoppedEarly = true;
      break;
    }

    // Another run may have written something since this one started.
    if (i > 0) {
      await readExisting();
      freshPool = freshPool.filter((p) => !usedChunkIds.has(p.chunk_id));
    }

    // Prefer unmined passages; top up from used ones only if needed.
    const preferred = freshPool.length >= PER_QUESTION ? freshPool : pool;
    const passages = await withYears(
      weightOf
        ? weightedSample(preferred, weightOf, PER_QUESTION)
        : sample(preferred, PER_QUESTION)
    );
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
      //
      // Once a point may be tested again the whole document is open, and
      // what is left unused is too broken up to read as one topic.
      const emqFrom = params.allowRetest || freshPool.length < EMQ_PASSAGE_COUNT ? pool : freshPool;
      const emqPassages = await withYears(passagesForEmq(emqFrom, i + (params.emqWindow ?? 0)));

      const setOutcome = await generateVerifiedEmqSet({
        examPart: examLabel,
        sectionTitle: section.title,
        difficulty,
        optionCount: EMQ_OPTION_COUNTS[i % EMQ_OPTION_COUNTS.length],
        scenarioCount: EMQ_SCENARIO_COUNTS[i % EMQ_SCENARIO_COUNTS.length],
        passages: emqPassages,
        exampleSets,
        alreadyAsked: askedFor(emqPassages),
        allowRetest: params.allowRetest,
        existingPoints: points,
        brief: params.brief,
        decisionAids: await aidsFor(emqPassages),
        deadline: params.deadline,
        hardDeadline: params.hardDeadline,
      });

      const setEcho =
        setOutcome.status === "ok"
          ? setOutcome.set.scenarios
              .map((sc) => echoesExample({ stem: sc.stem, lead_in: setOutcome.set.lead_in, explanations: sc.explanations }))
              .find(Boolean) ?? null
          : null;
      if (setEcho) {
        flagged++;
        problems.push(setEcho);
        await supabase.from("generation_failures").insert({
          section_id: sectionId,
          format,
          reason: setEcho,
          raw_response: JSON.stringify(setOutcome.status === "ok" ? setOutcome.set : null).slice(0, 4000),
        });
      } else if (setOutcome.status === "ok") {
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
          coverage_note: scenario.point || set.coverage_note || null,
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
          await noteMended(setOutcome.mended, setOutcome.attempts);
          await readExisting();
          freshPool = freshPool.filter((p) => !usedChunkIds.has(p.chunk_id));
        }
      } else if (setOutcome.status === "insufficient") {
        insufficient++;
        await supabase.from("generation_failures").insert({
          section_id: sectionId,
          format,
          reason: setOutcome.repeated ? "every attempt repeated a point already asked" : "model reported insufficient_source_material",
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
        limit = limitIn(setOutcome.reason);
        if (limit) break;
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
      alreadyAsked: askedFor(passages),
      allowRetest: params.allowRetest,
      existingPoints: points,
      decisionAids: await aidsFor(passages),
      deadline: params.deadline,
      hardDeadline: params.hardDeadline,
    });

    const echo = outcome.status === "ok" ? echoesExample(outcome.question) : null;
    if (echo) {
      flagged++;
      problems.push(echo);
      await supabase.from("generation_failures").insert({
        section_id: sectionId,
        format,
        reason: echo,
        raw_response: JSON.stringify(outcome.status === "ok" ? outcome.question : null).slice(0, 4000),
      });
    } else if (outcome.status === "ok") {
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
        await noteMended(outcome.mended, outcome.attempts);
        // Feed this question back in, so the rest of the batch neither
        // re-tests its point nor re-mines the passages it used.
        await readExisting();
        freshPool = freshPool.filter((p) => !usedChunkIds.has(p.chunk_id));
      }
    } else if (outcome.status === "insufficient") {
      insufficient++;
      await supabase.from("generation_failures").insert({
        section_id: sectionId,
        format,
        reason: outcome.repeated ? "every attempt repeated a point already asked" : "model reported insufficient_source_material",
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
      limit = limitIn(outcome.reason);
      if (limit) break;
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
    limit,
  };
}
