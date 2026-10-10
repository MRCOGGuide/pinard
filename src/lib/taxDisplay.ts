import "server-only";
import { getStripe } from "@/lib/stripe";

/**
 * The tax a visitor's country adds, for showing prices with tax included
 * (pricing Phase 2). Worked out by Stripe Tax, never by Pinard: one
 * calculation per country on a fixed amount gives the share to add,
 * cached for twelve hours.
 *
 * Stripe Tax answers only for countries where the account has a tax
 * registration. In live mode that is Ireland with the EU One-Stop Shop,
 * which covers every EU country (docs/pricing/LIVE-CHECKLIST.md).
 * Elsewhere this returns null and the page shows the net price with
 * "plus any local tax, shown at checkout". At checkout Stripe, as
 * merchant of record, charges the tax that is actually due.
 */
const cache = new Map<string, { share: number | null; at: number }>();
const TTL = 12 * 60 * 60 * 1000;
const PROBE = 10000; // €100.00

export async function taxShareFor(country: string | null): Promise<number | null> {
  if (!country) return null;
  const hit = cache.get(country);
  if (hit && Date.now() - hit.at < TTL) return hit.share;
  const stripe = getStripe();
  if (!stripe) return null;
  let share: number | null = null;
  try {
    const calc = await stripe.tax.calculations.create({
      currency: "eur",
      customer_details: { address: { country }, address_source: "billing" },
      line_items: [{ amount: PROBE, reference: "price-display", tax_behavior: "exclusive", tax_code: "txcd_10000000" }],
    });
    share = calc.tax_amount_exclusive > 0 ? calc.tax_amount_exclusive / PROBE : null;
  } catch {
    share = null; // some countries need a full address: show the net price
  }
  cache.set(country, { share, at: Date.now() });
  return share;
}
