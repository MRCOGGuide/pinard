import { TraceHeader } from "@/components/TraceHeader";
import {
  ASK_MONTHLY_ALLOWANCE,
  FOUNDING_OFFER_MAX_PERCENT,
  PAID_TIERS,
  TIER_NAMES,
  foundingOfferApplies,
  planFloorCents,
  topUpFloorCents,
  type Interval,
  type Region,
} from "@/config/pricing";
import { getPrices } from "@/lib/prices";
import { PriceEditor, type PlanCell } from "./PriceEditor";
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
  const [pricingSettings, current] = await Promise.all([getPricingSettings(), getPrices()]);
  const plans: PlanCell[] = (Object.keys(current.prices) as Region[]).flatMap((region) =>
    PAID_TIERS.flatMap((tier) =>
      (["month", "quarter"] as Interval[]).map((interval) => ({
        region,
        tier,
        interval,
        cents: current.prices[region][tier][interval],
        floor: planFloorCents(tier, interval, region),
        founding: foundingOfferApplies(tier, interval, region),
      }))
    )
  );
  const topUps = current.topUps.map((t) => ({ ...t, cents: t.price, floor: topUpFloorCents(t.questions) }));

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
      <p className="mb-4 text-sm text-ink/65">
        Net of tax, in euro; Stripe adds the buyer&rsquo;s tax on top and, as merchant of record, pays it.
        Change a price and save it: Stripe gets the new price straight away and new buyers pay it, the
        pricing page and the Terms show it, and existing subscribers keep the price they signed up on.
        A price below its floor (the plan&rsquo;s cost at full use, plus 30%) is refused.
      </p>
      <PriceEditor
        plans={plans}
        topUps={topUps}
        tierNames={{ basic: TIER_NAMES.basic, plus: TIER_NAMES.plus, premium: TIER_NAMES.premium }}
        allowances={{ basic: ASK_MONTHLY_ALLOWANCE.basic, plus: ASK_MONTHLY_ALLOWANCE.plus, premium: ASK_MONTHLY_ALLOWANCE.premium }}
        foundingMax={FOUNDING_OFFER_MAX_PERCENT}
        disabled={!configured}
      />

      <FoundingOffer settings={pricingSettings} />

      <DiscountManager promos={promos} disabled={!configured} />
    </>
  );
}
