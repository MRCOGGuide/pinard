import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { grantAskCredits } from "@/lib/askAllowance";
import { planFromPrice } from "@/lib/catalogue";
import { recordFunnel } from "@/lib/funnel";
import {
  applyDueRegionChange,
  cardFactsForPaymentMethod,
  checkPaidInvoice,
  startRegionNotice,
} from "@/lib/regionCheck";
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
  } catch {
    // Stripe's own message is not echoed back (security audit L4).
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
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

  async function upsertFromSubscription(fromEvent: Stripe.Subscription) {
    /*
      The subscription as it stands now, not as the event described it
      (security audit M4). Stripe does not promise to deliver events in
      order: a "subscription updated" sent before a cancellation can
      arrive after it, and writing the event's copy would switch a
      cancelled subscription back on. Asking Stripe for the current
      state makes every write the latest truth, whatever the order.
    */
    const sub = await stripe!.subscriptions.retrieve(fromEvent.id, { expand: ["items.data.price"] });
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

    /*
      Tier, billing period and region from the price itself (pricing
      Phase 2), so a change made in the billing portal is reflected the
      moment Stripe reports it, and nothing the browser said counts.
    */
    const item = sub.items?.data?.[0];
    const plan = planFromPrice(item?.price as Stripe.Price);
    const periodStartUnix = (item as { current_period_start?: number } | undefined)?.current_period_start ?? null;
    const row = {
      user_id: userId,
      provider: "stripe",
      status: sub.status,
      tier: plan?.tier ?? sub.metadata?.tier ?? "unknown",
      stripe_subscription_id: sub.id,
      founding_member: sub.metadata?.founding === "true",
      current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
      cancel_at: cancelAtUnix ? new Date(cancelAtUnix * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const { error: planError } = await supabase.from("subscriptions").upsert(
      {
        ...row,
        plan_interval: plan?.interval ?? null,
        plan_region: plan?.region ?? null,
        stripe_price_id: (item?.price as Stripe.Price | undefined)?.id ?? null,
        current_period_start: periodStartUnix ? new Date(periodStartUnix * 1000).toISOString() : null,
      },
      { onConflict: "user_id" }
    );
    // Before phase45 is run the plan columns do not exist: write the rest.
    if (planError) await supabase.from("subscriptions").upsert(row, { onConflict: "user_id" });

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
        await recordFunnel("checkout_completed", {
          tier: session.metadata?.tier ?? null,
          interval: session.metadata?.interval ?? null,
          region: session.metadata?.region ?? null,
          userId: session.metadata?.user_id ?? null,
          country: session.customer_details?.address?.country ?? null,
        });
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
            Math.max(1, Number(session.metadata?.questions) || 50),
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
      // Ended in Stripe's own record too, so a late copy of this event
      // cannot undo a later resubscription: the current state is read
      // and written like any update.
      const sub = event.data.object as Stripe.Subscription;
      const current = await stripe.subscriptions.retrieve(sub.id).catch(() => null);
      if (current && current.status !== "canceled") {
        await upsertFromSubscription(current);
        break;
      }
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
    case "invoice.paid": {
      // The card-country safety net (lib/regionCheck).
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null);
      const userId = await userIdFor(customerId);
      await checkPaidInvoice(stripe, supabase, invoice, userId, invoice.customer_email ?? null);
      break;
    }
    case "invoice.upcoming": {
      // A region change whose 30 days' notice has run applies from here.
      const invoice = event.data.object as Stripe.Invoice;
      const subRef = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id;
      if (subscriptionId) await applyDueRegionChange(stripe, supabase, subscriptionId);
      break;
    }
    case "payment_method.attached": {
      // A new card is checked straight away; any change of price waits
      // for a renewal at least 30 days after the notice.
      const pm = event.data.object as Stripe.PaymentMethod;
      const customerId = typeof pm.customer === "string" ? pm.customer : (pm.customer?.id ?? null);
      const userId = await userIdFor(customerId);
      if (userId && pm.card) {
        const facts = await cardFactsForPaymentMethod(stripe, pm.id);
        const { data: sub } = await supabase.from("subscriptions").select("status").eq("user_id", userId).maybeSingle();
        if (facts && sub && ["active", "trialing", "past_due"].includes(sub.status as string)) {
          const email = typeof pm.billing_details?.email === "string" ? pm.billing_details.email : null;
          await startRegionNotice(supabase, userId, email, facts.region, facts.country);
        }
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
