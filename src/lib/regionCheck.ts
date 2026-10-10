import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { regionForCountry, SALES_BLOCKED_COUNTRIES, type Interval, type PaidTier, type Region } from "@/config/pricing";
import { planFromPrice, planLookupKey, priceIdFor } from "@/lib/catalogue";
import { emailIsConfigured, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site";

/**
 * The card decides the region (docs/PRICING-MODEL.md, version 2.1).
 *
 * The price a visitor sees is chosen from their IP address and browser
 * before checkout. After payment, the card's issuing country (for Apple
 * Pay and Google Pay, the card inside the wallet) is the deciding
 * signal:
 *
 * - First payment, card from a dearer region (or a country Pinard does
 *   not sell to): refunded in full, the plan ended, and the customer
 *   invited to subscribe at their own price. Nobody keeps a cheaper
 *   region's price their card does not support.
 * - Any other mismatch (a renewal, a changed card, or a card from a
 *   cheaper region): the customer is told by email, and the new price
 *   applies from the first renewal at least 30 days later, as the
 *   Terms promise. They can cancel before then.
 *
 * Prepaid cards, and cards whose type Stripe cannot tell, count as
 * Standard: they are the easy way to reach a cheaper price.
 */
const RANK: Record<Region, number> = { lower: 1, mid: 2, standard: 3 };
const NOTICE_DAYS = 30;

export type CardFacts = { country: string | null; funding: string | null; region: Region };

export function regionForCard(country: string | null, funding: string | null): Region {
  if (!country || funding === "prepaid" || !funding || funding === "unknown") return "standard";
  return regionForCountry(country);
}

async function cardForPaymentIntent(stripe: Stripe, paymentIntent: string): Promise<CardFacts | null> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntent, { expand: ["latest_charge"] });
  const card = (pi.latest_charge as Stripe.Charge | null)?.payment_method_details?.card;
  if (!card) return null;
  const country = card.country ?? null;
  const funding = card.funding ?? null;
  return { country, funding, region: regionForCard(country, funding) };
}

