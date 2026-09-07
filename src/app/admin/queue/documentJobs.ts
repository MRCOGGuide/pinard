import type { createAdminClient } from "@/lib/supabase/admin";
import type { QuestionFormat } from "@/lib/types";

/**
 * Choosing which documents get a job of their own.
 *
 * A plain module rather than part of actions.ts, because a "use server"
 * file may export only async functions — and because the queue is
 * filled from two places. The admin page presses a button; filling
 * several hundred jobs for the first time is better done from a script
 * that can be watched. Both must make the same choices, so they share
 * this.
 */

export type DocumentJob = {
  section_id: number;
  document_id: number;
  format: QuestionFormat;
  target: number;
};

type Client = ReturnType<typeof createAdminClient>;

/** Questions asked of a full paper, and of a short one. */
export const PER_DOCUMENT = 2;
export const PER_SHORT_DOCUMENT = 1;
/** Chunks below which a document is a summary rather than a paper. */
export const SHORT_DOCUMENT_CHUNKS = 8;

/**
 * How many recent years of TOG are examined at full depth.
 *
 * Recent issues are what candidates are asked about, so those years
 * take everything TOG prints — the editorials and correspondence as
 * well as the papers. Further back only the papers are worth a
 * question, and a Spotlight piece from 2017 is an annotated contents
 * page for a journal nobody is revising from any more.
 */
export const TOG_FULL_DEPTH_YEARS = 5;

