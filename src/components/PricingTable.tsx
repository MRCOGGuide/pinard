/**
 * The pricing table — GBP, VAT-inclusive, exactly per PROJECT.md
 * section 4. Purchase buttons activate when Stripe arrives (Phase 7).
 */

const tiers = [
  {
    name: "Free",
    price: "£0",
    cadence: "",
    note: "3 sample questions per section, each with one full worked feedback. Diagnostic locked.",
    popular: false,
  },
  {
    name: "Monthly",
    price: "£16.99",
    cadence: "/month",
    note: "Flexible — cancel any time.",
    popular: false,
  },
  {
    name: "Quarterly",
    price: "£39.99",
    cadence: " (£13.33/mo)",
    note: "Matches a typical 10–14-week revision cycle.",
    popular: true,
  },
  {
    name: "Annual",
    price: "£99.99",
    cadence: "/year",
    note: "For trainees spanning two sittings or parts.",
    popular: false,
  },
] as const;

export function PricingTable() {
  return (
    <div>
      <div className="rounded-card border border-heartbeat/40 bg-porcelain p-3 text-center">
        <p className="text-sm font-medium text-heartbeat">
          Founding member — 30% off your first cycle
        </p>
        <p className="text-xs text-graphite/60">for the first 500 subscribers</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`rounded-card border p-5 shadow-card ${
              tier.popular
                ? "border-greentop bg-sage"
                : "border-hairline bg-porcelain"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-lg font-semibold text-theatre">
                {tier.name}
              </h3>
              {tier.popular && (
                <span className="rounded-full bg-greentop px-2 py-0.5 font-mono text-[10px] uppercase text-porcelain">
                  Most popular
                </span>
              )}
            </div>
            <p className="mt-2">
              <span className="font-mono text-2xl font-medium text-theatre">
                {tier.price}
              </span>
              <span className="font-mono text-xs text-graphite/60">
                {tier.cadence}
              </span>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-graphite/70">
              {tier.note}
            </p>
            {tier.name !== "Free" && (
              <button
                type="button"
                disabled
                className="mt-4 w-full rounded-card bg-theatre px-4 py-2 text-sm font-medium text-porcelain opacity-50"
                title="Subscriptions open soon"
              >
                Coming soon
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 text-center text-sm text-graphite/70">
        7-day full refund window, no questions asked.
      </p>
      <p className="mt-1 text-center text-xs text-graphite/50">
        Prices in GBP, VAT included.
      </p>
    </div>
  );
}