async function notify(to: string | null | undefined, subject: string, text: string) {
  if (!to || !emailIsConfigured()) return;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1C2421;max-width:520px">${text
    .split("\n\n")
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
    .join("")}</div>`;
  await sendEmail({ to, subject, text, html });
}

async function log(admin: SupabaseClient, userId: string | null, message: string) {
  await admin.from("feedback").insert({ user_id: userId, path: "region-check", message });
}

/** What to do about a paid invoice, from the facts alone. */
export function decideRegionAction(
  billingReason: string | null | undefined,
  card: { region: Region; country: string | null },
  priceRegion: Region
): "refund" | "notice" | "ok" {
  const blocked = card.country ? SALES_BLOCKED_COUNTRIES.includes(card.country) : false;
  if (billingReason === "subscription_create" && (blocked || RANK[card.region] > RANK[priceRegion])) return "refund";
  if (card.region !== priceRegion) return "notice";
  return "ok";
}

/**
 * Called for every paid subscription invoice. Returns what it did, for
 * the tests and the log.
 */
export async function checkPaidInvoice(
  stripe: Stripe,
  admin: SupabaseClient,
  invoice: Stripe.Invoice,
  userId: string | null,
  email: string | null
): Promise<"ok" | "refunded" | "notice" | "skipped"> {
  const subRef = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id;
  if (!subscriptionId || invoice.amount_paid <= 0) return "skipped";

  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  const plan = planFromPrice(sub.items.data[0]?.price as Stripe.Price);
  if (!plan) return "skipped";

  const payments = await stripe.invoicePayments.list({ invoice: invoice.id!, limit: 5 });
  const piRef = payments.data.find((p) => p.status === "paid")?.payment.payment_intent;
  const paymentIntent = typeof piRef === "string" ? piRef : piRef?.id;
  if (!paymentIntent) return "skipped";
  const card = await cardForPaymentIntent(stripe, paymentIntent);
  if (!card) return "skipped";

  const blocked = card.country ? SALES_BLOCKED_COUNTRIES.includes(card.country) : false;
  const action = decideRegionAction(invoice.billing_reason, card, plan.region);

  if (action === "refund") {
    await stripe.refunds.create(
      { payment_intent: paymentIntent, reason: "requested_by_customer", metadata: { pinard: "region-check" } },
      { idempotencyKey: `region-check-${paymentIntent}` }
    );
    await stripe.subscriptions.cancel(subscriptionId).catch(() => undefined);
    await log(admin, userId, `Region check: card from ${card.country ?? "unknown"} (${card.funding}) paid the ${plan.region} price for ${plan.tier}; refunded in full and cancelled.`);
    await notify(
      email,
      "Your Pinard payment has been refunded",
      blocked
        ? "Thank you for subscribing to Pinard. We are not able to sell subscriptions in the country your card was issued in yet, so we have refunded your payment in full and ended the subscription. We are sorry for the trouble."
        : `Thank you for subscribing to Pinard. Prices vary by country and are set by the country your payment card was issued in. The price you paid was for a different country from your card's, so we have refunded it in full and ended that subscription.\n\nYou can subscribe again at the price for your card's country here: ${siteUrl()}/pricing`
    );
    return "refunded";
  }

  if (action === "notice") {
    await startRegionNotice(admin, userId, email, card.region, card.country);
    return "notice";
  }
  return "ok";
}

/** A new card, or a renewal, that implies another region: tell the
 *  customer now; the price changes from a renewal 30 days or more away. */
export async function startRegionNotice(
  admin: SupabaseClient,
  userId: string | null,
  email: string | null,
  region: Region,
  country: string | null
): Promise<void> {
  if (!userId) return;
  const { data: sub } = await admin.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  if (!sub || sub.plan_region === region || sub.pending_region === region) return;
  await admin
    .from("subscriptions")
    .update({ pending_region: region, region_notice_at: new Date().toISOString() })
    .eq("user_id", userId);
  await log(admin, userId, `Region check: card from ${country ?? "unknown"} implies the ${region} price; notice sent, applies from a renewal ${NOTICE_DAYS} or more days away.`);
  await notify(
    email,
    "A change to your Pinard price",
    `Pinard's prices vary by country and are set by the country your payment card was issued in. The card on your account was issued in a country with a different price from the one you pay now.\n\nThe new price will apply from your first renewal at least ${NOTICE_DAYS} days from today. Nothing changes before then, and you can change your card or cancel at any time from your account: ${siteUrl()}/account`
  );
}

/** On the upcoming-invoice event: apply a region change whose notice
 *  period has run. No proration: the new price starts with the period. */
export async function applyDueRegionChange(stripe: Stripe, admin: SupabaseClient, subscriptionId: string): Promise<boolean> {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("stripe_subscription_id", subscriptionId).maybeSingle();
  if (!sub?.pending_region || !sub.region_notice_at) return false;
  if (Date.now() - Date.parse(sub.region_notice_at as string) < NOTICE_DAYS * 86_400_000) return false;

  const live = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  const item = live.items.data[0];
  const plan = planFromPrice(item?.price as Stripe.Price);
  if (!item || !plan) return false;
  const price = await priceIdFor(stripe, planLookupKey(plan.tier as PaidTier, plan.interval as Interval, sub.pending_region as Region));
  if (!price) return false;
  await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: item.id, price }],
    proration_behavior: "none",
    metadata: { ...live.metadata, region: sub.pending_region as string },
  });
  await admin
    .from("subscriptions")
    .update({ plan_region: sub.pending_region, pending_region: null, region_notice_at: null })
    .eq("stripe_subscription_id", subscriptionId);
  return true;
}

export async function cardFactsForPaymentMethod(stripe: Stripe, paymentMethodId: string): Promise<CardFacts | null> {
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (!pm.card) return null;
  const country = pm.card.country ?? null;
  const funding = pm.card.funding ?? null;
  return { country, funding, region: regionForCard(country, funding) };
}
