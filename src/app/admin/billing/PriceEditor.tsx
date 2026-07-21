"use client";

import { useState, useTransition } from "react";
import type { TierPricing } from "@/lib/billing";
import { updatePrice } from "./actions";

export function PriceEditor({
  price,
  disabled,
}: {
  price: TierPricing;
  disabled: boolean;
}) {
  const [pounds, setPounds] = useState((price.amountPence / 100).toFixed(2));
  const [cadence, setCadence] = useState(price.cadence);
  const [note, setNote] = useState(price.note);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const amountPence = Math.round(parseFloat(pounds) * 100);
    if (!Number.isFinite(amountPence)) {
      setMsg({ ok: false, text: "Enter a valid amount" });
      return;
    }
    startTransition(async () => {
      const result = await updatePrice({
        tier: price.tier,
        amountPence,
        cadence,
        note,
      });
      setMsg(
        result.error
          ? { ok: false, text: result.error }
          : { ok: true, text: "Saved — the new price is live." }
      );
    });
  }

  const field =
    "mt-1 w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm";

  return (
    <div className="rounded-card border border-hairline bg-porcelain p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-theatre">
          {price.name}
        </h3>
        {price.popular && (
          <span className="rounded-full bg-greentop px-2 py-0.5 font-mono text-[10px] uppercase text-porcelain">
            Most popular
          </span>
        )}
      </div>

      <label className="mt-3 block text-sm font-medium">
        Price (£)
        <input
          type="number"
          step="0.01"
          min="0.50"
          value={pounds}
          onChange={(e) => setPounds(e.target.value)}
          className={field}
        />
      </label>

      <label className="mt-3 block text-sm font-medium">
        Cadence label
        <input
          value={cadence}
          onChange={(e) => setCadence(e.target.value)}
          placeholder="/month"
          className={field}
        />
      </label>

      <label className="mt-3 block text-sm font-medium">
        Note
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={field}
        />
      </label>

      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? "text-greentop" : "text-heartbeat"}`}>
          {msg.text}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={pending || disabled}
        className="mt-3 rounded-card bg-theatre px-4 py-2 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save price"}
      </button>
    </div>
  );
}
