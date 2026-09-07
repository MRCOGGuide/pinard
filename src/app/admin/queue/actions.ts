"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TARGETS, capacityAwareSplit } from "./targets";
import type {
  ExamPart,
  QuestionFormat,
  Section,
  SectionPriority,
} from "@/lib/types";

/**
 * Chunks per document, per section.
 *
 * Read a page at a time because the client returns at most a thousand
 * rows and the corpus is sixteen thousand: asking once and counting
 * what came back reports every section as tiny, which is the reverse
 * of the mistake this is here to prevent. Only two integer columns are
 * fetched, so the pages are cheap.
 */
const CHUNK_PAGE = 1000;
async function chunkCountsBySection(
  supabase: ReturnType<typeof createAdminClient>,
  citable: (documentId: number) => boolean
): Promise<Map<number, Map<number, number>>> {
  const bySection = new Map<number, Map<number, number>>();
  for (let from = 0; ; from += CHUNK_PAGE) {
    const { data, error } = await supabase
      .from("content_chunks")
      .select("section_id, document_id")
      .range(from, from + CHUNK_PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data as { section_id: number; document_id: number }[]) {
      if (!citable(row.document_id)) continue;
      const docs = bySection.get(row.section_id) ?? new Map<number, number>();
      docs.set(row.document_id, (docs.get(row.document_id) ?? 0) + 1);
      bySection.set(row.section_id, docs);
    }
    if (data.length < CHUNK_PAGE) break;
  }
  return bySection;
}

/** Chunks per document, paged past the client's thousand-row limit. */
async function chunkCountsByDocument(
  supabase: ReturnType<typeof createAdminClient>
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  for (let from = 0; ; from += CHUNK_PAGE) {
    const { data, error } = await supabase
      .from("content_chunks")
      .select("document_id")
      .range(from, from + CHUNK_PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data as { document_id: number }[]) {
      counts.set(row.document_id, (counts.get(row.document_id) ?? 0) + 1);
    }
    if (data.length < CHUNK_PAGE) break;
  }
  return counts;
}

export type EnqueueResult = {
  error?: string;
  queued?: number;
  questions?: number;
  /** Already at target, or already queued. */
  skipped?: number;
  /** How many sections were queued in each tier. */
  byPriority?: Record<SectionPriority, number>;
};

/**
 * Fill the gaps: one job per sub-topic that holds fewer questions than
 * its tier calls for, for however many it is short.
 *
 * The bank is built in the same proportion the plan revises in. A core
 * clinical topic earns a bank a candidate cannot exhaust; background
 * material earns enough to be met occasionally, which is how often the
 * plan serves it.
 *
 * Sub-topics only. Study plans and sessions serve questions from
 * sub-topics, so anything queued against a parent would generate
 * questions no candidate is ever shown.
 */