/** Chunks per document, paged past the client's thousand-row limit. */
export async function chunkCountsByDocument(
  supabase: Client
): Promise<Map<number, number>> {
  const PAGE = 1000;
  const counts = new Map<number, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("content_chunks")
      .select("document_id")
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data as { document_id: number }[]) {
      counts.set(row.document_id, (counts.get(row.document_id) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
  }
  return counts;
}

/** Documents already holding a job, and questions already written. */
async function existingCoverage(supabase: Client) {
  const [{ data: jobs }, { data: questions }] = await Promise.all([
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
  const queued = new Set(
    (jobs ?? []).map((j) => (j as { document_id: number }).document_id)
  );
  const have = new Map<number, number>();
  for (const q of questions ?? []) {
    for (const id of (q as { source_document_ids: number[] | null })
      .source_document_ids ?? []) {
      have.set(id, (have.get(id) ?? 0) + 1);
    }
  }
  return { queued, have };
}

function targetFor(chunks: number): number {
  return chunks < SHORT_DOCUMENT_CHUNKS ? PER_SHORT_DOCUMENT : PER_DOCUMENT;
}

export type Selection = {
  jobs: DocumentJob[];
  /**
   * Why a document was passed over, kept apart rather than summed.
   *
   * "Already have their quota or are queued" reads, to someone who has
   * just pressed the button and seen nothing happen, as though there
   * were nothing to do — when the truth may be that several hundred
   * jobs are queued and waiting for Run. They are opposite situations
   * and the note has to be able to tell them apart.
   */
  alreadyQueued: number;
  alreadyCovered: number;
  noChunks: number;
  /** Oldest issue or document reached, for the note shown afterwards. */
  oldest?: string;
};

/**
 * One job per TOG document, most recent issue first.
 *
 * The order matters and is the only thing that sets it: the worker
 * takes jobs in id order, so inserting newest-first is what makes 2026
 * generate before 2016.
 *
 * CPD questions are never queued. They are not a source — they are the
 * issue's own exam questions, and generation already feeds them in as
 * a guide to what that issue was asking about, so a question written
 * from the same article aims where the journal aimed.
 */
export async function selectTogJobs(
  supabase: Client,
  options: { fromYear?: number; limit?: number } = {}
): Promise<Selection> {
  const { data: documents } = await supabase
    .from("content_documents")
    .select("id, section_id, priority, tog_year, tog_issue, tog_category, title")
    .eq("status", "ingested")
    .not("tog_year", "is", null);

  const all = (documents ?? []) as {
    id: number;
    section_id: number;
    priority: number | null;
    tog_year: number;
    tog_issue: number | null;
    tog_category: string | null;
    title: string;
  }[];

  const years = Array.from(new Set(all.map((d) => d.tog_year))).sort(
    (a, b) => b - a
  );
  const fullDepthFrom = years[TOG_FULL_DEPTH_YEARS - 1] ?? years[years.length - 1];

  const wanted = all
    .filter((d) => {
      if (d.tog_category === "cpd") return false;
      if (options.fromYear !== undefined && d.tog_year < options.fromYear) {
        return false;
      }
      // Recent years take everything the journal printed; older years
      // only the papers.
      if (d.tog_year >= fullDepthFrom) return true;
      return d.priority !== 3;
    })
    .sort(
      (a, b) =>
        b.tog_year - a.tog_year || (b.tog_issue ?? 0) - (a.tog_issue ?? 0)
    );

  const counts = await chunkCountsByDocument(supabase);
  const { queued, have } = await existingCoverage(supabase);

  const jobs: DocumentJob[] = [];
  let alreadyQueued = 0;
  let alreadyCovered = 0;
  let noChunks = 0;
  let oldest: string | undefined;

  for (const doc of wanted) {
    if (options.limit !== undefined && jobs.length >= options.limit) break;
    const chunks = counts.get(doc.id) ?? 0;
    if (chunks === 0) {
      noChunks++;
      continue;
    }
    if (queued.has(doc.id)) {
      alreadyQueued++;
      continue;
    }
    const shortfall = targetFor(chunks) - (have.get(doc.id) ?? 0);
    if (shortfall <= 0) {
      alreadyCovered++;
      continue;
    }
    // SBA rather than EMQ: a set needs one document able to carry
    // several distinct scenarios on a shared theme, and the median
    // article is 15 chunks — a question or two, not a set.
    jobs.push({
      section_id: doc.section_id,
      document_id: doc.id,
      format: "sba",
      target: shortfall,
    });
    oldest = `${doc.tog_year}${doc.tog_issue ? ` issue ${doc.tog_issue}` : ""}`;
  }

  return { jobs, alreadyQueued, alreadyCovered, noChunks, oldest };
}

/**
 * One job per patient information leaflet.
 *
 * Leaflets are tagged as background material, which keeps them out of
 * section-wide generation: a section drawing on everything it holds
 * should reach for the guideline, not the leaflet summarising it. Named
 * directly, though, they are worth a question or two each — what a
 * woman is actually told about a procedure, its risks and its
 * alternatives is examinable, and the leaflet is where the RCOG says
 * it. A job that names a document generates from that document alone,
 * so the background rule does not apply to a document we chose on
 * purpose.
 */
export async function selectLeafletJobs(
  supabase: Client,
  options: { sectionId?: number; limit?: number } = {}
): Promise<Selection> {
  let query = supabase
    .from("content_documents")
    .select("id, section_id, title, priority, tog_year")
    .eq("status", "ingested")
    .is("tog_year", null);
  if (options.sectionId !== undefined) {
    query = query.eq("section_id", options.sectionId);
  }
  const { data: documents } = await query;

  const leaflets = ((documents ?? []) as {
    id: number;
    section_id: number;
    title: string;
    priority: number | null;
  }[])
    .filter((d) => d.priority === 3)
    .sort((a, b) => a.title.localeCompare(b.title, "en"));

  const counts = await chunkCountsByDocument(supabase);
  const { queued, have } = await existingCoverage(supabase);

  const jobs: DocumentJob[] = [];
  let alreadyQueued = 0;
  let alreadyCovered = 0;
  let noChunks = 0;
  let oldest: string | undefined;

  for (const doc of leaflets) {
    if (options.limit !== undefined && jobs.length >= options.limit) break;
    const chunks = counts.get(doc.id) ?? 0;
    if (chunks === 0) {
      noChunks++;
      continue;
    }
    if (queued.has(doc.id)) {
      alreadyQueued++;
      continue;
    }
    const shortfall = targetFor(chunks) - (have.get(doc.id) ?? 0);
    if (shortfall <= 0) {
      alreadyCovered++;
      continue;
    }
    jobs.push({
      section_id: doc.section_id,
      document_id: doc.id,
      format: "sba",
      target: shortfall,
    });
    oldest = doc.title;
  }

  return { jobs, alreadyQueued, alreadyCovered, noChunks, oldest };
}

/** Write the chosen jobs, in the order given. */
export async function insertDocumentJobs(
  supabase: Client,
  jobs: DocumentJob[]
): Promise<{ error?: string }> {
  if (jobs.length === 0) return {};
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
  return error ? { error: error.message } : {};
}
