"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";
import { MAX_SOURCE_EMQ_SETS, MAX_SOURCE_SBAS } from "@/lib/queue";
import { generateFromSource } from "./actions";

const number = "h-9 w-16 rounded-control border border-line bg-raised px-2 font-ui text-[15px] tabular-nums";
const label = "flex items-center gap-1.5 font-ui text-[14px] font-medium text-ink/80";

/**
 * Questions from this source alone, without going to the Generate tab
 * (owner, 5 November 2026). They are written in the background and arrive
 * in Review; what could not be written is not reported here, as asked.
 */
export function GenerateFromSource({ documentId }: { documentId: number }) {
  const [sba, setSba] = useState(0);
  const [emq, setEmq] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      {error && <p className="mt-2 font-ui text-[14px] text-accent-ink">{error}</p>}
    </form>
  );
}
