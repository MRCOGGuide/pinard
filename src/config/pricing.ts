import "server-only";

/**
 * Pinard's plans in one place (pricing Phase 2): tiers, Ask Pinard
 * allowances, regional prices, top-up packs and the features each card
 * lists. Change a price or a limit here and nowhere else.
 *
 * Server-only on purpose: the price table for every region lives here,
 * and a visitor's browser is only ever sent its own price (see
 * docs/PRICING-MODEL.md, section 8). Pages pass what they need down as
 * props.
 *
 * Prices are euro cents, net of tax. Stripe adds tax on top for the
 * buyer's country and, as merchant of record, collects and pays it.
 * No tax rate appears anywhere in Pinard.
 *
 * The figures were approved by the owner on 10 October 2026 (version 2.1).
 */

export type Tier = "free" | "basic" | "plus" | "premium";
export type PaidTier = Exclude<Tier, "free">;
export type Interval = "month" | "quarter";
export type Region = "standard" | "mid" | "lower";

export const PAID_TIERS: PaidTier[] = ["basic", "plus", "premium"];
export const INTERVALS: Interval[] = ["quarter", "month"];

export const TIER_NAMES: Record<Tier, string> = {
  free: "Free",
  basic: "Basic",
  plus: "Plus",
  premium: "Premium",
};

/** The tier the pricing page recommends, and says so. Our recommendation,
 *  not a claim about what others buy. */
export const RECOMMENDED_TIER: PaidTier = "plus";

/** Ask Pinard questions included per month. The three-month plan gets
 *  three months' worth at once, usable at any point in the period. */
export const ASK_MONTHLY_ALLOWANCE: Record<Tier, number> = {
  free: 0,
  basic: 30,
  plus: 160,
  premium: 450,
};

/** Fair use on every tier: no more than this in one day (UTC). */
export const ASK_DAILY_FAIR_USE = 60;

export function askAllowanceFor(tier: Tier, interval: Interval | null): number {
  return ASK_MONTHLY_ALLOWANCE[tier] * (interval === "quarter" ? 3 : 1);
}

/** Net prices in euro cents: [monthly, three months]. */
export const PRICES: Record<Region, Record<PaidTier, Record<Interval, number>>> = {
  standard: {
    basic: { month: 1900, quarter: 4500 },
    plus: { month: 2900, quarter: 6900 },
    premium: { month: 4500, quarter: 10500 },
  },
  mid: {
    basic: { month: 1600, quarter: 3800 },
    plus: { month: 2600, quarter: 6200 },
    premium: { month: 4200, quarter: 9800 },
  },
  lower: {
    basic: { month: 1200, quarter: 2900 },
    plus: { month: 2200, quarter: 5300 },
    premium: { month: 3800, quarter: 9500 },
  },
};

export const CURRENCY = "eur";

/**
 * Countries by price region (ISO 3166 alpha-2). The whole EU and EEA is
 * Standard, always at one price. Any country not listed, and any doubt,
 * is Standard.
 */
const MID = ["MY", "ZA", "JO"];
const LOWER = ["IN", "PK", "BD", "LK", "NP", "EG", "NG", "GH", "KE"];

export function regionForCountry(country: string | null | undefined): Region {
  const c = (country ?? "").toUpperCase();
  if (MID.includes(c)) return "mid";
  if (LOWER.includes(c)) return "lower";
  return "standard";
}

/**
 * Countries Pinard does not sell to. Stripe, as merchant of record,
 * takes on the tax in 80+ countries but not in some others, where the
 * tax would stay with the owner (docs/PRICING-MODEL.md, version 2.1).
 * Empty by the owner's choice to sell worldwide; add a country here to
 * stop sales there, for example on the accountant's advice.
 */
export const SALES_BLOCKED_COUNTRIES: string[] = [];

/** Top-up packs: questions, net price in euro cents. Any paid tier. */
export const TOP_UPS = [
  { id: "topup_50", questions: 50, price: 500 },
  { id: "topup_150", questions: 150, price: 1200 },
] as const;
export type TopUpId = (typeof TOP_UPS)[number]["id"];

/** The founding offer (percent and places set in Admin > Billing)
 *  applies to these tiers only: on Premium it would fall below the
 *  cost floor (docs/PRICING-MODEL.md, version 2.1). */
export const FOUNDING_OFFER_TIERS: PaidTier[] = ["basic", "plus"];
/** Above this the offer breaks the floor; Admin refuses it. */
export const FOUNDING_OFFER_MAX_PERCENT = 30;

/**
 * What every card lists, in the same order, so the tiers compare at a
 * glance. Built from the app as it is (docs/PRICING-MODEL.md, section
 * 11): nothing here that the code does not do today.
 */
export type Feature = {
  key: string;
  label: string;
  /** Per tier: true, false, or the tier's own wording. */
  value: Record<Tier, boolean | string>;
};

export const FEATURES: Feature[] = [
  {
    key: "bank",
    label: "MRCOG Part 2 question bank, SBA and EMQ, with cited explanations",
    value: { free: "15 sample questions", basic: true, plus: true, premium: true },
  },
  {
    key: "diagnostic",
    label: "Diagnostic and topic map against the 70% line",
    value: { free: "Free diagnostic", basic: true, plus: true, premium: true },
  },
  {
    key: "plan",
    label: "Study plan built back from your exam date",
    value: { free: false, basic: true, plus: true, premium: true },
  },
  {
    key: "today",
    label: "Today's session and practice by section",
    value: { free: false, basic: true, plus: true, premium: true },
  },
  {
    key: "mock",
    label: "Timed mock papers at exam timings",
    value: { free: false, basic: true, plus: true, premium: true },
  },
  {
    key: "progress",
    label: "Progress, readiness and flagged questions",
    value: { free: false, basic: true, plus: true, premium: true },
  },
  {
    key: "reminders",
    label: "Reminder emails at a time you choose",
    value: { free: false, basic: true, plus: true, premium: true },
  },
  {
    key: "ask",
    label: "Ask Pinard: answers from the source library, with citations",
    value: {
      free: false,
      basic: "30 questions a month",
      plus: "160 questions a month",
      premium: "450 questions a month",
    },
  },
];
