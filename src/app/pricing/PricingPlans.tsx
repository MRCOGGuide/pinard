"use client";

import Link from "next/link";
import { useState } from "react";
import type { Interval } from "@/config/pricing";
import type { CardView, PricingView } from "@/lib/pricingView";
import { recordToggle } from "./actions";
import { RegionSignals } from "@/components/RegionSignals";

/**
 * The four plans (pricing Phase 2, D). The comparison table that used
 * to follow them was removed at the owner's request (10 October 2026):
 * it repeated the cards line for line.
 *
 * Three-monthly is selected first, showing the price per month and the
 * saving against paying monthly. Every card lists the same features in
 * the same order, ticked or not, so the tiers compare at a glance; a
 * word beside each mark says it too, for anyone not reading colour or
 * shape. Plus is the one we recommend, said in words, and comes first
 * on a phone. Next to each button: how it renews, that it can be
 * cancelled, and the refund policy.
 *
 * Receives only this visitor's own prices (lib/pricingView).
 */
function Tick() {
  return (
    <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-good" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Cross() {
  return (
    <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-ink/35" aria-hidden="true">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PricingPlans({
  view,
  signedIn,
  currentTier,
  founding,
  examWeeks,
}: {
  view: PricingView;
  signedIn: boolean;
  currentTier: string | null;
  founding: { percent: number; left: number } | null;
  examWeeks: number | null;
}) {
  const [interval, setInterval] = useState<Interval>("quarter");
  // The new figures ease in only after a switch, not when the page loads.
  const [switched, setSwitched] = useState(false);
  const best = Math.max(...view.cards.map((c) => c.prices?.quarter.saving ?? 0));

  function choose(next: Interval) {
    if (next === interval) return;
    setInterval(next);
    setSwitched(true);
    void recordToggle(next);
  }

  return (
    <div>
      {founding && (
        <p className="mb-5 rounded-card border border-accent/40 bg-surface p-3 text-center font-ui text-[14px] text-accent-ink">
          Founding member: {founding.percent}% off your first billing period on Basic and Plus.{" "}
          <span className="text-ink/70">{founding.left} places left.</span>
        </p>
      )}

      <div className="flex flex-col items-center gap-2">
        {/* Two equal halves and one white pill that slides between them,
            so the switch is seen to move rather than to blink. */}
        <div role="radiogroup" aria-label="Billing period" className="relative grid grid-cols-2 rounded-full border border-line bg-sunk p-1">
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-surface shadow-card transition-transform duration-[250ms] ease-out motion-reduce:transition-none"
            style={{ transform: interval === "month" ? "translateX(100%)" : "translateX(0)" }}
          />
          {(["quarter", "month"] as Interval[]).map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={interval === i}
              onClick={() => choose(i)}
              className={`relative z-10 rounded-full px-4 py-2 font-ui text-[14px] font-semibold transition-colors duration-[250ms] ${
                interval === i ? "text-ink-strong" : "text-ink/70 hover:text-ink-strong"
              }`}
            >
              {i === "quarter" ? "Every three months" : "Monthly"}
            </button>
          ))}
        </div>
        <p key={interval} className={`font-ui text-[13px] text-ink/70 ${switched ? "price-swap" : ""}`}>
          {interval === "quarter"
            ? `Save up to ${best}% against paying monthly, with three months of Ask Pinard to use whenever you need it.`
            : "The most flexible: pay month by month."}
        </p>
        {examWeeks !== null && examWeeks > 0 && (
          <p className="font-ui text-[13px] font-medium text-good">
            {examWeeks <= 13
              ? `Your exam is in ${examWeeks} ${examWeeks === 1 ? "week" : "weeks"}: one three-month plan covers it.`
              : `Your exam is in ${examWeeks} weeks: a three-month plan covers the next 13, and renews until you cancel.`}
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {view.cards.map((card) => (
          <Card
            key={card.tier}
            card={card}
            interval={interval}
            animate={switched}
            signedIn={signedIn}
            current={currentTier === card.tier}
          />
        ))}
      </div>

      <p className="mt-4 text-center font-ui text-[13px] text-ink/70">{view.taxNote} Prices vary by country.</p>
    </div>
  );
}

function Card({
  card,
  interval,
  animate,
  signedIn,
  current,
}: {
  card: CardView;
  interval: Interval;
  animate: boolean;
  signedIn: boolean;
  current: boolean;
}) {
  const price = card.prices?.[interval];
  return (
    <section
      aria-label={`${card.name} plan`}
      className={`relative flex flex-col rounded-card border p-5 shadow-card transition-[transform,box-shadow] duration-[250ms] ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgb(0_0_0/0.10)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        card.recommended ? "order-first border-good bg-sunk ring-1 ring-good lg:order-none" : "border-line bg-surface"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-[21px] font-semibold leading-snug text-ink-strong">{card.name}</h3>
        {card.recommended && (
          <span className="rounded-full bg-good px-2.5 py-0.5 font-ui text-[12px] font-semibold text-on-brand">Recommended</span>
        )}
      </div>

      <p key={interval} className={`mt-2 min-h-[3.5rem] ${price && animate ? "price-swap" : ""}`}>
        {price ? (
          <>
            <span className="font-mono text-2xl font-medium text-ink-strong">{price.amount}</span>
            <span className="font-mono text-xs text-ink/65">{interval === "quarter" ? " for 3 months" : " a month"}</span>
            {price.perMonth && (
              <span className="block font-ui text-[13px] text-ink/70">
                {price.perMonth} a month{price.saving ? `, save ${price.saving}%` : ""}
              </span>
            )}
          </>
        ) : (
          <span className="font-mono text-2xl font-medium text-ink-strong">€0</span>
        )}
      </p>
      {/* The same height on every card, so the feature rows line up across them. */}
      <p className="min-h-[1.25rem] font-ui text-[12px] font-medium text-accent-ink">{card.founding ? "Founding offer applies" : ""}</p>

      <ul className="mt-4 space-y-2">
        {card.features.map((f) => (
          <li key={f.text} className={`flex gap-2 font-ui text-[14px] leading-snug ${f.included ? "text-ink/85" : "text-ink/45"}`}>
            {f.included ? <Tick /> : <Cross />}
            <span>
              <span className="sr-only">{f.included ? "Included: " : "Not included: "}</span>
              {f.text}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-5">
        {current ? (
          <p className="rounded-control border border-line px-4 py-2.5 text-center font-ui text-[15px] font-semibold text-ink/70">Your plan</p>
        ) : card.tier === "free" ? (
          <Link
            href={signedIn ? "/diagnostic" : "/sign-up"}
            className="block w-full rounded-control border border-line bg-raised px-4 py-2.5 text-center font-ui text-[15px] font-semibold text-ink-strong hover:border-good"
          >
            {signedIn ? "Take the sample diagnostic" : "Start free"}
          </Link>
        ) : (
          <form action="/api/stripe/checkout" method="post">
            <input type="hidden" name="tier" value={card.tier} />
            <input type="hidden" name="interval" value={interval} />
            <RegionSignals />
            <button
              type="submit"
              className={`w-full rounded-control border border-transparent px-4 py-2.5 font-ui text-[15px] font-semibold ${
                card.recommended ? "bg-good text-on-brand hover:bg-brand" : "bg-brand text-on-brand hover:bg-good"
              }`}
            >
              Choose {card.name}
            </button>
          </form>
        )}
        {/* Every card has a note under its button and the same space
            for it, so the buttons line up across the row. */}
        <p key={interval} className={`mt-2 min-h-[3.75rem] font-ui text-[12px] leading-relaxed text-ink/65 ${price && animate ? "price-swap" : ""}`}>
          {price ? (
            <>
              {price.renewal} Cancel any time.{" "}
              <Link href="/refunds" className="underline underline-offset-2 hover:text-ink-strong">
                Refund policy
              </Link>
            </>
          ) : (
            "No card needed. Subscribe whenever you are ready."
          )}
        </p>
      </div>
    </section>
  );
}
