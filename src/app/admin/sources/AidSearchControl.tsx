"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Search = {
  state: "running" | "done" | "stopped";
  pages: number[];
  read: number;
  found: unknown[];
  saved: number;
  message?: string;
};

/** A source uploaded this recently may have a search under way that nobody pressed a button for. */
const RECENT_MS = 2 * 24 * 60 * 60 * 1000;
const POLL_MS = 5000;

function progress(s: Search): string {
  if (s.state === "stopped") return s.message ?? "This search stopped part way.";
  if (s.state === "done") return s.found.length ? "Search finished." : "Search finished: no decision aids in this source.";
  if (s.read < s.pages.length) return `Reading page ${s.read + 1} of the ${s.pages.length} that may hold a decision aid; ${s.found.length} found so far.`;
  return `Transcribing decision aid ${s.saved + 1} of ${s.found.length}.`;
}

/**
 * Finds the flowcharts and decision tables in a source. A guideline is
 * searched by itself when first uploaded; this is for any other source,
 * for looking again, and for carrying on a search that stopped.
 */
export function AidSearchControl({ documentId, aidCount, uploadedAt }: { documentId: number; aidCount: number; uploadedAt: string }) {
  const router = useRouter();
  const [search, setSearch] = useState<Search | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/decision-aids/search?documentId=${documentId}`).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { search?: Search | null } | null;
    if (payload?.search) setSearch(payload.search);
  }, [documentId]);

  useEffect(() => {
    if (Date.now() - Date.parse(uploadedAt) < RECENT_MS) void load();
  }, [load, uploadedAt]);

  const running = search?.state === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      clearInterval(timer);
      router.refresh();
    };
  }, [running, load, router]);

  async function start() {
    const ok = window.confirm("This reads the pages with tables and charts, and saves what it finds as drafts for your review. It usually costs between €0.50 and €2.");
    if (!ok) return;
    setError(null);
    setStarting(true);
    const response = await fetch("/api/decision-aids/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { search?: Search; error?: string } | null;
    setStarting(false);
    if (!response?.ok || !payload?.search) return setError(payload?.error ?? "The search could not be started.");
    setSearch(payload.search);
  }

  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/65">
      {aidCount > 0 && (
        <Link href="/admin/decision-aids?show=waiting" className="text-good hover:text-ink-strong">
          {aidCount} decision {aidCount === 1 ? "aid" : "aids"}
        </Link>
      )}
      {search && <span>{progress(search)}</span>}
      {error && <span className="text-accent-ink">{error}</span>}
      {!running && (
        <button type="button" onClick={start} disabled={starting} className="rounded px-2 py-1 font-medium text-good hover:text-ink-strong disabled:opacity-40">
          {starting ? "Starting…" : "Find decision aids"}
        </button>
      )}
    </p>
  );
}
