"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";
import type { Twin } from "@/lib/source-twins";

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
export function AidSearchControl({
  documentId,
  aidCount,
  searched,
  uploadedAt,
  twin,
}: {
  documentId: number;
  aidCount: number;
  searched: boolean;
  uploadedAt: string;
  /** The same file, held as another source that has been searched. */
  twin: Twin | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState<Search | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  /** The server found a twin that the card could not: the same text in another file. */
  const [warned, setWarned] = useState<Twin | null>(null);
  const copy = aidCount === 0 ? (warned ?? twin) : warned;

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
    const ok = window.confirm(
      copy
        ? `This is the same document as "${copy.title}". Searching here pays for its decision aids again, usually between €0.50 and €2, and makes copies of them to review. Search anyway?`
        : searched && aidCount === 0
          ? "This source has already been searched and no decision aids were found. Searching again usually costs between €0.50 and €2. Search again?"
          : "This reads the pages with tables and charts, and saves what it finds as drafts for your review. It usually costs between €0.50 and €2."
    );
    if (!ok) return;
    setError(null);
    setStarting(true);
    const response = await fetch("/api/decision-aids/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, force: Boolean(copy) }),
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { search?: Search; error?: string; twin?: Twin } | null;
    setStarting(false);
    if (payload?.twin) setWarned(payload.twin);
    if (!response?.ok || !payload?.search) return setError(payload?.error ?? "The search could not be started.");
    setSearch(payload.search);
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 font-ui text-[14px] text-ink/80">
        {aidCount > 0 ? (
          <Link href={`/admin/decision-aids?doc=${documentId}`} className="font-medium text-good hover:text-ink-strong">
            See {aidCount === 1 ? "this aid" : `these ${aidCount} aids`}
          </Link>
        ) : copy ? (
          <span>
            Same document as{" "}
            <Link href={`/admin/decision-aids?doc=${copy.id}`} className="font-medium text-good hover:text-ink-strong">
              {copy.title}
            </Link>
            : {copy.aids === 0 ? "searched, none found" : copy.aids === 1 ? "1 aid there" : `${copy.aids} aids there`}.
          </span>
        ) : (
          <span>{searched ? "Searched: none found." : "Not searched yet."}</span>
        )}
        {!running && (
          <button type="button" onClick={start} disabled={starting} className={buttonClass("secondary", "sm")}>
            {starting ? "Starting…" : copy ? "Search anyway" : searched ? "Search again" : "Find decision aids"}
          </button>
        )}
      </div>
      {search && <p className="mt-2 font-ui text-[14px] text-ink/70">{progress(search)}</p>}
      {error && <p className="mt-2 font-ui text-[14px] text-accent-ink">{error}</p>}
    </>
  );
}
