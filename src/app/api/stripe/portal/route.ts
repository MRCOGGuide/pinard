import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { siteUrl } from "@/lib/site";
import { portalConfigFor } from "@/lib/catalogue";
import type { Region } from "@/config/pricing";

export const runtime = "nodejs";

/**
 * The billing portal: change plan, update the card, cancel. Opened with
 * the configuration for the customer's own price region, so it offers
 * only their region's prices (scripts/stripe-tiers-setup.mjs).
 */
export async function POST(request: Request) {
  const origin = siteUrl(request);
  const stripe = getStripe();
  if (!stripe) return NextResponse.redirect(`${origin}/account`, 303);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/sign-in`, 303);

  const { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  if (!profile?.stripe_customer_id) return NextResponse.redirect(`${origin}/account`, 303);

  const { data: sub } = await createAdminClient().from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
  const region = ((sub?.plan_region as Region | null) ?? "standard") as Region;
  const configuration = await portalConfigFor(stripe, region);

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${origin}/account`,
    ...(configuration ? { configuration } : {}),
  });
  return NextResponse.redirect(session.url, 303);
}
