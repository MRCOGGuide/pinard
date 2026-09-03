import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { siteUrl } from "@/lib/site";
import { isPaidTier } from "@/lib/pricing";
import { getBillingPrices } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = siteUrl(request);
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.redirect(`${origin}/pricing?error=unconfigured`, 303);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/sign-in`, 303);
  }

  const form = await request.formData();
  const tier = String(form.get("tier") ?? "");
  if (!isPaidTier(tier)) {
    return NextResponse.redirect(`${origin}/pricing?error=tier`, 303);
  }
  const prices = await getBillingPrices(supabase);
  const price = prices.find((p) => p.tier === tier)?.priceId;
  if (!price) {
    return NextResponse.redirect(`${origin}/pricing?error=unconfigured`, 303);
  }

  // Reuse or create the Stripe customer, stored on the profile.
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
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  // Founding-member coupon for the first 500 (Stripe enforces the cap).
  const coupon = process.env.STRIPE_FOUNDING_COUPON;
  // Stripe forbids combining an auto-applied coupon with a promo-code box.
  // So: apply the founding coupon automatically while it lasts; once it's
  // exhausted (or absent), let customers enter admin-created voucher codes.
  const baseParams = {
    mode: "subscription" as const,
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    subscription_data: { metadata: { user_id: user.id, tier } },
    success_url: `${origin}/account?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
  };

  try {
    if (coupon) {
      const session = await stripe.checkout.sessions.create({
        ...baseParams,
        discounts: [{ coupon }],
        subscription_data: {
          metadata: { user_id: user.id, tier, founding: "true" },
        },
      });
      return NextResponse.redirect(session.url!, 303);
    }
    const session = await stripe.checkout.sessions.create({
      ...baseParams,
      allow_promotion_codes: true,
    });
    return NextResponse.redirect(session.url!, 303);
  } catch {
    // Founding coupon exhausted/invalid — full price, promo codes allowed.
    const session = await stripe.checkout.sessions.create({
      ...baseParams,
      allow_promotion_codes: true,
    });
    return NextResponse.redirect(session.url!, 303);
  }
}
