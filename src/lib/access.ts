import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPilotWindow, pilotPhase } from "@/lib/pilotDates";

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

  /*
    An invited pilot candidate, while the pilot runs. Their access used
    to come only from BETA_FULL_ACCESS, which opens everything to every
    signed-in user: switching it off at launch would have cut the
    assessors off mid-review, and leaving it on would have given the
    public the paid product free. Tied to the invite code instead, it
    lasts from the start date to the end date the owner sets on the pilot
    page.
  */
  if (await hasPilotAccess(userId)) return "subscribed";
  return "free";
}

export function hasFullAccess(tier: AccessTier): boolean {
  return tier === "admin" || tier === "subscribed";
}

/** Free tier: sample questions per section before the paywall. */
export const SAMPLER_LIMIT = 3;

/** Joined with an invite code, and the pilot is running today. */
export async function hasPilotAccess(userId: string): Promise<boolean> {
  try {
    if (!(await isPilotCandidate(userId))) return false;
    return pilotPhase(await getPilotWindow()) === "running";
  } catch {
    return false;
  }
}

/** Joined with an invite code, whether or not the pilot is running. */
export async function isPilotCandidate(userId: string): Promise<boolean> {
  // The redemptions table is closed to the user's own key.
  const { data } = await createAdminClient()
    .from("invite_redemptions")
    .select("code")
    .eq("user_id", userId)
    .limit(1);
  return Boolean(data && data.length > 0);
}
