"use server";

import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { requireAdmin } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { savePricingSettings, OFFER_COUPON } from "@/lib/offer";
import { readSetting, writeSetting } from "@/lib/settings";
import {
  FOUNDING_OFFER_MAX_PERCENT,
  FOUNDING_OFFER_TIERS,
  PAID_TIERS,
  TOP_UPS,
  foundingOfferApplies,
  planFloorCents,
  topUpFloorCents,
  type Interval,
  type PaidTier,
  type Region,
  type TopUpId,
} from "@/config/pricing";
import { forgetPriceIds, planLookupKey, topUpLookupKey } from "@/lib/catalogue";
import { savePlanPrice, saveTopUpPrice } from "@/lib/prices";

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

/**
 * Change one plan's price (owner's request, 12 October 2026: the price
 * editor came back after the four-tier work had taken it away).
 *
 * Stripe prices cannot be edited, so a new one is made with the same
 * product, period, tax treatment and metadata, the lookup key checkout
 * uses is moved to it, the region's billing portal is pointed at it,
 * and the old one is archived. Existing subscribers stay on the price
 * they signed up on. Only then is the amount kept for the site to show,
 * so the page never advertises a price the till does not charge.
 *
 * Refused below the cost floor, and below it once the founding offer's
 * largest discount is taken off a plan the offer reaches.
 */
export async function updatePlanPrice(input: {
  region: Region;
  tier: PaidTier;
  interval: Interval;
  cents: number;
}): Promise<{ error?: string }> {
  await requireAdmin();
  const { region, tier, interval } = input;
  const cents = Math.round(Number(input.cents));
  if (!["standard", "mid", "lower"].includes(region) || !PAID_TIERS.includes(tier) || !["month", "quarter"].includes(interval)) {
    return { error: "Unknown plan." };
  }
  if (!Number.isInteger(cents) || cents < 100) return { error: "Enter a price in euro." };
  const floor = planFloorCents(tier, interval, region);
  if (cents < floor) {
    return { error: `€${(cents / 100).toFixed(2)} is below the cost floor for this plan (€${(floor / 100).toFixed(2)}): at full use it would not cover its costs plus 30%.` };
  }
  if (foundingOfferApplies(tier, interval, region)) {
    const offered = Math.round(cents * (1 - FOUNDING_OFFER_MAX_PERCENT / 100));
    if (offered < floor) {
      return { error: `With the founding offer's ${FOUNDING_OFFER_MAX_PERCENT}% off, this plan would sell at €${(offered / 100).toFixed(2)}, below its cost floor of €${(floor / 100).toFixed(2)}. Choose at least €${Math.ceil(floor / (1 - FOUNDING_OFFER_MAX_PERCENT / 100) / 100)}.` };
    }
  }
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };
  try {
    await replaceStripePrice(stripe, planLookupKey(tier, interval, region), cents, region);
  } catch (error) {
    return { error: `Stripe refused the change: ${error instanceof Error ? error.message : String(error)}` };
  }
  const saved = await savePlanPrice(region, tier, interval, cents);
  if (saved.error) return { error: `Stripe now charges the new price, but the site could not save it: ${saved.error}. Try again.` };
  revalidateBilling();
  return {};
}

/** Change a top-up pack's price, the same way. */
export async function updateTopUpPrice(input: { id: TopUpId; cents: number }): Promise<{ error?: string }> {
  await requireAdmin();
  const pack = TOP_UPS.find((t) => t.id === input.id);
  if (!pack) return { error: "Unknown top-up." };
  const cents = Math.round(Number(input.cents));
  if (!Number.isInteger(cents) || cents < 100) return { error: "Enter a price in euro." };
  const floor = topUpFloorCents(pack.questions);
  if (cents < floor) {
    return { error: `€${(cents / 100).toFixed(2)} is below the cost floor for ${pack.questions} questions (€${(floor / 100).toFixed(2)}).` };
  }
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe is not configured." };
  try {
    await replaceStripePrice(stripe, topUpLookupKey(pack.id), cents, null);
  } catch (error) {
    return { error: `Stripe refused the change: ${error instanceof Error ? error.message : String(error)}` };
  }
  const saved = await saveTopUpPrice(pack.id, cents);
  if (saved.error) return { error: `Stripe now charges the new price, but the site could not save it: ${saved.error}. Try again.` };
  revalidateBilling();
  return {};
}

async function replaceStripePrice(stripe: Stripe, lookupKey: string, cents: number, region: Region | null) {
  const old = (await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })).data[0];
  if (!old) throw new Error(`no price with lookup key ${lookupKey}: run scripts/stripe-tiers-setup.mjs first`);
  if (old.unit_amount === cents && old.active) return;
  const created = await stripe.prices.create({
    product: typeof old.product === "string" ? old.product : old.product.id,
    currency: old.currency,
    unit_amount: cents,
    tax_behavior: old.tax_behavior === "inclusive" ? "inclusive" : "exclusive",
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    metadata: old.metadata,
    ...(old.recurring
      ? { recurring: { interval: old.recurring.interval, interval_count: old.recurring.interval_count } }
      : {}),
  });
  // The region's portal offers plan changes by price id: point it at the new one.
  if (region) {
    const configs = (await stripe.billingPortal.configurations.list({ active: true, limit: 100 })).data;
    const found = configs.find((c) => c.metadata?.pinard_region === region);
    // The price lists are only returned when asked for.
    const config = found
      ? await stripe.billingPortal.configurations.retrieve(found.id, { expand: ["features.subscription_update.products"] })
      : null;
    const products = config?.features.subscription_update.products ?? [];
    if (config && products.some((p) => p.prices.includes(old.id))) {
      await stripe.billingPortal.configurations.update(config.id, {
        features: {
          subscription_update: {
            products: products.map((p) => ({
              product: p.product,
              prices: p.prices.map((id) => (id === old.id ? created.id : id)),
              ...(p.adjustable_quantity
                ? {
                    adjustable_quantity: {
                      enabled: p.adjustable_quantity.enabled,
                      ...(p.adjustable_quantity.maximum != null ? { maximum: p.adjustable_quantity.maximum } : {}),
                      ...(p.adjustable_quantity.minimum != null ? { minimum: p.adjustable_quantity.minimum } : {}),
                    },
                  }
                : {}),
            })),
          },
        },
      });
    }
  }
  if (old.id !== created.id) await stripe.prices.update(old.id, { active: false });
  forgetPriceIds();
}

function revalidateBilling() {
  revalidatePath("/pricing");
  revalidatePath("/");
  revalidatePath("/terms");
  revalidatePath("/account");
  revalidatePath("/admin/billing");
}
