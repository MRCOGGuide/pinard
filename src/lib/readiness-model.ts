import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/all";
import { leafSections } from "@/lib/performance";
import {
  FACTS_PER_PAGE_FLOOR,
  testedFacts,
  type ReadinessGuideline,
  type ReadinessModel,
} from "@/lib/readiness";
import type { ExamPart, Section, SectionPriority } from "@/lib/types";

/**
 * Facts a page is taken to hold where the library's own count cannot be
 * read: the median across the guidelines behind Part 2 questions (4.2,
 * measured 16 November 2026).
 */
const FALLBACK_FACTS_PER_PAGE = 4;

/**
 * Every passage's guideline and the facts extracted from it, as
 * { passage id: [document id, facts] }.
 *
 * From public.readiness_passages() (phase56) in one call. Without it the
 * facts cannot be read in time for a page (65,000 rows, about thirteen
 * seconds), so each passage is credited with the median and only the
 * passages themselves are read.
 */
async function readPassages(db: ReturnType<typeof createAdminClient>): Promise<{ map: Map<number, [number, number]>; counted: boolean }> {
  const { data, error } = await db.rpc("readiness_passages");
  if (!error && data && typeof data === "object") {
    const map = new Map<number, [number, number]>();
    for (const [id, value] of Object.entries(data as Record<string, [number, number]>)) map.set(Number(id), value);
    return { map, counted: true };
  }
  const rows = await fetchAll<{ id: number; document_id: number }>((from, to) =>
    db.from("content_chunks").select("id, document_id").order("id").range(from, to)
  );
  return { map: new Map(rows.map((r) => [r.id, [r.document_id, FALLBACK_FACTS_PER_PAGE]])), counted: false };
}

/**
 * What lib/readiness weighs a candidate against: every guideline behind
 * the exam's approved questions, its facts and priority and what the
 * bank can test of it, and each question's topic, difficulty and cited
 * passages.
 *
 * Read by the server with the service role: the library is not the
 * candidate's to read, and only counts leave this function. Cached for
 * six hours: the bank and the library change by the batch.
 *
 * A guideline held twice in the library (the same title under two ids)
 * is counted once, under the first id.
 */
export async function buildReadinessModel(
  exam: ExamPart,
  /** Scripts only: passages read some other way (the facts counted directly). */
  passagesGiven?: Map<number, [number, number]>
): Promise<ReadinessModel & { factsCounted: boolean }> {
  const db = createAdminClient();
  const { data: sectionRows } = await db.from("sections").select("*").eq("exam", exam);
  const leaves = leafSections((sectionRows ?? []) as Section[]);
  const leafIds = leaves.map((s) => s.id);
  const empty = { guidelines: [], questions: {}, passages: {}, topicPriority: {}, factsCounted: false };
  if (leafIds.length === 0) return empty;

  const [questions, documents, passages] = await Promise.all([
    fetchAll<{ id: number; section_id: number; difficulty: number | null; citation_chunk_ids: number[] | null }>((from, to) =>
      db
        .from("generated_questions")
        .select("id, section_id, difficulty, citation_chunk_ids")
        .eq("status", "approved")
        .in("section_id", leafIds)
        .order("id")
        .range(from, to)
    ),
    fetchAll<{ id: number; title: string | null; priority: number | null }>((from, to) =>
      db.from("content_documents").select("id, title, priority").order("id").range(from, to)
    ),
    passagesGiven ? Promise.resolve({ map: passagesGiven, counted: true }) : readPassages(db),
  ]);

  // One id per title, so a twin is not counted twice.
  const canonical = new Map<number, number>();
  const byTitle = new Map<string, number>();
  for (const d of documents) {
    const title = (d.title ?? "").trim().toLowerCase();
    if (!title) continue;
    const first = byTitle.get(title);
    if (first === undefined) byTitle.set(title, d.id);
    else canonical.set(d.id, first);
  }
  const canon = (id: number) => canonical.get(id) ?? id;
  const priorityOf = new Map(documents.map((d) => [d.id, d.priority]));

  // Facts per passage, floored a page at a time; a guideline's facts are all its passages', twins taking the larger.
  const passageFacts = (raw: number) => Math.max(raw, FACTS_PER_PAGE_FLOOR);
  const factsOfDoc = new Map<number, number>();
  for (const [, [doc, raw]] of passages.map) factsOfDoc.set(doc, (factsOfDoc.get(doc) ?? 0) + passageFacts(raw));
  const guidelineFacts = new Map<number, number>();
  for (const [doc, facts] of factsOfDoc) {
    const c = canon(doc);
    guidelineFacts.set(c, Math.max(guidelineFacts.get(c) ?? 0, facts));
  }

  const model: ReadinessModel = { guidelines: [], questions: {}, passages: {}, topicPriority: {} };
  for (const s of leaves) model.topicPriority[s.id] = (s.priority ?? 2) as SectionPriority;
  for (const q of questions) {
    const cited = (q.citation_chunk_ids ?? []).filter((p) => passages.map.has(p));
    model.questions[q.id] = { section_id: q.section_id, difficulty: q.difficulty, passages: cited };
    for (const p of cited) {
      const [doc, raw] = passages.map.get(p)!;
      model.passages[p] = { document_id: canon(doc), facts: passageFacts(raw) };
    }
  }

  // What the bank can test of each guideline: every question answered.
  const capacity = testedFacts(model, new Map(questions.map((q) => [q.id, true])));
  for (const [k, c] of capacity) {
    const [section, doc] = k.split(":").map(Number);
    if (c.tested <= 0) continue;
    const priority = priorityOf.get(doc);
    const g: ReadinessGuideline = {
      section_id: section,
      document_id: doc,
      facts: guidelineFacts.get(doc) ?? FACTS_PER_PAGE_FLOOR,
      priority: (priority === 1 || priority === 2 || priority === 3 ? priority : 2) as SectionPriority,
      capacity: c.tested,
    };
    model.guidelines.push(g);
  }
  return { ...model, factsCounted: passages.counted };
}

export const READINESS_MODEL_TAG = "readiness-model";

/** Cached for six hours; the exam is part of the key. */
export const getReadinessModel = unstable_cache((exam: ExamPart) => buildReadinessModel(exam), ["readiness-model-v2"], {
  revalidate: 21600,
  tags: [READINESS_MODEL_TAG],
});
