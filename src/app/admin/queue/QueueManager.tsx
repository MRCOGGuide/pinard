"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isActive, jobProgress } from "@/lib/queue";
import { EXAM_LABELS, type ExamPart, type QuestionFormat } from "@/lib/types";
import type { JobRow } from "./page";
import {
  cancelJob,
  clearFinishedJobs,
  enqueueCoverageJobs,
  retryJob,
} from "./actions";

/**
 * The generation queue: fill the gaps across a whole exam, then work
 * through them.
 *
 * Running is deliberately a button rather than something that starts
 * on its own. Every question spends API budget, so the owner decides
 * when it runs — but because the queue lives in the database, closing
 * the tab pauses the work rather than losing it.
 */
export function QueueManager({ jobs }: { jobs: JobRow[] }) {
  const router = useRouter();
  const [exam, setExam] = useState<ExamPart>("part2");
  const [format, setFormat] = useState<QuestionFormat>("sba");
  const [target, setTarget] = useState(30);
  const [queueing, setQueueing] = useState(false);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read inside the run loop, which would otherwise close over the
  // value of `running` at the moment it started.
  const stopped = useRef(false);

  const active = jobs.filter((j) => isActive(j.status));
  const outstanding = active.reduce(
    (sum, j) => sum + Math.max(0, j.target - j.created),
    0
  );

  useEffect(() => {
    // Leaving the page stops the loop; the queue keeps its place.
    return () => {
      stopped.current = true;
    };
  }, []);

  async function enqueue() {
    setQueueing(true);
    setError(null);
    setNote(null);
    const result = await enqueueCoverageJobs({ exam, format, target });
    setQueueing(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setNote(
      result.queued === 0
        ? `Nothing to queue — every active sub-topic with sources already has ${target} ${format.toUpperCase()} questions or is queued.`
        : `Queued ${result.queued} sub-topic${result.queued === 1 ? "" : "s"} — ${result.questions} questions to generate. Nothing runs until you press Run.`
    );
    router.refresh();
  }

  async function run() {
    if (running) {
      stopped.current = true;
      setRunning(false);
      return;
    }

    stopped.current = false;
    setRunning(true);
    setError(null);
    setNote("Working through the queue…");

    // Each call generates a few questions and returns. Looping here
    // keeps it going while the page is open; the cron does the same
    // thing once a day when it isn't.
    while (!stopped.current) {
      let payload: {
        error?: string;
        created?: number;
        jobs_remaining?: number;
      } | null = null;
      try {
        const response = await fetch("/api/generate/worker", {
          method: "POST",
        });
        payload = await response.json();
      } catch (e) {
        setError(e instanceof Error ? e.message : "The worker call failed.");
        break;
      }

      if (payload?.error) {
        setError(payload.error);
        break;
      }

      router.refresh();

      if (!payload?.jobs_remaining) {
        setNote("Queue empty — everything queued has been generated.");
        break;
      }
      setNote(
        `${payload.jobs_remaining} job${payload.jobs_remaining === 1 ? "" : "s"} left. Generated ${payload.created ?? 0} just now.`
      );
    }

    stopped.current = true;
    setRunning(false);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-hairline bg-porcelain p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-theatre">
          Fill the gaps
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-graphite/75">
          Queues one job per active sub-topic holding fewer than the target,
          for however many it is short. Sub-topics with no ingested sources are
          skipped, questions already awaiting review count towards the target,
          and a section switched off in Sections is never queued.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-graphite/70">Exam</span>
            <select
              value={exam}
              onChange={(e) => setExam(e.target.value as ExamPart)}
              className="mt-1 rounded-card border border-hairline bg-white px-3 py-2 text-sm"
            >
              {(["part1", "part2", "part3"] as ExamPart[]).map((part) => (
                <option key={part} value={part}>
                  {EXAM_LABELS[part]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-graphite/70">Format</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as QuestionFormat)}
              className="mt-1 rounded-card border border-hairline bg-white px-3 py-2 text-sm"
            >
              <option value="sba">SBA</option>
              <option value="emq">EMQ</option>
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-graphite/70">Questions per sub-topic</span>
            <input
              type="number"
              min={1}
              max={200}
              value={target}
              onChange={(e) =>
                setTarget(Math.min(200, Math.max(1, Number(e.target.value) || 1)))
              }
              className="mt-1 w-28 rounded-card border border-hairline bg-white px-3 py-2 font-mono text-sm"
            />
          </label>

          <button
            type="button"
            onClick={() => void enqueue()}
            disabled={queueing || running}
            className="rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-40"
          >
            {queueing ? "Queueing…" : "Queue the shortfall"}
          </button>
        </div>
      </section>

      <section className="rounded-card border border-hairline bg-porcelain p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-theatre">
              {active.length} job{active.length === 1 ? "" : "s"} outstanding
            </h2>
            <p className="mt-1 font-mono text-xs text-graphite/55">
              {outstanding} question{outstanding === 1 ? "" : "s"} still to
              generate
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void run()}
              disabled={active.length === 0 && !running}
              className={`rounded-card px-5 py-2.5 text-sm font-medium disabled:opacity-40 ${
                running
                  ? "border border-heartbeat/40 bg-heartbeat/10 text-heartbeat"
                  : "bg-theatre text-porcelain hover:bg-greentop"
              }`}
            >
              {running ? "Stop" : "Run the queue"}
            </button>
            <button
              type="button"
              onClick={() =>
                void clearFinishedJobs().then(() => router.refresh())
              }
              disabled={running}
              className="rounded-card border border-hairline bg-porcelain px-4 py-2.5 text-sm font-medium text-graphite/70 hover:text-theatre disabled:opacity-40"
            >
              Clear finished
            </button>
          </div>
        </div>

        {note && <p className="mt-3 text-sm text-graphite/75">{note}</p>}
        {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}
        {running && (
          <p className="mt-3 font-mono text-[11px] text-graphite/50">
            Keep this page open. Closing it pauses the queue — nothing is lost.
          </p>
        )}

        {jobs.length === 0 ? (
          <p className="mt-4 text-sm text-graphite/60">
            No jobs yet. Queue the shortfall above to fill your coverage gaps.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="rounded-card border border-hairline bg-white p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-graphite">{job.section_label}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-graphite/55">
                      {job.format.toUpperCase()} · {job.created} of {job.target} ·{" "}
                      {job.status}
                    </p>
                    {job.last_error && (
                      <p className="mt-1 text-xs text-heartbeat/90">
                        {job.last_error}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isActive(job.status) ? (
                      <button
                        type="button"
                        disabled={running}
                        onClick={() =>
                          void cancelJob(job.id).then(() => router.refresh())
                        }
                        className="rounded px-2 py-1 text-xs font-medium text-graphite/60 hover:text-heartbeat disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    ) : (
                      job.status !== "done" && (
                        <button
                          type="button"
                          disabled={running}
                          onClick={() =>
                            void retryJob(job.id).then(() => router.refresh())
                          }
                          className="rounded px-2 py-1 text-xs font-medium text-graphite/60 hover:text-theatre disabled:opacity-40"
                        >
                          Retry
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div
                  className="mt-2 h-1 w-full overflow-hidden rounded-full bg-sage"
                  role="progressbar"
                  aria-valuenow={jobProgress(job)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${job.section_label} progress`}
                >
                  <div
                    className={`h-full ${job.status === "failed" ? "bg-heartbeat" : "bg-greentop"}`}
                    style={{ width: `${jobProgress(job)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
