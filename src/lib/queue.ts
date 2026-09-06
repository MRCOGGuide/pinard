import type { QuestionFormat } from "@/lib/types";

/**
 * The generation queue — shapes and rules shared by the worker, the
 * admin page and the enqueue action. No IO, so client components can
 * import it.
 */

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type GenerationJob = {
  id: number;
  section_id: number;
  format: QuestionFormat;
  target: number;
  created: number;
  status: JobStatus;
  empty_runs: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

/** Questions a single worker run attempts before returning. */
export const WORKER_BATCH = 3;

/**
 * How long a worker run may keep starting new questions. A question
 * takes 20–40 seconds, so this starts one, occasionally two, and
 * leaves room for the one in flight to finish and be stored.
 *
 * Deliberately far short of the old 200 seconds. That budget assumed
 * the route's 300-second ceiling was available, which it is on some
 * hosting plans and not on others; where the limit is 60 seconds the
 * function was killed mid-question on every single call, and the queue
 * could never advance on the deployed site at all.
 *
 * Shortening it costs nothing, which is the part worth knowing. The
 * page calls the worker again the moment it returns, so questions per
 * hour is set by how long a question takes, not by how many are packed
 * into one invocation: three questions per 200-second call is about 54
 * an hour, one per 40-second call is about 90. Long invocations bought
 * no throughput and risked the whole run.
 */
export const WORKER_BUDGET_MS = 20_000;

/**
 * Runs that produce nothing before a job gives up. Sections run dry —
 * every examinable point in their passages already asked — and the
 * model reports insufficient_source_material each time. Three is
 * enough to distinguish a dry section from a bad run.
 */
export const MAX_EMPTY_RUNS = 3;

/** Whether a job still wants work. */
export function isActive(status: JobStatus): boolean {
  return status === "queued" || status === "running";
}

export function jobProgress(job: GenerationJob): number {
  if (job.target <= 0) return 0;
  return Math.min(100, Math.round((job.created / job.target) * 100));
}
