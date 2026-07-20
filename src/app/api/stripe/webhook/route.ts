import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Stripe webhook — the single source of truth for the subscriptions
 * table. Uses the service-role client (bypasses RLS). Verify the
 * signature before trusting anything.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "bad signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Resolve the app user for a Stripe customer.
  async function userIdFor(
    customerId: string | null,
    metaUserId?: string | null
  ): Promise<string | null> {
    if (metaUserId) return metaUserId;
    if (!customerId) return null;
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    return data?.id ?? null;
  }

  async function upsertFromSubscription(sub: Stripe.Subscription) {
    const userId = await userIdFor(
      typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      sub.metadata?.user_id
    );
    if (!userId) return;

    // The period end lives on the subscription item in recent API versions,
    // and on the subscription itself in older ones — read whichever is set.
    const periodEndUnix =
      (sub.items?.data?.[0] as { current_period_end?: number } | undefined)
        ?.current_period_end ??
      (sub as unknown as { current_period_end?: number }).current_period_end ??
      null;

    await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        provider: "stripe",
        status: sub.status,
        tier: sub.metadata?.tier ?? "unknown",
        stripe_subscription_id: sub.id,
        founding_member: sub.metadata?.founding === "true",
        current_period_end: periodEndUnix
          ? new Date(periodEndUnix * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        await upsertFromSubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await upsertFromSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await userIdFor(
        typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        sub.metadata?.user_id
      );
      if (userId) {
        await supabase
          .from("subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("user_id", userId);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
