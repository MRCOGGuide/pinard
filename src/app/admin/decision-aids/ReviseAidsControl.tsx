"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";

type Run = {
  state: "running" | "done" | "stopped";
  ids: number[];
  next: number;
  revised: number;
  problems: { id: number; title: string; why: string }[];
  message?: string;
  updated_at: string;
};

const POLL_MS = 4000;

function progress(run: Run): string {
  if (run.state === "running") return `Revising aid ${Math.min(run.next + 1, run.ids.length)} of ${run.ids.length}.`;
  if (run.state === "stopped") return run.message ?? "This run stopped part way. Press the button to carry on.";
  if (!run.ids.length) return "";
  return `${run.revised} revised and back under Waiting for review, each with a note of what changed.`;
}

/**
 * The owner's button for when a review is finished (5 November 2026):
 * every aid marked Needs changes is corrected from its note, with no
 * developer involved, and comes back to Waiting for review.
 */
export function ReviseAidsControl({ marked }: { marked: number }) {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/decision-aids/revise").catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { run?: Run | null } | null;
    const latest = payload?.run;
    // Storage can answer with the file as it was a few seconds ago.
    if (latest) setRun((shown) => (shown && Date.parse(latest.updated_at) < Date.parse(shown.updated_at) ? shown : latest));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const running = run?.state === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      clearInterval(timer);
      router.refresh();
    };
  }, [running, load, router]);

  async function start() {
    setError(null);
    setStarting(true);
    const response = await fetch("/api/decision-aids/revise", { method: "POST" }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { run?: Run; error?: string } | null;
    setStarting(false);
    if (!response?.ok || !payload?.run) return setError(payload?.error ?? "The revision could not be started.");
    setRun(payload.run);
  }

  return (
    <section className="mb-6 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-ui text-[15px] text-ink/80">
          {marked === 0
            ? "No aids are marked Needs changes."
            : `${marked} ${marked === 1 ? "aid is" : "aids are"} marked Needs changes. When your review is finished, revise them from your notes.`}
        </p>
        <button type="button" onClick={start} disabled={marked === 0 || running || starting} className={buttonClass("primary", "sm")}>
          {starting ? "Starting…" : running ? "Revising…" : "Revise aids marked Needs changes"}
        </button>
      </div>
      {run && progress(run) && <p className="mt-2 font-ui text-[14px] text-ink/70">{progress(run)}</p>}
      {error && <p className="mt-2 font-ui text-[14px] text-accent-ink">{error}</p>}
      {run && run.problems.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="font-ui text-[14px] font-semibold text-ink-strong">Left at Needs changes, for you to reword or fix by hand:</p>
          <ul className="mt-1 space-y-1">
            {run.problems.map((p) => (
              <li key={p.id} className="font-ui text-[14px] text-ink/80">
                <Link href={`/admin/decision-aids/${p.id}`} className="font-medium text-good hover:text-ink-strong">
                  {p.title}
                </Link>
                : {p.why}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
