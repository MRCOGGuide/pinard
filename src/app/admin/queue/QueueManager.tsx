"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isActive, jobProgress } from "@/lib/queue";
import {
  EXAM_LABELS,
  type ExamPart,
  type QuestionFormat,
  type SectionPriority,
} from "@/lib/types";
import type { JobRow } from "./page";
import {
  cancelJob,
  clearFinishedJobs,
  enqueueCoverageJobs,
  enqueueLeafletJobs,
  enqueueTogJobs,
  retryJob,
} from "./actions";
import { DEFAULT_TARGETS } from "./targets";

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
  // Both by default: the paper is 50 SBAs and 50 EMQs, and a target is
  // the total across the two.
  const [format, setFormat] = useState<QuestionFormat | "both">("both");
  const [targets, setTargets] = useState<Record<SectionPriority, number>>(
    DEFAULT_TARGETS
  );
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

  /**
   * What to say when nothing new was queued.
   *
   * "382 already have their quota or are queued" was true and told the
   * owner nothing: it reads as "there is no work" at the exact moment
   * several hundred jobs are sitting in the queue waiting for Run. The
   * two reasons are opposite and are now separated.
   */
  function nothingQueued(
    what: string,
    result: { alreadyQueued?: number; alreadyCovered?: number }
  ) {
    const waiting = result.alreadyQueued ?? 0;
    const covered = result.alreadyCovered ?? 0;
    if (waiting > 0 && covered > 0) {
      return `Nothing new to queue: ${waiting} ${what} are already queued and waiting for Run, and ${covered} already hold their questions.`;
    }
    if (waiting > 0) {
      return `Nothing new to queue — all ${waiting} ${what} are already in the queue, waiting for Run.`;
    }
    if (covered > 0) {
      return `Nothing to queue: all ${covered} ${what} already hold their questions.`;
    }
    return `Nothing to queue — no ${what} with ingested passages were found.`;
  }

  async function enqueueTog(format: "sba" | "emq" = "sba") {
    setQueueing(true);
    setError(null);
    setNote(null);
    const result = await enqueueTogJobs({ format });
    setQueueing(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNote(
      result.queued === 0
        ? nothingQueued(format === "emq" ? "TOG documents long enough for a set" : "TOG documents", result)
        : `Queued ${result.queued} TOG document${result.queued === 1 ? "" : "s"} — ${result.questions} questions, newest issue first, back to ${result.oldest}. Nothing runs until you press Run.`
    );
    router.refresh();
  }

  async function enqueueLeaflets() {
    setQueueing(true);
    setError(null);
    setNote(null);
    const result = await enqueueLeafletJobs({});
    setQueueing(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNote(
      result.queued === 0
        ? nothingQueued("leaflets", result)
        : `Queued ${result.queued} leaflet${result.queued === 1 ? "" : "s"} — ${result.questions} questions. Nothing runs until you press Run.`
    );
    router.refresh();
  }

  async function enqueue() {
    setQueueing(true);
    setError(null);
    setNote(null);
    const result = await enqueueCoverageJobs({ exam, format, targets });
    setQueueing(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    const tiers = result.byPriority;
    const split = tiers
      ? ` ${tiers[1]} core, ${tiers[2]} supporting, ${tiers[3]} background.`
      : "";
    setNote(
      result.queued === 0
        ? `Nothing to queue — every sub-topic with sources already holds what its tier asks for, or is queued.`
        : `Queued ${result.queued} sub-topic${result.queued === 1 ? "" : "s"} — ${result.questions} questions to generate.${split} Nothing runs until you press Run.`
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
    //
    // A dropped call used to end the run. Over a queue of several
    // hundred questions that is hours of work abandoned because a
    // laptop slept, a deploy restarted the server, or the wifi blinked
    // — and the run stopped quietly, with the page still showing where
    // it had got to. Transient failures are now retried; only a
    // refusal from the worker itself stops the run.
    //
    // Retried for as long as the run is active, rather than a fixed
    // five times. Five attempts backing off two seconds at a time gave
    // up after thirty seconds, and the things that actually interrupt a
    // run last far longer than that: a dev server stopped by the editor
    // stays down until somebody restarts it, a deploy takes minutes, a
    // sleeping laptop takes as long as it takes. Thirty seconds of
    // patience meant the queue could not be left alone, which is the
    // whole point of a queue. So it waits, says so, and picks up by
    // itself when the server answers again. Stop still stops it.
    const RETRY_CEILING_MS = 30_000;
    let retries = 0;
    let downSince = 0;

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
        // An expired session is not transient: retrying it forever
        // would spin silently until someone noticed nothing was being
        // made. Say what to do instead.
        if (response.status === 401 || response.status === 403) {
          setError(
            "Your admin session has expired. Sign in again, then press Run — nothing already generated is lost."
          );
          break;
        }
        // A failing server does not return JSON. A platform timeout is
        // an HTML 504, and parsing that throws exactly the way a lost
        // network does — which is how a function being killed came to
        // be reported as "connection lost", sending everyone to look at
        // the wifi while the server was fine and the run was dying at
        // the same point every time. So the status is read first, and
        // said out loud.
        if (!response.ok) {
          const detail =
            response.status === 504 || response.status === 502
              ? "the worker ran past the time the host allows and was cut off"
              : `the worker answered ${response.status}`;
          retries++;
          if (downSince === 0) downSince = Date.now();
          setNote(
            `${detail}. Retrying — ${retries} attempt${retries === 1 ? "" : "s"} so far.`
          );
          await new Promise((r) =>
            setTimeout(r, Math.min(RETRY_CEILING_MS, 2000 * retries))
          );
          continue;
        }
        payload = await response.json();
        retries = 0;
        downSince = 0;
      } catch {
        retries++;
        if (downSince === 0) downSince = Date.now();
        const wait = Math.min(RETRY_CEILING_MS, 2000 * retries);
        const downFor = Math.round((Date.now() - downSince) / 1000);
        setNote(
          downFor < 60
            ? `No answer from the server, ${downFor}s ago — still trying. The run carries on by itself when it is back.`
            : `No answer from the server, ${Math.round(downFor / 60)} min ago — still trying. The run carries on by itself when it is back.`
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
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

    // Distinguish "I pressed stop" from "the tab was closed and this
    // never ran again", which looked identical before.
    if (stopped.current) setNote("Stopped. Press Run to carry on.");

    stopped.current = true;
    setRunning(false);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-ink-strong">
          Fill the gaps
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink/75">
          Queues one job per sub-topic holding fewer questions than its tier
          asks for, for however many it is short. A target is the total across
          both formats and is split half SBA, half EMQ — the paper is 50 of
          each. Every section is examined; the tier decides how deep a bank it
          earns, set in Sections. Sub-topics with no ingested sources are
          skipped, questions awaiting review count towards the target, and a
          tier set to 0 is left alone.
          <br />
          <br />
          A target is then reduced to what the section&rsquo;s passages can
          actually answer, so a thin section is not asked for questions that
          do not exist in it. Where the sources cannot carry the EMQ half —
          which needs one document long enough to give a whole set a shared
          topic — that share becomes SBAs rather than being dropped, so the
          material is still examined and candidates miss none of it.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-ink/70">Exam</span>
            <select
              value={exam}
              onChange={(e) => setExam(e.target.value as ExamPart)}
              className="mt-1 rounded-card border border-line bg-raised px-3 py-2 text-sm"
            >
              {(["part1", "part2", "part3"] as ExamPart[]).map((part) => (
                <option key={part} value={part}>
                  {EXAM_LABELS[part]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-ink/70">Format</span>
            <select
              value={format}
              onChange={(e) =>
                setFormat(e.target.value as QuestionFormat | "both")
              }
              className="mt-1 rounded-card border border-line bg-raised px-3 py-2 text-sm"
            >
              <option value="both">Both — half each</option>
              <option value="sba">SBA only</option>
              <option value="emq">EMQ only</option>
            </select>
          </label>

          {/* One target per tier, because that is the decision being
              made: how deep a bank each kind of topic deserves. The
              number is the total across both formats and is split in
              half between them. Set a tier to 0 and it is left alone
              entirely. */}
          {(
            [
              [1, "Core", "text-good", "border-good/50"],
              [2, "Supporting", "text-warn", "border-warn/50"],
              [3, "Background", "text-accent", "border-accent/40"],
            ] as [SectionPriority, string, string, string][]
          ).map(([tier, label, ink, edge]) => (
            <label key={tier} className="text-sm">
              <span className={`block font-medium ${ink}`}>{label}</span>
              <input
                type="number"
                min={0}
                max={200}
                value={targets[tier]}
                onChange={(e) =>
                  setTargets((t) => ({
                    ...t,
                    [tier]: Math.min(
                      200,
                      Math.max(0, Number(e.target.value) || 0)
                    ),
                  }))
                }
                className={`mt-1 w-24 rounded-card border bg-raised px-3 py-2 font-mono text-sm ${edge}`}
              />
            </label>
          ))}

          <button
            type="button"
            onClick={() => void enqueue()}
            disabled={queueing || running}
            className="rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good disabled:opacity-40"
          >
            {queueing ? "Queueing…" : "Queue the shortfall"}
          </button>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-ink-strong">
          TOG articles
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink/75">
          One job per TOG article rather than one for the section, newest
          issue first and working back. TOG is examined heavily and each
          article is its own paper, so a single section-wide job spreads its
          target across hundreds of them and leaves almost every one
          unexamined. Short pieces earn one question, full papers two.
          The most recent five years take everything the journal printed,
          editorials and correspondence included; further back, only the
          papers. The CPD questions are never a source — they are the issue&rsquo;s
          own exam questions, and generation already reads them as a guide to
          what that issue was asking about. Run it again when new issues are
          ingested and it picks up only what is new. A set is a separate
          button because it asks far more of one paper: it is built from a
          contiguous window of a single article, so only those long enough
          are offered one.
        </p>
        <button
          type="button"
          onClick={() => void enqueueTog()}
          disabled={queueing || running}
          className="mt-4 rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good disabled:opacity-40"
        >
          {queueing ? "Queueing…" : "Queue TOG articles"}
        </button>
        <button
          type="button"
          onClick={() => void enqueueTog("emq")}
          disabled={queueing || running}
          className="ml-3 mt-4 rounded-card border border-line bg-raised px-5 py-2.5 text-sm font-medium text-ink-strong hover:bg-sunk disabled:opacity-40"
        >
          {queueing ? "Queueing…" : "Queue a set per article"}
        </button>
      </section>

      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-ink-strong">
          Patient information leaflets
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink/75">
          One or two questions per leaflet. Leaflets are background material
          for section-wide generation — a section drawing on everything it
          holds should reach for the guideline, not the leaflet summarising
          it — but named directly they are worth asking about: what a woman is
          actually told about a procedure, its risks and its alternatives is
          examinable, and the leaflet is where the RCOG says it. Questions
          carry the leaflet as their source, as any other document does.
        </p>
        <button
          type="button"
          onClick={() => void enqueueLeaflets()}
          disabled={queueing || running}
          className="mt-4 rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good disabled:opacity-40"
        >
          {queueing ? "Queueing…" : "Queue leaflets"}
        </button>
      </section>

      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-strong">
              {active.length} job{active.length === 1 ? "" : "s"} outstanding
            </h2>
            <p className="mt-1 font-mono text-xs text-ink/55">
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
                  ? "border border-accent/40 bg-accent/10 text-accent"
                  : "bg-brand text-on-brand hover:bg-good"
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
              className="rounded-card border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink/70 hover:text-ink-strong disabled:opacity-40"
            >
              Clear finished
            </button>
          </div>
        </div>

        {note && <p className="mt-3 text-sm text-ink/75">{note}</p>}
        {error && <p className="mt-3 text-sm text-accent">{error}</p>}
        {running && (
          <p className="mt-3 font-mono text-[11px] text-ink/50">
            Keep this page open. Closing it pauses the queue — nothing is lost.
          </p>
        )}

        {jobs.length === 0 ? (
          <p className="mt-4 text-sm text-ink/60">
            No jobs yet. Queue the shortfall above to fill your coverage gaps.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="rounded-card border border-line bg-raised p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{job.section_label}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink/55">
                      {job.format.toUpperCase()} · {job.created} of {job.target} ·{" "}
                      {job.status}
                    </p>
                    {job.last_error && (
                      <p className="mt-1 text-xs text-accent/90">
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
                        className="rounded px-2 py-1 text-xs font-medium text-ink/60 hover:text-accent disabled:opacity-40"
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
                          className="rounded px-2 py-1 text-xs font-medium text-ink/60 hover:text-ink-strong disabled:opacity-40"
                        >
                          Retry
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div
                  className="mt-2 h-1 w-full overflow-hidden rounded-full bg-sunk"
                  role="progressbar"
                  aria-valuenow={jobProgress(job)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${job.section_label} progress`}
                >
                  <div
                    className={`h-full ${job.status === "failed" ? "bg-accent" : "bg-good"}`}
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
