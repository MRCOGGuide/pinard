"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";
import { MAX_SOURCE_EMQ_SETS, MAX_SOURCE_SBAS } from "@/lib/queue";
import { generateFromSource, openJobsFor } from "./actions";

const number = "h-9 w-16 rounded-control border border-line bg-raised px-2 font-ui text-[15px] tabular-nums";
const label = "flex items-center gap-1.5 font-ui text-[14px] font-medium text-ink/80";

const CHECK_EVERY_MS = 15_000;
const STOP_CHECKING_MS = 15 * 60 * 1000;

/**
 * Questions from this source alone, without going to the Generate tab
 * (owner, 5 November 2026). They are written in the background and arrive
 * in Review. What failed its checks is not reported here, as asked, but a
 * source with nothing new left says so (owner, 6 November 2026).
 */
export function GenerateFromSource({ documentId, max, limited }: { documentId: number; max: { sba: boolean; emq: boolean }; limited: boolean }) {
  const router = useRouter();
  const [sba, setSba] = useState(0);
  const [emq, setEmq] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the jobs end, the card picks up its new counts and any "reached max".
  useEffect(() => {
    if (!sent) return;
    const stop = Date.now() + STOP_CHECKING_MS;
    const timer = setInterval(async () => {
      const open = await openJobsFor(documentId).catch(() => 1);
      if (open > 0 && Date.now() < stop) return;
      clearInterval(timer);
      setSent(false);
      router.refresh();
    }, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [sent, documentId, router]);

  const reached = max.sba && max.emq ? "" : max.sba ? " for SBAs" : max.emq ? " for EMQ sets" : null;

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await generateFromSource({ documentId, sba, emqSets: emq }).catch(() => ({ error: "That could not be sent. Try again." }));
    setBusy(false);
    if (result.error) return setError(result.error);
    setSba(0);
    setEmq(0);
    setSent(true);
  }

  return (
    <form onSubmit={generate} className="mt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label className={label}>
        SBA
        <input type="number" min={0} max={MAX_SOURCE_SBAS} value={sba} onChange={(e) => { setSba(Math.max(0, Number(e.target.value) || 0)); setSent(false); }} className={number} />
      </label>
      <label className={label}>
        EMQ sets
        <input type="number" min={0} max={MAX_SOURCE_EMQ_SETS} value={emq} onChange={(e) => { setEmq(Math.max(0, Number(e.target.value) || 0)); setSent(false); }} className={number} />
      </label>
      <button type="submit" disabled={busy || sba + emq === 0} className={buttonClass("secondary", "sm", "ml-auto")}>
        {busy ? "Sending…" : "Generate"}
      </button>
      </div>
      {sent && <p className="mt-2 font-ui text-[14px] text-ink/70">They will appear in Review as they are written.</p>}
      {limited && <p className="mt-2 font-ui text-[14px] font-medium text-ink-strong">Waiting for the model&rsquo;s limit to reset. These will carry on by themselves.</p>}
      {!sent && reached !== null && (
        <p className="mt-2 font-ui text-[14px] font-medium text-ink-strong">Reached max{reached}: this source has nothing new left to test.</p>
      )}
      {error && <p className="mt-2 font-ui text-[14px] text-accent-ink">{error}</p>}
    </form>
  );
}
