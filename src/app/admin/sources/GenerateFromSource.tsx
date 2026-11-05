"use client";

import { useState } from "react";
import { MAX_SOURCE_EMQ_SETS, MAX_SOURCE_SBAS } from "@/lib/queue";
import { generateFromSource } from "./actions";

const number = "w-14 rounded-control border border-line bg-raised px-2 py-1 text-xs tabular-nums";

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
    <form onSubmit={generate} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/65">
      <label className="flex items-center gap-1.5">
        SBA
        <input type="number" min={0} max={MAX_SOURCE_SBAS} value={sba} onChange={(e) => { setSba(Math.max(0, Number(e.target.value) || 0)); setSent(false); }} className={number} />
      </label>
      <label className="flex items-center gap-1.5">
        EMQ sets
        <input type="number" min={0} max={MAX_SOURCE_EMQ_SETS} value={emq} onChange={(e) => { setEmq(Math.max(0, Number(e.target.value) || 0)); setSent(false); }} className={number} />
      </label>
      <button type="submit" disabled={busy || sba + emq === 0} className="rounded px-2 py-1 font-medium text-good hover:text-ink-strong disabled:opacity-40">
        {busy ? "Sending…" : "Generate"}
      </button>
      {sent && <span>They will appear in Review as they are written.</span>}
      {error && <span className="text-accent-ink">{error}</span>}
    </form>
  );
}
