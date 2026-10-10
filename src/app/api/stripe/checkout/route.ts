import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { siteUrl } from "@/lib/site";
import { readSetting } from "@/lib/settings";
import { getPricingSettings, OFFER_COUPON } from "@/lib/offer";
import { displayRegion } from "@/lib/region";
import { planLookupKey, priceIdFor } from "@/lib/catalogue";
import { recordFunnel } from "@/lib/funnel";
import { withinRateLimit } from "@/lib/rateLimit";
import {
  FOUNDING_OFFER_TIERS,
  PAID_TIERS,
  SALES_BLOCKED_COUNTRIES,
  type Interval,
  type PaidTier,
} from "@/config/pricing";

export const runtime = "nodejs";

/**
 * Starting a subscription (pricing Phase 2).
 *
 * The browser sends a tier and a billing period and nothing else. The
 * price is chosen here, for the region the server decided (lib/region),
 * so no request can name another region's price: a request carrying a
 * country, region, currency or price is refused outright and logged.
 *
 * Checkout runs under Stripe Managed Payments, so Stripe (as Link) is
 * the merchant of record and works out, collects and pays the tax for
 * the buyer's country. Card wallets (Apple Pay, Google Pay) appear on
 * Stripe's page where the device supports them. The card's own country
 * is checked after payment by the webhook (lib/regionCheck).
 */
const FORBIDDEN = ["price", "price_id", "priceId", "country", "region", "currency", "lookup_key", "amount"];

export async function POST(request: Request) {
  const origin = siteUrl(request);
  const stripe = getStripe();
  if (!stripe) return NextResponse.redirect(`${origin}/pricing?error=unconfigured`, 303);

  if (!(await withinRateLimit("checkout", 20, 60 * 60 * 1000))) {
    return NextResponse.redirect(`${origin}/pricing?error=busy`, 303);
  }

  const form = await request.formData();
  const url = new URL(request.url);
  const tampered = FORBIDDEN.find((k) => form.has(k) || url.searchParams.has(k));
  if (tampered) {
    console.warn("checkout: refused a request carrying", tampered);
    return NextResponse.json({ error: "Not accepted" }, { status: 400 });
  }

  const tier = String(form.get("tier") ?? "") as PaidTier;
  const interval = String(form.get("interval") ?? "") as Interval;
  if (!PAID_TIERS.includes(tier) || !["month", "quarter"].includes(interval)) {
    return NextResponse.redirect(`${origin}/pricing?error=plan`, 303);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await recordFunnel("plan_chosen", { tier, interval, userId: user?.id ?? null });
  if (!user) {
    // Sign in first, then straight on to the plan chosen.
    const next = encodeURIComponent(`/pricing?continue=${tier}-${interval}`);
    return NextResponse.redirect(`${origin}/sign-in?next=${next}`, 303);
  }

  const { region, country } = await displayRegion();
  if (country && SALES_BLOCKED_COUNTRIES.includes(country)) {
    return NextResponse.redirect(`${origin}/pricing?error=country`, 303);
  }

  const admin = createAdminClient();

  // Already subscribed: changing plan happens in the billing portal, so
  // nobody ends up paying for two subscriptions at once.
  const { data: existing } = await admin
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing && ["active", "trialing", "past_due"].includes(existing.status as string)) {
    return NextResponse.redirect(`${origin}/account?plan=existing`, 303);
  }

  const price = await priceIdFor(stripe, planLookupKey(tier, interval, region));
  if (!price) return NextResponse.redirect(`${origin}/pricing?error=unconfigured`, 303);

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, name")
    .eq("id", user.id)
    .single();
  let customerId = profile?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: profile?.name || undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    // Set by the server only (security audit M5).
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  // The founding offer, on Basic and Plus only, while places remain.
  const settings = await getPricingSettings();
  const coupon = (await readSetting(OFFER_COUPON)) || process.env.STRIPE_FOUNDING_COUPON;
  const founding = Boolean(
    coupon && settings.offer.active && settings.offer.left > 0 && FOUNDING_OFFER_TIERS.includes(tier)
  );

  const metadata = { user_id: user.id, tier, interval, region, founding: founding ? "true" : "false" };
  const base = {
    mode: "subscription" as const,
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    managed_payments: { enabled: true },
    metadata,
    subscription_data: { metadata },
    success_url: `${origin}/account?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
  };

  let session;
  try {
    session = founding
      ? await stripe.checkout.sessions.create({ ...base, discounts: [{ coupon: coupon! }] })
      : await stripe.checkout.sessions.create({ ...base, allow_promotion_codes: true });
  } catch {
    // A founding coupon that has run out: full price, voucher box open.
    session = await stripe.checkout.sessions.create({ ...base, allow_promotion_codes: true });
  }

  await recordFunnel("checkout_started", { tier, interval, region, userId: user.id, country });
  return NextResponse.redirect(session.url!, 303);
}
