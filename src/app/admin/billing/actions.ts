"use server";

import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { requireAdmin } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { isPaidTier, type PaidTier } from "@/lib/pricing";

const RECURRENCE: Record<PaidTier, { interval: "month" | "year"; count: number }> = {
  monthly: { interval: "month", count: 1 },
  quarterly: { interval: "month", count: 3 },
  annual: { interval: "year", count: 1 },
};

async function ensureProduct(stripe: Stripe): Promise<string> {
  const found = await stripe.products.search({
    query: "metadata['app']:'pinard'",
  });
  if (found.data.length > 0) return found.data[0].id;
  const product = await stripe.products.create({
    name: "Pinard subscription",
    metadata: { app: "pinard" },
  });
  return product.id;
}

/**
 * Change a tier's price. Stripe prices are immutable, so this creates a
 * new price at the new amount, transfers the lookup key, archives the old
 * one, and points the app at the new price.
 */
export async function updatePrice(input: {
  tier: string;
  amountPence: number;
  cadence: string;
  note: string;
}) {
  const { supabase } = await requireAdmin();
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured" };
  if (!isPaidTier(input.tier)) return { error: "Unknown tier" };
  const amount = Math.round(input.amountPence);
  if (!Number.isFinite(amount) || amount < 50) {
    return { error: "Enter an amount of at least £0.50 (in pence)" };
  }

  try {
    const { data: existing } = await supabase
      .from("billing_prices")
      .select("stripe_price_id")
      .eq("tier", input.tier)
      .maybeSingle();
    const oldPriceId = existing?.stripe_price_id as string | undefined;

    let productId: string;
    if (oldPriceId) {
      const old = await stripe.prices.retrieve(oldPriceId);
      productId =
        typeof old.product === "string" ? old.product : old.product.id;
    } else {
      productId = await ensureProduct(stripe);
    }

    const rec = RECURRENCE[input.tier];
    const price = await stripe.prices.create({
      product: productId,
      currency: "gbp",
      unit_amount: amount,
      tax_behavior: "inclusive",
      recurring: { interval: rec.interval, interval_count: rec.count },
      lookup_key: `pinard_${input.tier}`,
      transfer_lookup_key: true,
    });

    if (oldPriceId && oldPriceId !== price.id) {
      await stripe.prices.update(oldPriceId, { active: false }).catch(() => {});
    }

    const { error } = await supabase.from("billing_prices").upsert(
      {
        tier: input.tier,
        amount_pence: amount,
        cadence: input.cadence,
        note: input.note,
        stripe_price_id: price.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tier" }
    );
    if (error) return { error: error.message };

    revalidatePath("/admin/billing");
    revalidatePath("/pricing");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Stripe error" };
  }
}

/**
 * Create a discount: a coupon, plus an optional customer-facing voucher
 * code. Customers enter the code at checkout.
 */
export async function createDiscount(input: {
  name: string;
  kind: "percent" | "amount";
  value: number; // percent (1–100) or pence
  duration: "once" | "repeating" | "forever";
  durationInMonths?: number;
  code?: string;
  maxRedemptions?: number;
}) {
  await requireAdmin();
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured" };
  if (!input.name.trim()) return { error: "Give the discount a name" };

  try {
    const couponParams: Stripe.CouponCreateParams = {
      name: input.name.trim(),
      duration: input.duration,
    };
    if (input.kind === "percent") {
      if (input.value < 1 || input.value > 100) {
        return { error: "Percent must be between 1 and 100" };
      }
      couponParams.percent_off = input.value;
    } else {
      if (input.value < 1) return { error: "Amount must be at least 1p" };
      couponParams.amount_off = Math.round(input.value);
      couponParams.currency = "gbp";
    }
    if (input.duration === "repeating") {
      couponParams.duration_in_months = Math.max(1, input.durationInMonths ?? 1);
    }
    if (input.maxRedemptions && input.maxRedemptions > 0) {
      couponParams.max_redemptions = Math.round(input.maxRedemptions);
    }

    const coupon = await stripe.coupons.create(couponParams);

    if (input.code && input.code.trim()) {
      await stripe.promotionCodes.create({
        promotion: { type: "coupon", coupon: coupon.id },
        code: input.code.trim().toUpperCase(),
        ...(input.maxRedemptions && input.maxRedemptions > 0
          ? { max_redemptions: Math.round(input.maxRedemptions) }
          : {}),
      });
    }

    revalidatePath("/admin/billing");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Stripe error" };
  }
}

export async function deactivatePromo(promoId: string) {
  await requireAdmin();
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured" };
  try {
    await stripe.promotionCodes.update(promoId, { active: false });
    revalidatePath("/admin/billing");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Stripe error" };
  }
}
