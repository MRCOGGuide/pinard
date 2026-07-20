import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Access tiers. Until Stripe arrives (Phase 7), BETA_FULL_ACCESS=true in
 * .env.local gives every signed-in user full access — the pilot mode.
 * Set it to false to see the sampler/paywall behaviour.
 */
export type AccessTier = "admin" | "subscribed" | "free";

export async function getAccess(
  supabase: SupabaseClient,
  userId: string
): Promise<AccessTier> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (profile?.role === "admin") return "admin";

  if (process.env.BETA_FULL_ACCESS === "true") return "subscribed";

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (
    sub &&
    ["active", "trialing"].includes(sub.status) &&
    (!sub.current_period_end || sub.current_period_end > new Date().toISOString())
  ) {
    return "subscribed";
  }

  return "free";
}

export function hasFullAccess(tier: AccessTier): boolean {
  return tier === "admin" || tier === "subscribed";
}

/** Free tier: sample questions per section before the paywall. */
export const SAMPLER_LIMIT = 3;
