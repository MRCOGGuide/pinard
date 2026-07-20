/**
 * Pricing tiers (GBP, VAT-inclusive) — PROJECT.md section 4. Display copy
 * lives here; Stripe price IDs come from env (created by the setup script).
 */

export type PaidTier = "monthly" | "quarterly" | "annual";

export type TierInfo = {
  name: string;
  price: string;
  cadence: string;
  note: string;
  popular: boolean;
  priceEnv: string;
};

export const PAID_TIERS: Record<PaidTier, TierInfo> = {
  monthly: {
    name: "Monthly",
    price: "£16.99",
    cadence: "/month",
    note: "Flexible — cancel any time.",
    popular: false,
    priceEnv: "STRIPE_PRICE_MONTHLY",
  },
  quarterly: {
    name: "Quarterly",
    price: "£39.99",
    cadence: " (£13.33/mo)",
    note: "Matches a typical 10–14-week revision cycle.",
    popular: true,
    priceEnv: "STRIPE_PRICE_QUARTERLY",
  },
  annual: {
    name: "Annual",
    price: "£99.99",
    cadence: "/year",
    note: "For trainees spanning two sittings or parts.",
    popular: false,
    priceEnv: "STRIPE_PRICE_ANNUAL",
  },
};

export const PAID_TIER_ORDER: PaidTier[] = ["monthly", "quarterly", "annual"];

export function isPaidTier(value: string): value is PaidTier {
  return value === "monthly" || value === "quarterly" || value === "annual";
}

export function priceIdFor(tier: PaidTier): string | undefined {
  return process.env[PAID_TIERS[tier].priceEnv];
}
