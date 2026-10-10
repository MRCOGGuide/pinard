import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ASK_DAILY_FAIR_USE,
  CURRENCY,
  PAID_TIERS,
  TIER_NAMES,
  TOP_UPS,
  askAllowanceFor,
  type Tier,
} from "@/config/pricing";
import type { Plan } from "@/lib/plan";

/**
 * Ask Pinard's allowance (pricing Phase 2, docs/PRICING-MODEL.md v2).
 *
 * Each tier includes a number of questions per billing period: per
 * month, or three months' worth at once on the three-month plan. When
 * they are gone, a top-up pack carries on; top-ups last while the
 * subscription does. Separately, no account asks more than
 * ASK_DAILY_FAIR_USE in one UTC day.
 *
 * Every number comes from src/config/pricing.ts. Spending happens in
 * the database in one locked statement, so simultaneous answers cannot
 * both take the last question.
 */

/** Offer a top-up at this many questions remaining. */
export const ASK_OFFER_AT = 10;

export type TopUpOption = { id: string; questions: number; price: string };

export type AskAllowance = {
  tier: Tier;
  limit: number;
  used: number;
  /** Unspent top-up questions. */
  credits: number;
  remaining: number;
  unlimited: boolean;
  offerTopUp: boolean;
  /** "month" or "plan period". */
  periodLabel: string;
  /** When the included allowance starts again (ISO). */
  resetsAt: string;
  topUps: TopUpOption[];
  /** The next tier up, if there is one: the honest upgrade. */
  upgrade: { tier: Tier; name: string; allowance: number } | null;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: CURRENCY.toUpperCase() }).format(cents / 100);
}

export function topUpOptions(): TopUpOption[] {
  return TOP_UPS.map((t) => ({ id: t.id, questions: t.questions, price: money(t.price) }));
}

function nextTier(tier: Tier, interval: Plan["interval"]): AskAllowance["upgrade"] {
  const i = PAID_TIERS.indexOf(tier as (typeof PAID_TIERS)[number]);
  const next = i >= 0 ? PAID_TIERS[i + 1] : tier === "free" ? PAID_TIERS[0] : undefined;
  return next ? { tier: next, name: TIER_NAMES[next], allowance: askAllowanceFor(next, interval ?? "month") } : null;
}

export async function getAskAllowance(supabase: SupabaseClient, userId: string, plan: Plan): Promise<AskAllowance> {
  const base = {
    tier: plan.tier,
    periodLabel: plan.periodLabel,
    resetsAt: plan.resetsAt,
    topUps: topUpOptions(),
    upgrade: plan.admin ? null : nextTier(plan.tier, plan.interval),
  };
  if (plan.admin) {
    return { ...base, limit: Infinity, used: 0, credits: 0, remaining: Infinity, unlimited: true, offerTopUp: false };
  }
  const [{ data: usage }, { data: creditRows }] = await Promise.all([
    supabase.from("ask_usage").select("used").eq("user_id", userId).eq("month", plan.periodKey).maybeSingle(),
    supabase.from("ask_credits").select("granted, used, expires_at").eq("user_id", userId),
  ]);
  const used = Number(usage?.used ?? 0);
  const now = Date.now();
  const credits = (creditRows ?? []).reduce((total, row) => {
    const expires = row.expires_at ? Date.parse(row.expires_at as string) : null;
    if (expires !== null && expires <= now) return total;
    return total + Math.max(0, Number(row.granted) - Number(row.used));
  }, 0);
  const remaining = Math.max(0, plan.allowance - used) + credits;
  return {
    ...base,
    limit: plan.allowance,
    used,
    credits,
    remaining,
    unlimited: false,
    offerTopUp: plan.subscribed && remaining <= ASK_OFFER_AT,
  };
}

export type AskSpend = "monthly" | "credit" | "none";

/** One question off the period's allowance, or else a top-up, atomically. */
export async function spendAskAllowance(admin: SupabaseClient, userId: string, plan: Plan): Promise<AskSpend> {
  const { data, error } = await admin.rpc("spend_ask_allowance", {
    p_user_id: userId,
    p_month: plan.periodKey,
    p_monthly_limit: plan.allowance,
  });
  if (error) {
    // Fails closed (security audit M2): an unmetered model is an unbounded bill.
    throw new Error(`ask allowance unavailable: ${error.code ?? error.message}`);
  }
  return (data as AskSpend) ?? "none";
}

