import { TraceHeader } from "@/components/TraceHeader";
import { ASK_MONTHLY_ALLOWANCE, PAID_TIERS, PRICES, TIER_NAMES, TOP_UPS, type Region } from "@/config/pricing";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { DiscountManager } from "./DiscountManager";
import { FoundingOffer } from "./FoundingOffer";
import { getPricingSettings } from "@/lib/offer";

export type PromoRow = {
  id: string;
  code: string;
  discount: string;
  redemptions: string;
  active: boolean;
};

export default async function BillingPage() {
  const pricingSettings = await getPricingSettings();

  const configured = stripeConfigured();
  let promos: PromoRow[] = [];
  if (configured) {
    const stripe = getStripe()!;
    try {
      const list = await stripe.promotionCodes.list({
        limit: 25,
        expand: ["data.promotion.coupon"],
      });
      promos = list.data.map((p) => {
        const c =
          typeof p.promotion?.coupon === "object" && p.promotion.coupon
            ? p.promotion.coupon
            : null;
        const discount = c?.percent_off
          ? `${c.percent_off}% off`
          : c?.amount_off
            ? `£${(c.amount_off / 100).toFixed(2)} off`
            : "discount";
        const cap = p.max_redemptions ? `/${p.max_redemptions}` : "";
        return {
          id: p.id,
          code: p.code,
          discount: `${discount}${c?.duration ? ` · ${c.duration}` : ""}`,
          redemptions: `${p.times_redeemed}${cap}`,
          active: p.active,
        };
      });
    } catch {
      promos = [];
    }
  }

  return (
    <>
      <TraceHeader
        title="Billing"
        eyebrow="Owner area"
        lede="The plans and prices, the founding offer, and discount codes."
      />

      {!configured && (
        <p className="mb-5 rounded-card border border-accent/40 bg-surface p-3 text-sm text-accent-ink">
          Stripe isn&rsquo;t configured yet: add your Stripe keys in
          .env.local to edit prices and create discounts.
        </p>
      )}

      <h2 className="mb-3 font-display text-xl font-semibold text-ink-strong">
        Prices
      </h2>
      <p className="mb-3 text-sm text-ink/65">
        Net of tax, in euro; Stripe adds the buyer&rsquo;s tax on top and, as merchant of record, pays it.
        Prices and allowances live in <code>src/config/pricing.ts</code>; after changing one, run{" "}
        <code>node scripts/stripe-tiers-setup.mjs</code> so Stripe matches. Existing subscribers keep
        the price they signed up on.
      </p>
      <div className="mb-8 overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-[560px] border-collapse text-left font-ui text-[14px]">
          <thead className="bg-sunk">
            <tr>
              <th scope="col" className="px-3 py-2">Region</th>
              {PAID_TIERS.map((t) => (
                <th key={t} scope="col" className="px-3 py-2">
                  {TIER_NAMES[t]} ({ASK_MONTHLY_ALLOWANCE[t]} Ask a month)
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(PRICES) as Region[]).map((r) => (
              <tr key={r} className="border-t border-line">
                <th scope="row" className="px-3 py-2 font-semibold capitalize">{r}</th>
                {PAID_TIERS.map((t) => (
                  <td key={t} className="px-3 py-2 tabular-nums">
                    €{(PRICES[r][t].month / 100).toFixed(0)} a month, €{(PRICES[r][t].quarter / 100).toFixed(0)} for 3 months
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line px-3 py-2 text-[13px] text-ink/70">
          Top-ups: {TOP_UPS.map((t) => `${t.questions} questions for €${(t.price / 100).toFixed(0)}`).join(", ")}.
        </p>
      </div>

      <FoundingOffer settings={pricingSettings} />

      <DiscountManager promos={promos} disabled={!configured} />
    </>
  );
}
