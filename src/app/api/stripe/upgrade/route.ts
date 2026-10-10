import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { siteUrl } from "@/lib/site";
import { planLookupKey, portalConfigFor, priceIdFor } from "@/lib/catalogue";
import { recordFunnel } from "@/lib/funnel";
import { PAID_TIERS, type Interval, type PaidTier, type Region } from "@/config/pricing";

export const runtime = "nodejs";

/**
 * One-tap upgrade from the Ask Pinard limit (pricing Phase 2, E).
 *
 * The browser names only the tier it wants. The server keeps the
 * customer's own billing period and region and opens Stripe's billing
 * portal straight on the confirmation of that change, which shows the
 * prorated amount before anything is charged. A free account is sent
 * to the pricing page instead.
 */
export async function POST(request: Request) {
  const origin = siteUrl(request);
  const stripe = getStripe();
  if (!stripe) return NextResponse.redirect(`${origin}/pricing`, 303);

  const form = await request.formData().catch(() => null);
  const tier = String(form?.get("tier") ?? "") as PaidTier;
  if (!PAID_TIERS.includes(tier)) return NextResponse.redirect(`${origin}/pricing`, 303);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/sign-in?next=${encodeURIComponent("/pricing")}`, 303);

  const { data: sub } = await createAdminClient().from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
  const live = sub && ["active", "trialing"].includes(sub.status as string) && sub.stripe_subscription_id;
  await recordFunnel("upgrade_clicked", { tier, userId: user.id });
  if (!live) return NextResponse.redirect(`${origin}/pricing`, 303);

  const interval = ((sub.plan_interval as Interval | null) ?? "month") as Interval;
  const region = ((sub.plan_region as Region | null) ?? "standard") as Region;
  const price = await priceIdFor(stripe, planLookupKey(tier, interval, region));
  const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id as string);
  const item = current.items.data[0];
  const { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  if (!price || !item || !profile?.stripe_customer_id) return NextResponse.redirect(`${origin}/account`, 303);

  const configuration = await portalConfigFor(stripe, region);
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${origin}/account`,
    ...(configuration ? { configuration } : {}),
    flow_data: {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: current.id,
        items: [{ id: item.id, price, quantity: 1 }],
      },
      after_completion: { type: "redirect", redirect: { return_url: `${origin}/account?plan=upgraded` } },
    },
  });
  return NextResponse.redirect(session.url, 303);
}
