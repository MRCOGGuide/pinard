import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { getBillingPrices } from "@/lib/billing";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { PriceEditor } from "./PriceEditor";
import { DiscountManager } from "./DiscountManager";

export type PromoRow = {
  id: string;
  code: string;
  discount: string;
  redemptions: string;
  active: boolean;
};

export default async function BillingPage() {
  const supabase = createClient();
  const prices = await getBillingPrices(supabase);

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
        lede="Change subscription prices and create discount codes without touching code."
      />

      {!configured && (
        <p className="mb-5 rounded-card border border-heartbeat/40 bg-porcelain p-3 text-sm text-heartbeat">
          Stripe isn&rsquo;t configured yet — add your Stripe keys in
          .env.local to edit prices and create discounts.
        </p>
      )}

      <h2 className="mb-3 font-display text-xl font-semibold text-theatre">
        Prices
      </h2>
      <p className="mb-3 text-sm text-graphite/60">
        Editing an amount creates a new Stripe price and points the app at it.
        Existing subscribers keep the price they signed up on.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {prices.map((p) => (
          <PriceEditor key={p.tier} price={p} disabled={!configured} />
        ))}
      </div>

      <DiscountManager promos={promos} disabled={!configured} />
    </>
  );
}
