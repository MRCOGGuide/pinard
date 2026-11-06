"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";

const POLL_MS = 5000;

/** Starts a run of the test questions and shows how far it has got. */
export function RunTests() {
  const router = useRouter();
  const [run, setRun] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!run) return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/ask-tests?run=${run}`).catch(() => null);
      const next = (await response?.json().catch(() => null)) as { done: number; total: number } | null;
      if (!next || typeof next.done !== "number") return;
      setProgress(next);
      if (next.done >= next.total) {
        setRun(null);
        router.refresh();
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [run, router]);

  async function start() {
    const ok = window.confirm("This asks all the test questions again. It takes about two minutes and costs about €1.");
    if (!ok) return;
    setError(null);
    setStarting(true);
    const response = await fetch("/api/ask-tests", { method: "POST" }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { run?: string; total?: number; error?: string } | null;
    setStarting(false);
    if (!response?.ok || !payload?.run) return setError(payload?.error ?? "The tests could not be started.");
    setRun(payload.run);
    setProgress({ done: 0, total: payload.total ?? 0 });
  }

  return (
    <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4">
      <p className="font-ui text-[15px] text-ink/80">
        {run && progress
          ? `Asking: ${progress.done} of ${progress.total} answered. You can leave this page; the answers appear here when they are ready.`
          : "Run the tests after any change to Ask Pinard, then compare the answers below."}
      </p>
      <button type="button" onClick={start} disabled={Boolean(run) || starting} className={buttonClass("primary", "sm")}>
        {starting ? "Starting…" : run ? "Running…" : "Run the tests"}
      </button>
      {error && <p className="w-full font-ui text-[14px] text-accent-ink">{error}</p>}
    </section>
  );
}
