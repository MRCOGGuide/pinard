import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { grantAskCredits } from "@/lib/askAllowance";
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

    // A cancelled subscription stays active to the end of the paid
    // period, so "when does this stop?" is a different question from
    // "when does this renew?". Recent API versions carry the answer in
    // cancel_at; older ones only set a flag, and the period end is the
    // date. Null means it is still renewing.
    const cancelAtUnix =
      sub.cancel_at ?? (sub.cancel_at_period_end ? periodEndUnix : null);

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
        cancel_at: cancelAtUnix
          ? new Date(cancelAtUnix * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Top-up questions follow the subscription rather than the period
    // they were bought in: renew, and the ones still unspent come with
    // you. Only live credits are carried — a subscription taken out
    // again months after lapsing does not revive expired ones.
    if (periodEndUnix) {
      await rollAskCreditsForward(
        userId,
        new Date(periodEndUnix * 1000).toISOString()
      );
    }
  }

  /**
   * Move unspent top-ups to the end of the period just paid for.
   *
   * Rolled forward rather than expired with the period they were bought
   * in: a quarterly subscriber who renews keeps whatever they have not
   * used. Only live credits move — a subscription taken out again long
   * after lapsing does not revive credits that expired in between —
   * with a few days' grace so that a renewal webhook arriving after the
   * old period ended is still treated as a renewal.
   */
  async function rollAskCreditsForward(userId: string, periodEnd: string) {
    const GRACE_DAYS = 3;
    const cutoff = new Date(
      Date.now() - GRACE_DAYS * 86_400_000
    ).toISOString();

    const { data: rows } = await supabase
      .from("ask_credits")
      .select("id, granted, used, expires_at")
      .eq("user_id", userId);

    const ids = (rows ?? [])
      .filter((row) => {
        if (Number(row.used) >= Number(row.granted)) return false;
        const expires = row.expires_at as string | null;
        if (!expires) return true; // no expiry yet: give it this one
        if (expires <= cutoff) return false; // long gone
        return expires < periodEnd; // live, and this period runs longer
      })
      .map((row) => row.id as number);

    if (ids.length === 0) return;
    await supabase
      .from("ask_credits")
      .update({ expires_at: periodEnd })
      .in("id", ids);
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

      // An Ask Pinard top-up: a one-off payment, not a subscription.
      // The questions last as long as the period already paid for, so
      // the expiry is read from the live subscription rather than being
      // a month from now — someone on a quarterly plan who buys in week
      // two still has them in week eleven.
      if (session.mode === "payment" && session.metadata?.kind === "ask_topup") {
        const userId = await userIdFor(
          typeof session.customer === "string"
            ? session.customer
            : (session.customer?.id ?? null),
          session.metadata?.user_id
        );
        if (userId) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("current_period_end")
            .eq("user_id", userId)
            .maybeSingle();
          await grantAskCredits(
            supabase,
            userId,
            // Idempotent on the payment: Stripe retries webhooks, and a
            // retry must not grant a second hundred questions.
            (session.payment_intent as string) ?? session.id,
            (sub?.current_period_end as string | null) ?? null
          );
        }
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
