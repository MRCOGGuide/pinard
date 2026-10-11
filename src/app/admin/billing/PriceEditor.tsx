"use client";

import { useState, useTransition } from "react";
import { buttonClass, FIELD_CLASS } from "@/components/ui";
import type { Interval, PaidTier, Region, TopUpId } from "@/config/pricing";
import { updatePlanPrice, updateTopUpPrice } from "./actions";

export type PlanCell = {
  region: Region;
  tier: PaidTier;
  interval: Interval;
  cents: number;
  floor: number;
  /** The founding offer reaches this plan, so its discounted price must clear the floor too. */
  founding: boolean;
};
export type TopUpCell = { id: TopUpId; questions: number; cents: number; floor: number };

const euro = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/**
 * One price, edited in place. Saving makes the new Stripe price and
 * moves checkout to it; until that has worked, the old price stands.
 */
function PriceField(props: {
  label: string;
  cents: number;
  floor: number;
  note?: string;
  save: (cents: number) => Promise<{ error?: string }>;
}) {
  const [value, setValue] = useState(euro(props.cents));
  const [current, setCurrent] = useState(props.cents);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const cents = Math.round(Number(value.replace(",", ".")) * 100);
  const changed = Number.isFinite(cents) && cents !== current;

  return (
    <div className="space-y-1">
      <label className="block font-ui text-[13px] text-ink/70">
        {props.label}
        <span className="mt-1 flex items-center gap-2">
          <span className="text-ink/60">€</span>
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setMessage(null);
            }}
            className={`${FIELD_CLASS} w-24 tabular-nums`}
            aria-describedby={`floor-${props.label}`}
          />
          {changed && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await props.save(cents);
                  if (result.error) return setMessage({ ok: false, text: result.error });
                  setCurrent(cents);
                  setMessage({ ok: true, text: "Saved: new buyers pay this from now." });
                })
              }
              className={buttonClass("primary", "sm")}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          )}
        </span>
      </label>
      <p id={`floor-${props.label}`} className="font-ui text-[12px] text-ink/55">
        Floor €{(props.floor / 100).toFixed(2)}
        {props.note ? `; ${props.note}` : ""}
      </p>
      {message && (
        <p role="status" className={`font-ui text-[13px] ${message.ok ? "text-good" : "text-accent-ink"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

export function PriceEditor(props: {
  plans: PlanCell[];
  topUps: TopUpCell[];
  tierNames: Record<PaidTier, string>;
  allowances: Record<PaidTier, number>;
  foundingMax: number;
  disabled: boolean;
}) {
  const regions = [...new Set(props.plans.map((p) => p.region))];
  const tiers = [...new Set(props.plans.map((p) => p.tier))];
  const cell = (r: Region, t: PaidTier, i: Interval) => props.plans.find((p) => p.region === r && p.tier === t && p.interval === i)!;

  if (props.disabled) {
    return <p className="mb-8 text-sm text-ink/65">Prices can be edited once Stripe is configured.</p>;
  }

  return (
    <div className="mb-8 space-y-6">
      {regions.map((r) => (
        <section key={r} className="rounded-card border border-line bg-surface p-4">
          <h3 className="mb-3 font-ui text-[15px] font-semibold capitalize text-ink-strong">{r} region</h3>
          <div className="grid gap-5 sm:grid-cols-3">
            {tiers.map((t) => (
              <div key={t} className="space-y-3">
                <p className="font-ui text-[14px] font-semibold text-ink-strong">
                  {props.tierNames[t]} <span className="font-normal text-ink/60">({props.allowances[t]} Ask a month)</span>
                </p>
                {(["month", "quarter"] as Interval[]).map((i) => {
                  const c = cell(r, t, i);
                  return (
                    <PriceField
                      key={i}
                      label={i === "month" ? "A month" : "Three months"}
                      cents={c.cents}
                      floor={c.floor}
                      note={c.founding ? `with the founding offer at least €${Math.ceil(c.floor / (1 - props.foundingMax / 100) / 100)}` : undefined}
                      save={(cents) => updatePlanPrice({ region: r, tier: t, interval: i, cents })}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="rounded-card border border-line bg-surface p-4">
        <h3 className="mb-3 font-ui text-[15px] font-semibold text-ink-strong">Ask Pinard top-ups</h3>
        <div className="grid gap-5 sm:grid-cols-3">
          {props.topUps.map((t) => (
            <PriceField
              key={t.id}
              label={`${t.questions} questions`}
              cents={t.cents}
              floor={t.floor}
              save={(cents) => updateTopUpPrice({ id: t.id, cents })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
