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
  /**
   * Generate from this document alone rather than from the whole
   * section. Null for an ordinary section job; set for TOG, where each
   * article is its own subject and a section-wide job leaves nearly all
   * of them unexamined.
   */
  document_id: number | null;
  format: QuestionFormat;
  target: number;
  created: number;
  status: JobStatus;
  empty_runs: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * The model's limits (owner, 6 November 2026: "Queue the job and restart it
 * when reset hits"). A job that meets one is not failed: the queue waits and
 * tries again. The daily limit is a rolling 24 hours with no reset time to
 * read, so the only way to know it has eased is to try, and a refused try
 * costs nothing.
 */
export type ModelLimit = "daily" | "brief";

export const WAITING_DAILY = "waiting for the model's daily limit";
export const WAITING_BRIEF = "waiting for the model's rate limit";
const WAIT_DAILY_MS = 30 * 60 * 1000;
const WAIT_BRIEF_MS = 3 * 60 * 1000;

export function limitIn(reason: string): ModelLimit | null {
  if (/too many tokens/i.test(reason)) return "daily";
  return /\b429\b|too many requests/i.test(reason) ? "brief" : null;
}

export const waitingMessage = (limit: ModelLimit) => (limit === "daily" ? WAITING_DAILY : WAITING_BRIEF);

/** Is this job still sitting out a limit it met? */
export function stillWaiting(job: { last_error: string | null; updated_at: string }, now = Date.now()): boolean {
  const wait = job.last_error === WAITING_DAILY ? WAIT_DAILY_MS : job.last_error === WAITING_BRIEF ? WAIT_BRIEF_MS : 0;
  return now - Date.parse(job.updated_at) < wait;
}

/** The most one press of Generate on a source can ask for. */
export const MAX_SOURCE_SBAS = 20;
export const MAX_SOURCE_EMQ_SETS = 5;

/**
 * Long runs one press starts at once. A source's jobs run one at a time, so
 * these are for what else is waiting, and the scheduler carries on the rest.
 */
export const RUNS_PER_PRESS = 4;
const SBAS_PER_JOB = 5;

/**
 * The jobs one press makes. SBAs are split, so that a job that gives up
 * leaves the rest to try. A set is a job of its own, as a job counts
 * scenarios and a set has three or four: no single target asks for exactly
 * this many sets.
 */
export function sourceJobs(sba: number, sets: number): { format: "sba" | "emq"; target: number }[] {
  const jobs: { format: "sba" | "emq"; target: number }[] = [];
  for (let left = sba; left > 0; left -= SBAS_PER_JOB) jobs.push({ format: "sba", target: Math.min(left, SBAS_PER_JOB) });
  for (let i = 0; i < sets; i++) jobs.push({ format: "emq", target: 1 });
  return jobs;
}

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
 * When the request itself must have answered, measured from its start.
 *
 * The budget above decides whether to START more work; this bounds the
 * model calls already in flight, which is a different job. Sizing the
 * work was tried first and does not hold: four runs of the same
 * three-scenario EMQ section took 33.7s, 53.8s, 65.4s and 98.5s, so
 * the variance is in how long the model takes to reply rather than in
 * how much it was asked for, and no set is small enough to be safe.
 *
 * Eight seconds under the route's 60 leaves room to store what was made,
 * update the job and serialise a reply. Overrunning costs far more
 * than a slow call does: the request is killed, the answer is an HTML
 * 504, nothing is recorded, and every scenario already verified in
 * that run is lost.
 */
export const WORKER_HARD_MS = 52_000;

/**
 * The same two limits for a long run: one a press on Sources or the
 * background workflow starts, with nobody waiting on its answer. An EMQ
 * set often needs more than the 40 seconds a short run can give it, and
 * sets from a source timed out on all three tries there (owner, 5 November
 * 2026). The route is allowed 300 seconds.
 */
export const LONG_BUDGET_MS = 200_000;
export const LONG_HARD_MS = 270_000;

/** A running job that has said nothing for this long was cut off, and is taken up again. */
export const STALE_RUN_MS = 5 * 60 * 1000;

/**
 * Runs that produce nothing before a job gives up. Sections run dry —
 * every examinable point in their passages already asked — and the
 * model reports insufficient_source_material each time. Three is
 * enough to distinguish a dry section from a bad run.
 */
export const MAX_EMPTY_RUNS = 3;

/**
 * The same for a job on one source chosen by hand. The owner has asked
 * for these questions and is not told when a job gives up, and each run
 * reads a different stretch of the document, so one more is worth having.
 * Eight was tried: a set that cannot be made then costs 24 attempts.
 */
export const MAX_EMPTY_RUNS_ONE_SOURCE = 4;

/** Whether a job still wants work. */
export function isActive(status: JobStatus): boolean {
  return status === "queued" || status === "running";
}

export function jobProgress(job: GenerationJob): number {
  if (job.target <= 0) return 0;
  return Math.min(100, Math.round((job.created / job.target) * 100));
}
