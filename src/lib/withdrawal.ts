import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailIsConfigured } from "@/lib/email";
import { getLegalDetails } from "@/lib/legal";

/**
 * The withdrawal function (Phase 11).
 *
 * Since 19 June 2026 an EU trader who sells through a website must give
 * consumers a "withdraw from contract" button for the whole 14-day
 * withdrawal period (Consumer Rights Directive article 11a, added by
 * Directive 2023/2673; section 115A of Ireland's Consumer Rights Act
 * 2022, inserted by S.I. 309 of 2026). Pressing it leads to a
 * confirmation step, and the trader acknowledges the withdrawal on a
 * durable medium, which here is an email.
 *
 * What can be withdrawn from, worked out from Stripe each time rather
 * than stored, so the list cannot drift from what was actually paid:
 *
 * - a subscription's first payment, within 14 days of it. Renewals are
 *   not new contracts and are not listed. Withdrawing ends the plan at
 *   once and refunds that payment in full: the owner's 14-day full
 *   refund promise is more generous than the law, which would allow a
 *   charge for the days used.
 * - an Ask Pinard top-up, within 14 days, while none of its questions
 *   has been used. Buying one includes the acknowledgement that the
 *   right ends once a question is used (the top-up form says so).
 */

const WINDOW_MS = 14 * 86_400_000;

export type WithdrawableItem = {
  id: string;
  kind: "subscription" | "topup";
  label: string;
  amount: number;
  currency: string;
  purchasedAt: string;
  /** The last moment the button is offered. */
  until: string;
};

type Resolved = WithdrawableItem & {
  paymentIntent: string;
  subscriptionId?: string;
  creditRowId?: number;
};

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

async function refundedAlready(stripe: Stripe, paymentIntent: string): Promise<{ refunded: boolean; amount: number; currency: string }> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntent, { expand: ["latest_charge"] });
  const charge = pi.latest_charge as Stripe.Charge | null;
  return {
    refunded: pi.status !== "succeeded" || Boolean(charge && charge.amount_refunded > 0),
    amount: pi.amount_received,
    currency: pi.currency,
  };
}

async function resolve(userId: string): Promise<{ stripe: Stripe; items: Resolved[] } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  const customer = profile?.stripe_customer_id as string | undefined;
  if (!customer) return { stripe, items: [] };

  const since = Date.now() - WINDOW_MS;
  const items: Resolved[] = [];

  // Subscriptions: the first invoice of each, paid in the last 14 days.
  const invoices = await stripe.invoices.list({
    customer,
    status: "paid",
    created: { gte: Math.floor(since / 1000) },
    limit: 20,
  });
  for (const inv of invoices.data) {
    if (inv.billing_reason !== "subscription_create" || inv.amount_paid <= 0) continue;
    const sub = inv.parent?.subscription_details?.subscription;
    const subscriptionId = typeof sub === "string" ? sub : sub?.id;
    const payments = await stripe.invoicePayments.list({ invoice: inv.id!, limit: 5 });
    const paid = payments.data.find((p) => p.status === "paid" && p.payment.payment_intent);
    const pi = paid?.payment.payment_intent;
    const paymentIntent = typeof pi === "string" ? pi : pi?.id;
    if (!paymentIntent || !subscriptionId) continue;
    const state = await refundedAlready(stripe, paymentIntent);
    if (state.refunded) continue;
    const purchased = inv.status_transitions?.paid_at ?? inv.created;
    items.push({
      id: `sub:${inv.id}`,
      kind: "subscription",
      label: "Pinard subscription",
      amount: inv.amount_paid,
      currency: inv.currency,
      purchasedAt: new Date(purchased * 1000).toISOString(),
      until: new Date(purchased * 1000 + WINDOW_MS).toISOString(),
      paymentIntent,
      subscriptionId,
    });
  }

  // Top-ups: bought in the last 14 days, not one question used.
  const { data: credits } = await admin
    .from("ask_credits")
    .select("id, granted, used, purchased_at, stripe_payment_ref")
    .eq("user_id", userId)
    .eq("used", 0)
    .gte("purchased_at", new Date(since).toISOString());
  for (const row of credits ?? []) {
    const ref = String(row.stripe_payment_ref ?? "");
    if (!ref.startsWith("pi_")) continue;
    const state = await refundedAlready(stripe, ref);
    if (state.refunded) continue;
    items.push({
      id: `topup:${row.id}`,
      kind: "topup",
      label: `Ask Pinard top-up (${row.granted} questions)`,
      amount: state.amount,
      currency: state.currency,
      purchasedAt: row.purchased_at as string,
      until: new Date(Date.parse(row.purchased_at as string) + WINDOW_MS).toISOString(),
      paymentIntent: ref,
      creditRowId: row.id as number,
    });
  }

  return { stripe, items };
}

/** What the Account page offers. Empty on any failure: a Stripe outage
 *  must not break the page, and the email route still works. */
