import "server-only";
import {
  ASK_MONTHLY_ALLOWANCE,
  CURRENCY,
  FEATURES,
  FOUNDING_OFFER_TIERS,
  PAID_TIERS,
  PRICES,
  RECOMMENDED_TIER,
  TIER_NAMES,
  type Interval,
  type PaidTier,
  type Region,
  type Tier,
} from "@/config/pricing";
import { taxShareFor } from "@/lib/taxDisplay";

/**
 * What the pricing page is allowed to know: the visitor's own prices,
 * already formatted, and nothing about any other region. This object
 * is the only pricing data sent to the browser.
 */
export type PriceView = {
  amount: string;
  /** For the three-month plan: the same, per month. */
  perMonth: string | null;
  /** Percentage saved against three monthly payments. */
  saving: number | null;
  renewal: string;
};

export type CardView = {
  tier: Tier;
  name: string;
  recommended: boolean;
  founding: boolean;
  prices: Record<Interval, PriceView> | null;
  features: { label: string; included: boolean; detail: string | null }[];
};

export type PricingView = {
  cards: CardView[];
  /** "includes VAT" when Stripe could work out the visitor's tax. */
  taxIncluded: boolean;
  taxNote: string;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: CURRENCY.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export async function pricingView(region: Region, country: string | null, foundingActive: boolean): Promise<PricingView> {
  const share = await taxShareFor(country);
  const gross = (net: number) => (share ? Math.round(net * (1 + share)) : net);

  const cards: CardView[] = (["free", ...PAID_TIERS] as Tier[]).map((tier) => {
    let prices: CardView["prices"] = null;
    if (tier !== "free") {
      const p = PRICES[region][tier as PaidTier];
      const m = gross(p.month);
      const q = gross(p.quarter);
      prices = {
        month: { amount: money(m), perMonth: null, saving: null, renewal: `Renews every month at ${money(m)} until you cancel.` },
        quarter: {
          amount: money(q),
          perMonth: money(Math.round(q / 3)),
          saving: Math.round((1 - p.quarter / (3 * p.month)) * 100),
          renewal: `Renews every three months at ${money(q)} until you cancel.`,
        },
      };
    }
    return {
      tier,
      name: TIER_NAMES[tier],
      recommended: tier === RECOMMENDED_TIER,
      founding: foundingActive && FOUNDING_OFFER_TIERS.includes(tier as PaidTier),
      prices,
      features: FEATURES.map((f) => {
        const v = f.value[tier];
        return { label: f.label, included: v !== false, detail: typeof v === "string" ? v : null };
      }),
    };
  });

  return {
    cards,
    taxIncluded: Boolean(share),
    taxNote: share ? "Prices include VAT for your country." : "Prices exclude any local tax, which is shown at checkout before you pay.",
  };
}

/** Allowances for the copy around the page. */
export const ALLOWANCES = ASK_MONTHLY_ALLOWANCE;
