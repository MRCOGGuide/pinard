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
 * takes 20–40 seconds, and the route allows 300, so this leaves room
 * for the one in flight to finish and be stored.
 */
export const WORKER_BUDGET_MS = 200_000;

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