export async function withdrawableItems(userId: string): Promise<WithdrawableItem[]> {
  try {
    const found = await resolve(userId);
    // Only what the page shows: payment references stay on the server.
    return (found?.items ?? []).map((i) => ({
      id: i.id,
      kind: i.kind,
      label: i.label,
      amount: i.amount,
      currency: i.currency,
      purchasedAt: i.purchasedAt,
      until: i.until,
    }));
  } catch (error) {
    console.error("withdrawableItems failed:", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function withdraw(
  user: { id: string; email?: string | null; name?: string | null },
  itemId: string
): Promise<{ error?: string; refunded?: string }> {
  const found = await resolve(user.id);
  if (!found) return { error: "Payments are not set up here. Email us to withdraw." };
  const { stripe, items } = found;
  // Looked up again from Stripe, so only this account's own, still
  // eligible purchases can be withdrawn, whatever id is sent.
  const item = items.find((i) => i.id === itemId);
  if (!item) return { error: "That purchase can no longer be withdrawn from here. Email us and we will help." };

  const admin = createAdminClient();

  if (item.kind === "topup") {
    // Voided before the refund, and only if still unused, so a question
    // asked at the same moment cannot be both answered and refunded.
    const { data: row } = await admin
      .from("ask_credits")
      .select("granted")
      .eq("id", item.creditRowId!)
      .maybeSingle();
    const { data: voided } = await admin
      .from("ask_credits")
      .update({ used: Number(row?.granted ?? 0) })
      .eq("id", item.creditRowId!)
      .eq("used", 0)
      .select("id");
    if (!row || !voided?.length) {
      return { error: "One of these questions has just been used, so this top-up can no longer be withdrawn." };
    }
  }

  try {
    await stripe.refunds.create(
      {
        payment_intent: item.paymentIntent,
        reason: "requested_by_customer",
        metadata: { pinard: "withdrawal", user_id: user.id },
      },
      { idempotencyKey: `withdrawal-${item.paymentIntent}` }
    );
  } catch (error) {
    console.error("Withdrawal refund failed:", error instanceof Error ? error.message : error);
    if (item.kind === "topup") {
      await admin.from("ask_credits").update({ used: 0 }).eq("id", item.creditRowId!);
    }
    return { error: "The refund could not be made just now. Nothing has changed. Try again, or email us." };
  }

  if (item.kind === "subscription" && item.subscriptionId) {
    // Ended now, not at the period's end: withdrawal ends the contract.
    // The webhook records it, as for any cancellation.
    await stripe.subscriptions.cancel(item.subscriptionId).catch((error) => {
      console.error("Withdrawal cancel failed:", error instanceof Error ? error.message : error);
    });
  }

  const refunded = formatMoney(item.amount, item.currency);
  const when = new Date().toLocaleString("en-GB", { timeZone: "Europe/Dublin", dateStyle: "long", timeStyle: "short" });

  // The owner's record, in the list they already read.
  await admin.from("feedback").insert({
    user_id: user.id,
    path: "withdrawal",
    message: `Withdrawal from contract: ${item.label}, bought ${item.purchasedAt.slice(0, 10)}. ${refunded} refunded automatically (${item.paymentIntent}).`,
  });

  await acknowledge(user, item, refunded, when);
  return { refunded };
}

/** The acknowledgement on a durable medium the law asks for, with a
 *  copy to the owner's contact address. */
async function acknowledge(
  user: { email?: string | null; name?: string | null },
  item: WithdrawableItem,
  refunded: string,
  when: string
) {
  if (!emailIsConfigured() || !user.email) return;
  const details = await getLegalDetails();
  const trader = [details.legal_name, details.legal_trading_name].filter(Boolean).join(", trading as ");
  const lines = [
    `We received your withdrawal from contract on ${when} (Irish time).`,
    `Contract: ${item.label}, bought on ${new Date(item.purchasedAt).toLocaleDateString("en-GB", { dateStyle: "long" })}.`,
    `Refund: ${refunded}, to your original payment method. Banks usually take 5 to 10 working days to show it.`,
    item.kind === "subscription" ? "Your plan has ended and you will not be charged again." : "The top-up questions have been removed from your account.",
    `${trader || "Pinard"}${details.legal_address ? `, ${details.legal_address.replace(/\n/g, ", ")}` : ""}${details.legal_email ? `. Questions: ${details.legal_email}` : ""}`,
  ];
  const text = `Hello${user.name ? ` ${user.name}` : ""},\n\n${lines.join("\n\n")}\n`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1C2421;max-width:520px">${text
    .split("\n\n")
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
  const subject = "Your withdrawal from Pinard is confirmed";
  await sendEmail({ to: user.email, subject, text, html });
  if (details.legal_email) {
    await sendEmail({ to: details.legal_email, subject: `Copy: ${subject}`, text: `Sent to ${user.email}.\n\n${text}`, html });
  }
}