/** The site-wide ceiling on AI calls per UK day (AI_DAILY_CAP to change). */
export const AI_DAILY_CAP = Number(process.env.AI_DAILY_CAP) || 5000;

export type AskRefusalReason = "free" | "allowance" | "fair_use" | "daily" | "unavailable";

/**
 * Everything that must hold before a question goes to the model: a
 * paid plan, the day's fair use, the period's allowance (or a top-up),
 * then the site's own ceiling. Spent here; the caller refunds if the
 * answer fails.
 */
export async function beginAsk(
  admin: SupabaseClient,
  userId: string,
  plan: Plan
): Promise<{ ok: true; spend: AskSpend } | { ok: false; reason: AskRefusalReason }> {
  let spend: AskSpend = "none";
  if (!plan.admin) {
    if (!plan.subscribed) return { ok: false, reason: "free" };

    const day = new Date().toISOString().slice(0, 10);
    const { data: withinFairUse, error: fairError } = await admin.rpc("take_ask_daily", {
      p_user_id: userId,
      p_day: day,
      p_limit: ASK_DAILY_FAIR_USE,
    });
    if (fairError) {
      // Until phase45 is run the function does not exist; the period
      // allowance below still caps every account, so this is logged.
      if (fairError.code !== "PGRST202" && fairError.code !== "42883") {
        console.error("fair-use counter unavailable:", fairError.code);
        return { ok: false, reason: "unavailable" };
      }
      console.warn("fair-use counter not in place: run supabase/phase45-pricing-tiers.sql");
    } else if (withinFairUse === false) {
      return { ok: false, reason: "fair_use" };
    }

    try {
      spend = await spendAskAllowance(admin, userId, plan);
    } catch (error) {
      console.error(String(error));
      return { ok: false, reason: "unavailable" };
    }
    if (spend === "none") return { ok: false, reason: "allowance" };
  }

  const { data, error } = await admin.rpc("take_ai_call", { p_limit: AI_DAILY_CAP });
  if (error) {
    if (error.code !== "PGRST202" && error.code !== "42883") {
      await refundAskAllowance(admin, userId, plan, spend);
      console.error("ai daily ceiling unavailable:", error.code);
      return { ok: false, reason: "unavailable" };
    }
    console.warn("ai daily ceiling not in place: run supabase/phase43-security-hardening.sql");
  } else if (data === false) {
    await refundAskAllowance(admin, userId, plan, spend);
    return { ok: false, reason: "daily" };
  }
  return { ok: true, spend };
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

/** What a candidate is told when beginAsk says no. */
export function askRefusal(reason: AskRefusalReason, plan: Plan): string {
  switch (reason) {
    case "free":
      return "Ask Pinard comes with every paid plan.";
    case "allowance":
      return `You have used this ${plan.periodLabel}'s ${plan.allowance} Ask Pinard questions. They renew on ${longDate(plan.resetsAt)}, or you can add a top-up now.`;
    case "fair_use":
      return `That is ${ASK_DAILY_FAIR_USE} questions today, the most any account can ask in a day. Ask Pinard is back tomorrow.`;
    case "daily":
      return "Ask Pinard is very busy today. Please try again tomorrow.";
    default:
      return "Ask Pinard is unavailable just now. Please try again shortly.";
  }
}

/** Give back a question the candidate never got an answer for. */
export async function refundAskAllowance(admin: SupabaseClient, userId: string, plan: Plan, spend: AskSpend): Promise<void> {
  if (spend === "none") return;
  try {
    if (spend === "monthly") {
      const { data } = await admin
        .from("ask_usage")
        .select("used")
        .eq("user_id", userId)
        .eq("month", plan.periodKey)
        .maybeSingle();
      const used = Number(data?.used ?? 0);
      if (used > 0) {
        await admin.from("ask_usage").update({ used: used - 1 }).eq("user_id", userId).eq("month", plan.periodKey);
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
    if (data) await admin.from("ask_credits").update({ used: Number(data.used) - 1 }).eq("id", data.id);
  } catch {
    // A failed refund costs one question; losing the answer too would be worse.
  }
}

/** Grant a purchased top-up. Idempotent on the payment reference. */
export async function grantAskCredits(
  admin: SupabaseClient,
  userId: string,
  questions: number,
  paymentRef: string,
  expiresAt: string | null
): Promise<void> {
  const { error } = await admin.from("ask_credits").insert({
    user_id: userId,
    granted: questions,
    expires_at: expiresAt,
    stripe_payment_ref: paymentRef,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
}
