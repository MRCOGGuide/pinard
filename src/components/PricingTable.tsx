import Link from "next/link";
import type { TierPricing } from "@/lib/billing";
import { PAID_TIERS, PAID_TIER_ORDER, formatFromDefaults } from "@/lib/pricing";

/**
 * The pricing table — GBP, VAT-inclusive (PROJECT.md section 4). Renders
 * from live prices when provided (admin-editable), else static defaults.
 * Paid tiers post to Stripe Checkout.
 */
export function PricingTable({ prices }: { prices?: TierPricing[] }) {
  const tiers: TierPricing[] =
    prices && prices.length
      ? prices
      : PAID_TIER_ORDER.map((tier) => ({
          tier,
          name: PAID_TIERS[tier].name,
          amountPence: 0,
          formatted: formatFromDefaults(tier),
          cadence: PAID_TIERS[tier].cadence,
          note: PAID_TIERS[tier].note,
          popular: PAID_TIERS[tier].popular,
          priceId: undefined,
        }));

  return (
    <div>
      <div className="rounded-card border border-accent/40 bg-surface p-3 text-center">
        <p className="text-sm font-medium text-accent">
          Founding member — 30% off your first cycle
        </p>
        <p className="text-xs text-ink/60">for the first 500 subscribers</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {/* Free tier */}
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h3 className="font-display text-lg font-semibold text-ink-strong">Free</h3>
          <p className="mt-2">
            <span className="font-mono text-2xl font-medium text-ink-strong">£0</span>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink/70">
            3 sample questions per section, each with one full worked feedback.
            Diagnostic locked.
          </p>
          {/* The free tier had no way out of itself: three priced cards
              with buttons and one without, which reads as unavailable
              rather than free. There is nothing to buy here, so the
              action is the account. */}
          <Link
            href="/sign-up"
            className="mt-4 block w-full rounded-card border border-line bg-raised px-4 py-2 text-center text-sm font-medium text-ink/80 transition-colors hover:border-good hover:text-ink-strong"
          >
            Start free
          </Link>
        </div>

        {tiers.map((tier) => (
          <div
            key={tier.tier}
            className={`rounded-card border p-5 shadow-card ${
              tier.popular
                ? "border-good bg-sunk"
                : "border-line bg-surface"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-lg font-semibold text-ink-strong">
                {tier.name}
              </h3>
              {tier.popular && (
                <span className="rounded-full bg-good px-2 py-0.5 font-mono text-[10px] uppercase text-on-brand">
                  Most popular
                </span>
              )}
            </div>
            <p className="mt-2">
              <span className="font-mono text-2xl font-medium text-ink-strong">
                {tier.formatted}
              </span>
              <span className="font-mono text-xs text-ink/60">
                {tier.cadence}
              </span>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink/70">
              {tier.note}
            </p>
            <form action="/api/stripe/checkout" method="post" className="mt-4">
              <input type="hidden" name="tier" value={tier.tier} />
              <button
                type="submit"
                className={`w-full rounded-card px-4 py-2 text-sm font-medium ${
                  tier.popular
                    ? "bg-good text-on-brand hover:bg-brand"
                    : "bg-brand text-on-brand hover:bg-good"
                }`}
              >
                Choose {tier.name}
              </button>
            </form>
          </div>
        ))}
      </div>

      <p className="mt-4 text-center text-sm text-ink/70">
        7-day full refund window, no questions asked.
      </p>
      <p className="mt-1 text-center text-xs text-ink/50">
        Prices in GBP, VAT included.
      </p>
    </div>
  );
}
