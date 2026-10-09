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
    // Fails closed (security audit M2). This used to answer "monthly"
    // when the function was missing, which switched metering off for
    // everyone: an unmetered model is an unbounded bill. The function
    // has been in place since phase 26; if it ever goes, Ask Pinard
    // refuses until it is back rather than answering for free.
    throw new Error(`ask allowance unavailable: ${error.code ?? error.message}`);
  }
  return (data as AskSpend) ?? "none";
}

/** The site-wide ceiling on AI calls per UK day (AI_DAILY_CAP to change). */
export const AI_DAILY_CAP = Number(process.env.AI_DAILY_CAP) || 2000;

/**
 * Everything that has to be true before a candidate's question goes to
 * the model, in one place for both Ask boxes (Today's and the one under
 * a question): their allowance, then the site's daily ceiling. The
 * allowance is spent here and refunded by the caller if the answer
 * fails.
 *
 * Security audit M2: the Ask under a question was limited per question
 * but never counted against the monthly allowance, and nothing capped
 * the site as a whole.
 */
export async function beginAsk(
  admin: SupabaseClient,
  userId: string,
  isAdmin: boolean
): Promise<
  | { ok: true; spend: AskSpend }
  | { ok: false; reason: "allowance" | "daily" | "unavailable" }
> {
  let spend: AskSpend = "none";
  if (!isAdmin) {
    try {
      spend = await spendAskAllowance(admin, userId);
    } catch (error) {
      console.error(String(error));
      return { ok: false, reason: "unavailable" };
    }
    if (spend === "none") return { ok: false, reason: "allowance" };
  }

  const { data, error } = await admin.rpc("take_ai_call", { p_limit: AI_DAILY_CAP });
  if (error) {
    // Until supabase/phase43-security-hardening.sql has been run the
    // ceiling does not exist; the per-candidate allowance above still
    // holds, so this is logged rather than turning Ask Pinard off.
    if (error.code !== "PGRST202" && error.code !== "42883") {
      await refundAskAllowance(admin, userId, spend);
      console.error("ai daily ceiling unavailable:", error.code);
      return { ok: false, reason: "unavailable" };
    }
    console.warn("ai daily ceiling not in place: run supabase/phase43-security-hardening.sql");
  } else if (data === false) {
    await refundAskAllowance(admin, userId, spend);
    return { ok: false, reason: "daily" };
  }
  return { ok: true, spend };
}

/** What a candidate is told when beginAsk says no. */
export function askRefusal(reason: "allowance" | "daily" | "unavailable"): string {
  if (reason === "allowance") return `You have used this month's ${ASK_MONTHLY_LIMIT} Ask Pinard questions.`;
  if (reason === "daily") return "Ask Pinard is very busy today. Please try again tomorrow.";
  return "Ask Pinard is unavailable just now. Please try again shortly.";
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
