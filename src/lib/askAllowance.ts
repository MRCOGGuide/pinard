import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What Ask Pinard costs, and how much of it a subscription includes.
 *
 * Measured rather than guessed: an answer sends about 11,250 input
 * tokens — twelve retrieved passages — and returns about 275, which is
 * roughly 3p at Sonnet rates. At ten answers a month that is 30p and
 * not worth counting; at five hundred it is £15, which is more than an
 * annual subscriber pays in a month.
 *
 * So the allowance is set where almost nobody meets it and the tail is
 * capped: 100 questions a month, about £3 at the very top. Someone who
 * does meet it can buy another hundred rather than be turned away.
 */

/** Included with every paid plan, each calendar month. */
export const ASK_MONTHLY_LIMIT = 100;

/** What a top-up buys, and what it costs. */
export const ASK_TOPUP_QUESTIONS = 100;
export const ASK_TOPUP_PRICE_PENCE = 499;

/**
 * Offer the top-up at this many questions remaining.
 *
 * Late enough that a candidate who will never reach the limit is never
 * shown it, early enough that the offer arrives before the feature
 * stops rather than after.
 */
export const ASK_OFFER_AT = 15;

export type AskAllowance = {
  monthlyLimit: number;
  monthlyUsed: number;
  /** Unspent, unexpired top-up questions. */
  credits: number;
  /** Everything left: this month's balance plus credits. */
  remaining: number;
  /** Unlimited — an admin, testing the thing they built. */
  unlimited: boolean;
  /** Close enough to the limit to be worth offering more. */
  offerTopUp: boolean;
};

/** The month a question counts against: 'YYYY-MM', UTC. */
export function askMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

const UNLIMITED: AskAllowance = {
  monthlyLimit: Infinity,
  monthlyUsed: 0,
  credits: 0,
  remaining: Infinity,
  unlimited: true,
  offerTopUp: false,
};

/**
 * What this candidate has left. Reads only — spending is a single
 * statement in the database, because two answers in flight at once
 * would otherwise both read the same count and both write it back.
 */
export async function getAskAllowance(
  supabase: SupabaseClient,
  userId: string,
  isAdmin = false
): Promise<AskAllowance> {
  if (isAdmin) return UNLIMITED;

  const month = askMonth();
  const [{ data: usage }, { data: creditRows }] = await Promise.all([
    supabase
      .from("ask_usage")
      .select("used")
      .eq("user_id", userId)
      .eq("month", month)
      .maybeSingle(),
    supabase
      .from("ask_credits")
      .select("granted, used, expires_at")
      .eq("user_id", userId),
  ]);

  const monthlyUsed = Number(usage?.used ?? 0);
  const now = Date.now();
  const credits = (creditRows ?? []).reduce((total, row) => {
    const expires = row.expires_at ? Date.parse(row.expires_at as string) : null;
    if (expires !== null && expires <= now) return total;
    return total + Math.max(0, Number(row.granted) - Number(row.used));
  }, 0);

  const monthlyLeft = Math.max(0, ASK_MONTHLY_LIMIT - monthlyUsed);
  const remaining = monthlyLeft + credits;

  return {
    monthlyLimit: ASK_MONTHLY_LIMIT,
    monthlyUsed,
    credits,
    remaining,
    unlimited: false,
    offerTopUp: remaining <= ASK_OFFER_AT,
  };
}

export type AskSpend = "monthly" | "credit" | "none";

/**
 * Take one question off the allowance, atomically.
 *
 * Spent before the answer is produced rather than after: checking first
 * and counting later lets fifty simultaneous requests all see the same
 * one remaining question. A failed answer is refunded, so nobody pays
 * for our error.
 *
 * Needs the service role — a candidate who could write their own
 * counter would have no allowance at all.
 */
export async function spendAskAllowance(
  admin: SupabaseClient,
  userId: string
): Promise<AskSpend> {
  const { data, error } = await admin.rpc("spend_ask_allowance", {
    p_user_id: userId,
    p_month: askMonth(),
    p_monthly_limit: ASK_MONTHLY_LIMIT,
  });

  if (error) {
    // The migration has not been run yet: the code deploys before the
    // SQL does, and turning Ask Pinard off for everyone in that window
    // would be a worse failure than not counting for it. Metering
    // begins the moment the function exists.
    if (
      error.code === "PGRST202" ||
      error.code === "42883" ||
      /could not find the function|does not exist/i.test(error.message)
    ) {
      console.warn(
        "ask allowance: spend_ask_allowance is missing — run supabase/phase26-ask-allowance.sql. Not metering until then."
      );
      return "monthly";
    }
    // Any other failure is real, and must not silently become unlimited.
    throw new Error(`ask allowance: ${error.message}`);
  }
  return (data as AskSpend) ?? "none";
}

/** Give back a question the candidate never got an answer for. */
export async function refundAskAllowance(
  admin: SupabaseClient,
  userId: string,
  spend: AskSpend
): Promise<void> {
  if (spend === "none") return;
  try {
    if (spend === "monthly") {
      const month = askMonth();
      const { data } = await admin
        .from("ask_usage")
        .select("used")
        .eq("user_id", userId)
        .eq("month", month)
        .maybeSingle();
      const used = Number(data?.used ?? 0);
      if (used > 0) {
        await admin
          .from("ask_usage")
          .update({ used: used - 1 })
          .eq("user_id", userId)
          .eq("month", month);
      }
      return;
    }
    const { data } = await admin
      .from("ask_credits")
      .select("id, used")
      .eq("user_id", userId)
      .gt("used", 0)
      .order("expires_at", { nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      await admin
        .from("ask_credits")
        .update({ used: Number(data.used) - 1 })
        .eq("id", data.id);
    }
  } catch {
    // A refund that fails costs the candidate one question out of a
    // hundred. Losing the answer as well, because the refund threw,
    // would be the worse outcome.
  }
}

/**
 * Grant a purchased top-up. Idempotent on the payment reference, so a
 * webhook Stripe retries cannot grant twice.
 */
export async function grantAskCredits(
  admin: SupabaseClient,
  userId: string,
  paymentRef: string,
  expiresAt: string | null
): Promise<void> {
  const { error } = await admin.from("ask_credits").insert({
    user_id: userId,
    granted: ASK_TOPUP_QUESTIONS,
    expires_at: expiresAt,
    stripe_payment_ref: paymentRef,
  });
  // 23505 = unique violation: this payment already granted its credits.
  if (error && error.code !== "23505") throw new Error(error.message);
}
