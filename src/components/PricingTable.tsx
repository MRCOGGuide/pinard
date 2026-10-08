import Link from "next/link";
import type { TierPricing } from "@/lib/billing";
import { PAID_TIERS, PAID_TIER_ORDER, formatFromDefaults } from "@/lib/pricing";
import type { PricingSettings } from "@/lib/offer";
import { currencyForCountry, indicativeAmount } from "@/lib/currency";
import {
  formatGBP,
  formatPerDay,
  savingAgainstMonthly,
  timesTheResit,
} from "@/lib/value";
import { LAUNCHED, SIGN_UP_LABEL } from "@/lib/launch";

/**
 * The pricing table — GBP, VAT-inclusive (PROJECT.md section 4). Renders
 * from live prices when provided (admin-editable), else static defaults.
 * Paid tiers post to Stripe Checkout.
 */
export function PricingTable({
  prices,
  settings,
  country,
  wide = false,
}: {
  prices?: TierPricing[];
  /** Four across on a wide page (the landing) rather than two by two. */
  wide?: boolean;
  /** The offer the owner has set, and what a resit costs. */
  settings?: PricingSettings;
  /** Where the request came from, so the figure can be shown in their money. */
  country?: string | null;
}) {
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

  const offer = settings?.offer;
  /*
    What they are SHOWN, never what they are charged. The charge is the
    GBP price above; this is the same money in a currency the reader
    recognises, and only where the owner has given a rate for it.
  */
  const local = currencyForCountry(country);
  const indicative = (pence: number) =>
    local && settings?.rates
      ? indicativeAmount(pence, local, settings.rates)
      : null;
  const showsLocal = tiers.some((t) => indicative(t.amountPence));
  const monthlyPence = tiers.find((t) => t.tier === "monthly")?.amountPence;
  const saving = (tier: TierPricing) =>
    savingAgainstMonthly(tier.amountPence, tier.tier, monthlyPence);

  /*
    Only where the owner has told us what a resit costs, and only
    against the cheapest way to subscribe for a year, which is the
    comparison a candidate is actually weighing.
  */
  const annual = tiers.find((t) => t.tier === "annual");
  const resitTimes = annual
    ? timesTheResit(annual.amountPence, settings?.resitFeePence ?? undefined)
    : null;
  const resitLine =
    resitTimes && settings?.resitFeePence
      ? `Sitting the exam again costs ${formatGBP(
          settings.resitFeePence
        )}: ${resitTimes} times a year of this.`
      : null;

  return (
    <div>
      {offer?.active && offer.left > 0 && (
        <div className="rounded-card border border-accent/40 bg-surface p-3 text-center">
          <p className="text-sm font-medium text-accent-ink">
            Founding member: {offer.percent}% off your first cycle
          </p>
          <p className="text-xs text-ink/60">
            {/* Counted, not claimed. A banner saying "the first 500" with
                nothing counting the 500 stops being true in silence. */}
            {offer.left === 1
              ? "one place left"
              : `${offer.left} of ${offer.places} places left`}
          </p>
        </div>
      )}

      <div className={`mt-4 grid gap-3 sm:grid-cols-2 ${wide ? "lg:grid-cols-4 lg:gap-4" : ""}`}>
        {/* Free tier */}
        <div className="flex flex-col rounded-card border border-line bg-surface p-5 shadow-card">
          <h3 className="font-display text-lg font-semibold text-ink-strong">Free</h3>
          <p className="mt-2">
            <span className="font-mono text-2xl font-medium text-ink-strong">£0</span>
          </p>
          <p className="mb-4 mt-2 text-xs leading-relaxed text-ink/70">
            3 sample questions per section, each with full worked feedback,
            and the 15-question diagnostic. No plan, and no topic map past the
            fifteen.
          </p>
          {/* The free tier had no way out of itself: three priced cards
              with buttons and one without, which reads as unavailable
              rather than free. There is nothing to buy here, so the
              action is the account. */}
          <Link
            href="/sign-up"
            className="mt-auto block w-full rounded-card border border-line bg-raised px-4 py-2 text-center text-sm font-medium text-ink/80 transition-colors hover:border-good hover:text-ink-strong"
          >
            {LAUNCHED ? "Start free" : SIGN_UP_LABEL}
          </Link>
        </div>

        {tiers.map((tier) => (
          <div
            key={tier.tier}
            className={`flex flex-col rounded-card border p-5 shadow-card ${
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
                <span className="rounded-full bg-good px-2.5 py-0.5 text-[12px] font-semibold text-on-brand">
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
            {/* The sums a buyer does anyway, done from the live prices
                rather than written into the page: a saving typed into a
                component is true until someone changes a price. */}
            {indicative(tier.amountPence) && (
              <p className="mt-0.5 font-mono text-xs text-ink/55">
                about {indicative(tier.amountPence)}
              </p>
            )}
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[13px]">
              <span className="text-ink/55">
                {formatPerDay(tier.amountPence, tier.tier)}
              </span>
              {saving(tier) !== null && (
                <span className="text-good">
                  Saves {saving(tier)}% against monthly
                </span>
              )}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink/70">
              {tier.note}
            </p>
            <form action="/api/stripe/checkout" method="post" className="mt-auto pt-4">
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

      {resitLine && (
        <p className="mt-4 text-center text-sm text-ink/80">{resitLine}</p>
      )}
      <p className="mt-4 text-center text-sm text-ink/70">
        7-day full refund window, no questions asked.
      </p>
      <p className="mt-1 text-center text-xs text-ink/50">
        {/* Said once, plainly. More people sit this exam outside the UK
            than in it, and a price in a currency you do not hold is a
            question about your bank as much as about the product. */}
        {/* Only where a figure was actually printed. A country on the
            list whose rate the owner has not set shows pounds alone,
            and a footnote about "the ZAR figures" under no ZAR figures
            is a promise the page did not keep. */}
        {local && showsLocal
          ? `Charged in GBP, VAT included. The ${local.code} figures are a guide; your bank sets the rate it converts at.`
          : "Prices in GBP, VAT included."}
      </p>
    </div>
  );
}
