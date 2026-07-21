"use client";

import { useState, useTransition } from "react";
import type { PromoRow } from "./page";
import { createDiscount, deactivatePromo } from "./actions";

export function DiscountManager({
  promos,
  disabled,
}: {
  promos: PromoRow[];
  disabled: boolean;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("20");
  const [duration, setDuration] = useState<"once" | "repeating" | "forever">(
    "once"
  );
  const [months, setMonths] = useState("3");
  const [code, setCode] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    const numeric = parseFloat(value);
    if (!Number.isFinite(numeric)) {
      setMsg({ ok: false, text: "Enter a value" });
      return;
    }
    startTransition(async () => {
      const result = await createDiscount({
        name,
        kind,
        value: kind === "amount" ? Math.round(numeric * 100) : numeric,
        duration,
        durationInMonths: duration === "repeating" ? Number(months) : undefined,
        code: code || undefined,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
      });
      if (result.error) {
        setMsg({ ok: false, text: result.error });
      } else {
        setMsg({
          ok: true,
          text: code
            ? `Created — customers can enter code ${code.toUpperCase()} at checkout.`
            : "Coupon created.",
        });
        setName("");
        setCode("");
      }
    });
  }

  const field =
    "mt-1 w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm";

  return (
    <section className="mt-10">
      <h2 className="mb-1 font-display text-xl font-semibold text-theatre">
        Discount codes &amp; vouchers
      </h2>
      <p className="mb-3 text-sm text-graphite/60">
        Create a code customers type at checkout (e.g. a launch voucher), or a
        coupon with no code. Percent or fixed amount off.
      </p>

      <div className="rounded-card border border-hairline bg-porcelain p-5 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Name (internal)
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Autumn launch"
              className={field}
            />
          </label>
          <label className="block text-sm font-medium">
            Voucher code (optional)
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="AUTUMN20"
              className={`${field} font-mono uppercase`}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            Type
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "percent" | "amount")}
              className={field}
            >
              <option value="percent">Percent off</option>
              <option value="amount">Amount off (£)</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            {kind === "percent" ? "Percent (1–100)" : "Amount (£)"}
            <input
              type="number"
              step={kind === "percent" ? "1" : "0.01"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={field}
            />
          </label>
          <label className="block text-sm font-medium">
            Applies
            <select
              value={duration}
              onChange={(e) =>
                setDuration(e.target.value as "once" | "repeating" | "forever")
              }
              className={field}
            >
              <option value="once">Once</option>
              <option value="repeating">For N months</option>
              <option value="forever">Forever</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {duration === "repeating" && (
            <label className="block text-sm font-medium">
              Months
              <input
                type="number"
                min="1"
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                className={field}
              />
            </label>
          )}
          <label className="block text-sm font-medium">
            Max redemptions (optional)
            <input
              type="number"
              min="1"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="unlimited"
              className={field}
            />
          </label>
        </div>

        {msg && (
          <p className={`mt-3 text-sm ${msg.ok ? "text-greentop" : "text-heartbeat"}`}>
            {msg.text}
          </p>
        )}

        <button
          type="button"
          onClick={create}
          disabled={pending || disabled}
          className="mt-4 rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create discount"}
        </button>
      </div>

      <h3 className="mb-2 mt-6 font-display text-base font-semibold text-theatre">
        Active codes
      </h3>
      {promos.length === 0 ? (
        <p className="text-sm text-graphite/60">No voucher codes yet.</p>
      ) : (
        <ul className="space-y-2">
          {promos.map((p) => (
            <PromoItem key={p.id} promo={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PromoItem({ promo }: { promo: PromoRow }) {
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-hairline bg-porcelain p-3 shadow-card">
      <div>
        <span className="font-mono text-sm font-medium text-theatre">
          {promo.code}
        </span>
        <span className="ml-2 text-xs text-graphite/60">{promo.discount}</span>
        <span className="ml-2 font-mono text-[11px] text-graphite/50">
          used {promo.redemptions}
        </span>
        {!promo.active && (
          <span className="ml-2 font-mono text-[10px] uppercase text-graphite/40">
            inactive
          </span>
        )}
      </div>
      {promo.active && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => {
            await deactivatePromo(promo.id);
          })}
          className="rounded px-2 py-1 text-xs font-medium text-graphite/60 hover:text-heartbeat disabled:opacity-40"
        >
          Deactivate
        </button>
      )}
    </li>
  );
}
