import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/all";
import { leafSections } from "@/lib/performance";
import type { ReadinessGuideline, ReadinessModel } from "@/lib/readiness";
import type { ExamPart, Section, SectionPriority } from "@/lib/types";

/**
 * What lib/readiness weighs a candidate against: every guideline behind
 * the exam's approved questions, its length and priority, and each
 * question's topic and guidelines.
 *
 * Read by the server with the service role: the library is not the
 * candidate's to read, and only counts leave this function. About twenty
 * paged reads (the library's chunks are the most of it), so it is cached
 * for six hours: the bank and the library change by the batch, not by
 * the minute.
 *
 * A guideline held twice in the library (the same title under two ids)
 * is counted once, under the first id.
 */
export async function buildReadinessModel(exam: ExamPart): Promise<ReadinessModel> {
  const db = createAdminClient();
  const { data: sectionRows } = await db.from("sections").select("*").eq("exam", exam);
  const leaves = leafSections((sectionRows ?? []) as Section[]);
  const leafIds = leaves.map((s) => s.id);
  if (leafIds.length === 0) return { guidelines: [], questions: {}, topicPriority: {} };

  const [questions, documents, chunks] = await Promise.all([
    fetchAll<{ id: number; section_id: number; source_document_ids: number[] | null }>((from, to) =>
      db
        .from("generated_questions")
        .select("id, section_id, source_document_ids")
        .eq("status", "approved")
        .in("section_id", leafIds)
        .order("id")
        .range(from, to)
    ),
    fetchAll<{ id: number; title: string | null; priority: number | null }>((from, to) =>
      db.from("content_documents").select("id, title, priority").order("id").range(from, to)
    ),
    fetchAll<{ document_id: number }>((from, to) =>
      db.from("content_chunks").select("document_id").order("id").range(from, to)
    ),
  ]);

  const pagesOf = new Map<number, number>();
  for (const c of chunks) pagesOf.set(c.document_id, (pagesOf.get(c.document_id) ?? 0) + 1);

  // One id per title, so a twin is not counted twice.
  const canonical = new Map<number, number>();
  const byTitle = new Map<string, number>();
  const docById = new Map(documents.map((d) => [d.id, d]));
  for (const d of documents) {
    const title = (d.title ?? "").trim().toLowerCase();
    if (!title) continue;
    const first = byTitle.get(title);
    if (first === undefined) byTitle.set(title, d.id);
    else canonical.set(d.id, first);
  }
  const canon = (id: number) => canonical.get(id) ?? id;
  const pages = (id: number) =>
    Math.max(1, ...documents.filter((d) => canon(d.id) === id).map((d) => pagesOf.get(d.id) ?? 0));

  const model: ReadinessModel = { guidelines: [], questions: {}, topicPriority: {} };
  for (const s of leaves) model.topicPriority[s.id] = (s.priority ?? 2) as SectionPriority;

  const pairs = new Map<string, ReadinessGuideline>();
  for (const q of questions) {
    const docs = Array.from(new Set((q.source_document_ids ?? []).map(canon)));
    model.questions[q.id] = { section_id: q.section_id, documents: docs };
    for (const doc of docs) {
      const key = `${q.section_id}:${doc}`;
      const g = pairs.get(key);
      if (g) {
        g.available += 1;
        continue;
      }
      const priority = docById.get(doc)?.priority;
      pairs.set(key, {
        section_id: q.section_id,
        document_id: doc,
        pages: 0,
        priority: (priority === 1 || priority === 2 || priority === 3 ? priority : 2) as SectionPriority,
        available: 1,
      });
    }
  }
  // Pages last, once per guideline: the scan over twins is not repeated per question.
  const pageCache = new Map<number, number>();
  for (const g of pairs.values()) {
    if (!pageCache.has(g.document_id)) pageCache.set(g.document_id, pages(g.document_id));
    g.pages = pageCache.get(g.document_id)!;
  }
  model.guidelines = [...pairs.values()];
  return model;
}

export const READINESS_MODEL_TAG = "readiness-model";

/** Cached for six hours; the arguments are part of the key. */
export const getReadinessModel = unstable_cache(buildReadinessModel, ["readiness-model-v1"], {
  revalidate: 21600,
  tags: [READINESS_MODEL_TAG],
});