export async function enqueueCoverageJobs(input: {
  exam: ExamPart;
  /** Omit, or pass "both", to queue each section in both formats. */
  format?: QuestionFormat | "both";
  targets: Record<SectionPriority, number>;
}): Promise<EnqueueResult> {
  await requireAdmin();

  const clamp = (n: number) => Math.min(Math.max(Math.round(n) || 0, 0), 200);
  const targets: Record<SectionPriority, number> = {
    1: clamp(input.targets?.[1] ?? DEFAULT_TARGETS[1]),
    2: clamp(input.targets?.[2] ?? DEFAULT_TARGETS[2]),
    3: clamp(input.targets?.[3] ?? DEFAULT_TARGETS[3]),
  };
  // A section's target is the total across both formats, and the
  // default queues both: the paper is 50 SBAs and 50 EMQs, so a bank
  // that is not is a bank that practises the wrong thing.
  const formats: QuestionFormat[] =
    input.format === "sba" || input.format === "emq"
      ? [input.format]
      : ["sba", "emq"];
  const supabase = createAdminClient();

  const [{ data: sectionRows }, { data: questionRows }, { data: documentRows }, { data: jobRows }] =
    await Promise.all([
      supabase.from("sections").select("*").order("sort_order"),
      // Pending counts as coverage: it is already written and waiting
      // on review, so generating more of it only lengthens the queue.
      supabase
        .from("generated_questions")
        .select("section_id, format")
        .in("status", ["approved", "pending"]),
      supabase
        .from("content_documents")
        .select("id, section_id, priority, tog_category")
        .eq("status", "ingested"),
      supabase
        .from("generation_jobs")
        .select("section_id, format, status")
        .in("status", ["queued", "running"]),
    ]);

  // Generation skips CPD material and background documents (priority 3)
  // as never citable, so capacity must skip them too — counting them
  // promises questions no grounding check would ever pass.
  const notCitable = new Set(
    (documentRows ?? [])
      .filter(
        (d) =>
          (d as { priority: number | null }).priority === 3 ||
          (d as { tog_category: string | null }).tog_category === "cpd"
      )
      .map((d) => (d as { id: number }).id)
  );
  const chunkCounts = await chunkCountsBySection(
    supabase,
    (id) => !notCitable.has(id)
  );

  const sections = (sectionRows ?? []) as Section[];
  const parents = new Map(
    sections.filter((s) => s.parent_id === null).map((s) => [s.id, s])
  );

  // Only sub-topics of the chosen exam, and only ones with material
  // generation can actually cite. A section whose documents are all
  // background reads as well-sourced and generates nothing: Patient
  // Information Leaflets has 69 ingested documents and 309 chunks, and
  // every job queued against it failed for want of a citable passage.
  const withSources = new Set(
    Array.from(chunkCounts.entries())
      .filter(([, docs]) => docs.size > 0)
      .map(([sectionId]) => sectionId)
  );
  const inExam = sections.filter(
    (s) =>
      s.parent_id !== null &&
      s.is_active &&
      parents.get(s.parent_id)?.exam === input.exam &&
      withSources.has(s.id)
  );

  // Every section is queued; how deep a bank it gets is its tier's
  // business, and a tier set to 0 is simply never queued.
  const candidates = inExam;
  const byPriority: Record<SectionPriority, number> = { 1: 0, 2: 0, 3: 0 };

  // Held per format: a section can be full of SBAs and short of EMQs.
  const have = new Map<string, number>();
  for (const q of (questionRows ?? []) as {
    section_id: number;
    format: QuestionFormat;
  }[]) {
    const k = `${q.section_id}:${q.format}`;
    have.set(k, (have.get(k) ?? 0) + 1);
  }

  const alreadyQueued = new Set(
    (jobRows ?? []).map((j) => `${j.section_id}:${j.format}`)
  );

  const jobs: {
    section_id: number;
    format: QuestionFormat;
    target: number;
  }[] = [];
  let skipped = 0;

  for (const section of candidates) {
    const priority = (section.priority ?? 2) as SectionPriority;
    const documents = chunkCounts.get(section.id) ?? new Map<number, number>();

    // What the plan would like, reduced to what the passages hold —
    // and with the EMQ share the sources cannot carry handed to SBA
    // rather than dropped, so no material goes unexamined.
    const split = capacityAwareSplit({
      target: targets[priority],
      documentChunkCounts: Array.from(documents.values()),
    });
    // A section counts toward its tier once, however many formats it is
    // short in — the tally is of sub-topics, not of jobs.
    let queuedHere = false;

    for (const format of formats) {
      if (alreadyQueued.has(`${section.id}:${format}`)) {
        skipped++;
        continue;
      }
      const want = format === "sba" ? split.sba : split.emq;
      const shortfall = want - (have.get(`${section.id}:${format}`) ?? 0);
      if (shortfall <= 0) {
        skipped++;
        continue;
      }
      jobs.push({ section_id: section.id, format, target: shortfall });
      queuedHere = true;
    }

    if (queuedHere) byPriority[priority]++;
  }

  if (jobs.length === 0) {
    return { queued: 0, questions: 0, skipped, byPriority };
  }

  const { error } = await supabase.from("generation_jobs").insert(jobs);
  if (error) return { error: error.message };

  revalidatePath("/admin/queue");
  return {
    queued: jobs.length,
    questions: jobs.reduce((sum, j) => sum + j.target, 0),
    skipped,
    byPriority,
  };
}

/** Stop a job. Whatever it already generated stays in the review queue. */
export async function cancelJob(id: number): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("generation_jobs")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/queue");
  return {};
}

/** Put a failed or cancelled job back in the queue. */
export async function retryJob(id: number): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("generation_jobs")
    .update({
      status: "queued",
      empty_runs: 0,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/queue");
  return {};
}

/** Clear finished jobs out of the list. */
export async function clearFinishedJobs(): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("generation_jobs")
    .delete()
    .in("status", ["done", "failed", "cancelled"]);
  if (error) return { error: error.message };
  revalidatePath("/admin/queue");
  return {};
}

/**
 * One job per TOG article, most recent issue first.
 *
 * TOG is heavily examined and the bank had one question from it. The
 * cause was structural rather than editorial: TOG Articles is a
 * top-level section rather than a sub-topic, and "fill the gaps"
 * queues sub-topics only, so 5324 chunks across 342 citable articles
 * were never queued at all. 340 of those articles had produced nothing.
 *
 * A section-wide job would not have fixed it either. Each article is a
 * separate paper on its own subject, so a target spread across the
 * section by passage sampling leaves most articles untouched however
 * large the target. The job therefore names the article.
 *
 * Newest first, because that is how TOG is examined and how it dates:
 * jobs are taken in id order, so inserting in recency order is what
 * sets the order they run in. An article already queued, or already
 * carrying its quota, is skipped — this can be run again as new issues
 * are ingested and it will pick up only what is new.
 */
