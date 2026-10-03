import type { PaidTier } from "@/lib/pricing";

/**
 * The sums a buyer does in their head, done for them.
 *
 * Three prices in a row is a menu, not an argument. What decides it is
 * arithmetic the reader would otherwise do badly on the back of an
 * envelope: what the annual actually saves against paying monthly, what
 * a quarter comes to per day, and what either costs beside sitting the
 * exam again.
 *
 * Computed from the live prices rather than written into the page, for
 * the same reason the library figures are counted: a saving typed into
 * a component is true until the day someone changes a price, and then
 * it is a claim about money that is wrong.
 */

/** Days in a month and a quarter, averaged over a year. */
const DAYS_PER_MONTH = 365.25 / 12;
const DAYS_PER_QUARTER = 365.25 / 4;
const DAYS_PER_YEAR = 365.25;

export function daysFor(tier: PaidTier): number {
  if (tier === "annual") return DAYS_PER_YEAR;
  if (tier === "quarterly") return DAYS_PER_QUARTER;
  return DAYS_PER_MONTH;
}

/** What a tier costs per day, in pence, to one decimal place. */
export function pencePerDay(amountPence: number, tier: PaidTier): number {
  const days = daysFor(tier);
  return Math.round((amountPence / days) * 10) / 10;
}

/** "44p" or "£1.12", whichever reads as money. */
export function formatPerDay(amountPence: number, tier: PaidTier): string {
  const pence = pencePerDay(amountPence, tier);
  if (pence < 100) return `${Math.round(pence)}p a day`;
  return `£${(pence / 100).toFixed(2)} a day`;
}

/**
 * What a longer cycle saves against paying monthly for the same span,
 * as a whole percentage. Returns null where the comparison cannot be
 * made, rather than a zero that reads as "saves nothing".
 */
export function savingAgainstMonthly(
  amountPence: number,
  tier: PaidTier,
  monthlyPence: number | undefined
): number | null {
  if (!monthlyPence || tier === "monthly") return null;
  const months = tier === "annual" ? 12 : 3;
  const atMonthly = monthlyPence * months;
  if (atMonthly <= 0 || amountPence >= atMonthly) return null;
  return Math.round(((atMonthly - amountPence) / atMonthly) * 100);
}

/**
 * How many times over a subscription fits inside the cost of sitting
 * the exam again. Whole number, and only where it is more than one:
 * "0.8 times the resit fee" is not an argument.
 */
export function timesTheResit(
  amountPence: number,
  resitFeePence: number | undefined
): number | null {
  if (!resitFeePence || resitFeePence <= 0 || amountPence <= 0) return null;
  const times = Math.floor(resitFeePence / amountPence);
  return times >= 2 ? times : null;
}

export function formatGBP(pence: number): string {
  return `£${(pence / 100).toFixed(2).replace(/\.00$/, "")}`;
}
