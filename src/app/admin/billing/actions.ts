"use server";

import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { requireAdmin } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { savePricingSettings, OFFER_COUPON } from "@/lib/offer";
import { readSetting, writeSetting } from "@/lib/settings";
import { FOUNDING_OFFER_MAX_PERCENT, FOUNDING_OFFER_TIERS } from "@/config/pricing";

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
      couponParams.currency = "eur";
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

/**
 * The founding offer and the resit fee.
 *
 * The banner and the charge have to be the same offer. The page's
 * claim lives in app_settings, where the owner can change it; the
 * discount that is actually applied is a Stripe coupon with a
 * redemption cap that Stripe enforces. Letting those drift would mean
 * advertising 25% off to 100 people and charging whatever a coupon set
 * in an environment variable months ago happens to say.
 *
 * So saving writes both. A Stripe coupon's percentage and cap are
 * immutable, the same way a price is, so a change creates a new coupon
 * and the old one is deleted if nobody has used it; checkout then
 * prefers the id stored here over the environment variable.
 *
 * Without Stripe configured the settings still save, because the page
 * is the only thing that can act on them yet, and the caller is told
 * which of the two happened.
 */
async function foundingProducts(stripe: Stripe): Promise<string[]> {
  const ids: string[] = [];
  for (const tier of FOUNDING_OFFER_TIERS) {
    const found = await stripe.products.search({ query: `metadata['pinard_tier']:'${tier}'` });
    if (found.data[0]) ids.push(found.data[0].id);
  }
  if (ids.length === 0) throw new Error("tier products not found: run scripts/stripe-tiers-setup.mjs");
  return ids;
}

export async function saveFoundingOffer(input: {
  active: boolean;
  percent: number;
  places: number;
  resitFeePence: number | null;
  rates?: Record<string, number>;
}): Promise<{ error?: string; stripe?: "updated" | "unconfigured" | "failed" }> {
  await requireAdmin();
  // Above this the offer breaks the cost floor (docs/PRICING-MODEL.md, v2.1).
  if (input.active && input.percent > FOUNDING_OFFER_MAX_PERCENT) {
    return { error: `The founding offer can be at most ${FOUNDING_OFFER_MAX_PERCENT}% off: more would sell below cost.` };
  }
  const result = await savePricingSettings(input);
  if (result.error) return result;

  let stripeState: "updated" | "unconfigured" | "failed" = "unconfigured";
  const stripe = getStripe();
  if (stripe) {
    try {
      const previous = await readSetting(OFFER_COUPON);
      const coupon = await stripe.coupons.create({
        name: `Founding member ${input.percent}%`,
        percent_off: input.percent,
        duration: "once",
        max_redemptions: input.places,
        // Basic and Plus only: on Premium it falls below the cost floor.
        applies_to: { products: await foundingProducts(stripe) },
        metadata: { app: "pinard", offer: "founding" },
      });
      await writeSetting(OFFER_COUPON, coupon.id);
      /*
        Deleting a coupon does not undo a discount already given: Stripe
        keeps it on the subscriptions that used it. It only stops it
        being applied again, which is the point.
      */
      if (previous && previous !== coupon.id) {
        await stripe.coupons.del(previous).catch(() => {});
      }
      stripeState = "updated";
    } catch {
      stripeState = "failed";
    }
  }

  revalidatePath("/pricing");
  revalidatePath("/");
  revalidatePath("/admin/billing");
  return { stripe: stripeState };
}
