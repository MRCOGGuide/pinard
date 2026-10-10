import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { betaFullAccess, hasPilotAccess } from "@/lib/access";
import { askAllowanceFor, type Interval, type Region, type Tier } from "@/config/pricing";

/**
 * A candidate's plan, as the server knows it (pricing Phase 2).
 *
 * Taken from the subscription the Stripe webhook wrote, never from the
 * browser. The tier and billing period come from the price's own
 * metadata at the time of the webhook; a subscription from before the
 * four tiers (old tier names monthly, quarterly, annual) counts as
 * Basic until it renews or changes.
 */
export type Plan = {
  tier: Tier;
  /** An admin: everything, unmetered. */
  admin: boolean;
  interval: Interval | null;
  region: Region | null;
  /** The Ask Pinard allowance for the current period. */
  allowance: number;
  /** The key the allowance is counted under: the billing period, or the
   *  calendar month for a pilot candidate. */
  periodKey: string;
  /** When the allowance starts again (ISO). */
  resetsAt: string;
  /** "month" or "plan period", as the meter says it. */
  periodLabel: string;
  subscribed: boolean;
};

const ACTIVE = ["active", "trialing"];
const PAID: Tier[] = ["basic", "plus", "premium"];

function calendarMonth(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { key: start.toISOString().slice(0, 7), resetsAt: next.toISOString() };
}

export async function getPlan(supabase: SupabaseClient, userId: string): Promise<Plan> {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const month = calendarMonth();
  if (profile?.role === "admin") {
    return { tier: "premium", admin: true, interval: null, region: null, allowance: Infinity, periodKey: month.key, resetsAt: month.resetsAt, periodLabel: "month", subscribed: true };
  }

  // Read with the service role and "*": the columns phase45 adds may
  // not exist yet, and a missing column must not lock anyone out.
  const { data: sub } = await createAdminClient()
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const live =
    sub &&
    ACTIVE.includes(sub.status as string) &&
    (!sub.current_period_end || (sub.current_period_end as string) > new Date().toISOString());

  if (live) {
    const tier: Tier = PAID.includes(sub.tier as Tier) ? (sub.tier as Tier) : "basic";
    const interval: Interval | null =
      sub.plan_interval === "quarter" || sub.tier === "quarterly" ? "quarter" : sub.plan_interval === "month" ? "month" : null;
    const start = (sub.current_period_start as string | null) ?? null;
    const periodKey = start ? `p:${start.slice(0, 10)}` : month.key;
    return {
      tier,
      admin: false,
      interval,
      region: (sub.plan_region as Region | null) ?? null,
      allowance: askAllowanceFor(tier, start ? interval : "month"),
      periodKey,
      resetsAt: start ? ((sub.current_period_end as string | null) ?? month.resetsAt) : month.resetsAt,
      periodLabel: start && interval === "quarter" ? "plan period" : "month",
      subscribed: true,
    };
  }

  // A pilot candidate, or local and preview testing: Plus, by the month.
  if (betaFullAccess() || (await hasPilotAccess(userId))) {
    return { tier: "plus", admin: false, interval: null, region: null, allowance: askAllowanceFor("plus", "month"), periodKey: month.key, resetsAt: month.resetsAt, periodLabel: "month", subscribed: true };
  }

  return { tier: "free", admin: false, interval: null, region: null, allowance: 0, periodKey: month.key, resetsAt: month.resetsAt, periodLabel: "month", subscribed: false };
}