export type TogEnqueueResult = {
  error?: string;
  queued?: number;
  questions?: number;
  skipped?: number;
  /** Oldest issue reached, so the owner can see how far back it goes. */
  oldest?: string;
};

/** Questions asked of one article. Short papers earn one, not two. */
const TOG_PER_ARTICLE = 2;
const TOG_PER_SHORT_ARTICLE = 1;
/** Chunks below which an article is a summary rather than a paper. */
const TOG_SHORT_CHUNKS = 8;

export async function enqueueTogJobs(input: {
  /** Only issues from this year onwards. Omit for all of them. */
  fromYear?: number;
  /** Stop after this many articles, newest first. */
  limit?: number;
}): Promise<TogEnqueueResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Not authorised" };

  const supabase = createAdminClient();

  const { data: documentRows, error: docError } = await supabase
    .from("content_documents")
    .select("id, section_id, priority, tog_year, tog_issue, tog_category, title")
    .eq("status", "ingested")
    .not("tog_year", "is", null);
  if (docError) return { error: `could not read the sources: ${docError.message}` };

  // The same exclusions generation applies: CPD questions are not
  // citable facts, and background material — Spotlight editorials,
  // letters, corrections — states none.
  const articles = (documentRows ?? []).filter(
    (d) =>
      (d as { priority: number | null }).priority !== 3 &&
      (d as { tog_category: string | null }).tog_category !== "cpd" &&
      (input.fromYear === undefined ||
        ((d as { tog_year: number }).tog_year ?? 0) >= input.fromYear)
  ) as {
    id: number;
    section_id: number;
    tog_year: number;
    tog_issue: number | null;
    title: string;
  }[];

  // Most recent issue first; that is the order they will generate in.
  articles.sort(
    (a, b) => b.tog_year - a.tog_year || (b.tog_issue ?? 0) - (a.tog_issue ?? 0)
  );

  const chunkCounts = await chunkCountsByDocument(supabase);

  const [{ data: existingJobs }, { data: questionRows }] = await Promise.all([
    supabase
      .from("generation_jobs")
      .select("document_id")
      .not("document_id", "is", null)
      .in("status", ["queued", "running"]),
    supabase
      .from("generated_questions")
      .select("source_document_ids")
      .in("status", ["approved", "pending"]),
  ]);
  const queuedAlready = new Set(
    (existingJobs ?? []).map((j) => (j as { document_id: number }).document_id)
  );
  const have = new Map<number, number>();
  for (const q of questionRows ?? []) {
    for (const id of (q as { source_document_ids: number[] | null })
      .source_document_ids ?? []) {
      have.set(id, (have.get(id) ?? 0) + 1);
    }
  }

  const jobs: {
    section_id: number;
    document_id: number;
    format: QuestionFormat;
    target: number;
  }[] = [];
  let skipped = 0;
  let oldest: string | null = null;

  for (const article of articles) {
    if (input.limit !== undefined && jobs.length >= input.limit) break;
    const chunks = chunkCounts.get(article.id) ?? 0;
    if (chunks === 0) {
      skipped++;
      continue;
    }
    if (queuedAlready.has(article.id)) {
      skipped++;
      continue;
    }
    const want =
      chunks < TOG_SHORT_CHUNKS ? TOG_PER_SHORT_ARTICLE : TOG_PER_ARTICLE;
    const shortfall = want - (have.get(article.id) ?? 0);
    if (shortfall <= 0) {
      skipped++;
      continue;
    }
    // SBA rather than EMQ. A set needs one document able to carry
    // several distinct scenarios on a shared theme, and the median TOG
    // article is 15 chunks — enough for a question or two, not for a
    // set. Asking for one wastes the call to be told so.
    jobs.push({
      section_id: article.section_id,
      document_id: article.id,
      format: "sba",
      target: shortfall,
    });
    oldest = `${article.tog_year}${article.tog_issue ? ` issue ${article.tog_issue}` : ""}`;
  }

  if (jobs.length === 0) {
    return { queued: 0, questions: 0, skipped };
  }

  const { error } = await supabase.from("generation_jobs").insert(
    jobs.map((j) => ({
      section_id: j.section_id,
      document_id: j.document_id,
      format: j.format,
      target: j.target,
      created: 0,
      empty_runs: 0,
      status: "queued" as const,
    }))
  );
  if (error) return { error: `could not queue the articles: ${error.message}` };

  revalidatePath("/admin/queue");
  return {
    queued: jobs.length,
    questions: jobs.reduce((sum, j) => sum + j.target, 0),
    skipped,
    oldest: oldest ?? undefined,
  };
}
