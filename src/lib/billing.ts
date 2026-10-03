import { createAdminClient } from "@/lib/supabase/admin";
import {
  PAID_TIERS,
  PAID_TIER_ORDER,
  priceIdFor,
  type PaidTier,
} from "@/lib/pricing";

/**
 * Live pricing, sourced from the admin-editable billing_prices table with
 * a fallback to the static defaults + env price IDs. Shared by the public
 * pricing page, the paywall and Checkout.
 */

export type TierPricing = {
  tier: PaidTier;
  name: string;
  amountPence: number;
  formatted: string;
  cadence: string;
  note: string;
  popular: boolean;
  priceId: string | undefined;
};

export function formatGBP(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

const DEFAULT_PENCE: Record<PaidTier, number> = {
  monthly: 1699,
  quarterly: 3999,
  annual: 9999,
};

/**
 * Takes no client, and reads with the service role.
 *
 * It used to take the caller's, which meant the signed-out pricing
 * page read this table with the key that ships in the browser — and
 * that only worked because the table carried `for select using (true)`.
 * An audit with the anon key found it: a stranger could list every
 * row, Stripe price ids included. Prices are not a secret, but nothing
 * in a browser needs to fetch them, and a policy that opens a table to
 * the world because one server render was convenient is how the next
 * table gets opened too.
 */
export async function getBillingPrices(): Promise<TierPricing[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("billing_prices")
    .select("tier, amount_pence, cadence, note, stripe_price_id");
  const rows = new Map(
    ((data ?? []) as {
      tier: PaidTier;
      amount_pence: number;
      cadence: string;
      note: string;
      stripe_price_id: string | null;
    }[]).map((r) => [r.tier, r])
  );

  return PAID_TIER_ORDER.map((tier) => {
    const def = PAID_TIERS[tier];
    const row = rows.get(tier);
    const amountPence = row?.amount_pence ?? DEFAULT_PENCE[tier];
    return {
      tier,
      name: def.name,
      amountPence,
      formatted: formatGBP(amountPence),
      cadence: row?.cadence ?? def.cadence,
      note: row?.note ?? def.note,
      popular: def.popular,
      priceId: row?.stripe_price_id ?? priceIdFor(tier),
    };
  });
}
