"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { isIanaZone } from "@/lib/timezone";

/**
 * Reminder preferences: when the daily nudge arrives, and whether it
 * arrives at all. Users write their own profile row, so this goes
 * through their session rather than the service role.
 */
export async function saveReminderSettings(input: {
  enabled: boolean;
  hour: number;
  /** IANA zone from the browser, so the hour means the candidate's own. */
  timezone?: string;
}): Promise<{ error?: string; ok?: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const hour = Math.min(23, Math.max(0, Math.round(Number(input.hour))));
  if (!Number.isFinite(hour)) return { error: "Choose a time" };

  const { error } = await supabase
    .from("profiles")
    .update({ reminders_enabled: Boolean(input.enabled), reminder_hour: hour })
    .eq("id", user.id);
  if (error) {
    // The detail goes to the log, not the screen (security audit M6).
    console.error("account action failed:", error.code);
    return { error: "Your reminder setting could not be saved. Try again." };
  }

  /*
    The zone is written separately and its failure is swallowed, because
    the column arrives with phase33-profile-timezone.sql and this has to
    keep working before that is run. Losing the zone means reminders
    stay on London time, which is what they do today; losing the hour
    because the zone could not be stored would be the worse trade.
  */
  if (isIanaZone(input.timezone)) {
    await supabase
      .from("profiles")
      .update({ timezone: input.timezone })
      .eq("id", user.id);
  }

  revalidatePath("/account");
  return { ok: true };
}

/**
 * Delete the signed-in candidate's account and everything kept about
 * them.
 *
 * In this order, because the order is what protects them: the
 * subscription is cancelled at Stripe first, and if that fails nothing
 * is deleted, since an account that is gone with a subscription still
 * charging is the one outcome that cannot be put right from here. Then
 * the auth user is deleted, and every table that refers to them
 * cascades or forgets them (feedback and reviews are kept, unnamed).
 * The owner's own account cannot be deleted this way.
 */
export async function deleteMyAccount(confirmEmail: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };
  if ((confirmEmail ?? "").trim().toLowerCase() !== (user.email ?? "").toLowerCase())
    return { error: "Type your email address exactly to confirm." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role === "admin") return { error: "An admin account cannot be deleted here." };

  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const live = sub?.stripe_subscription_id && ["active", "trialing", "past_due", "unpaid"].includes(sub.status ?? "");
  if (live) {
    const stripe = getStripe();
    if (!stripe) return { error: "Your subscription could not be cancelled just now, so nothing has been deleted. Please contact support." };
    try {
      await stripe.subscriptions.cancel(sub!.stripe_subscription_id as string);
    } catch {
      return { error: "Your subscription could not be cancelled just now, so nothing has been deleted. Please try again or contact support." };
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: "Your account could not be deleted just now. Please contact support." };
  await supabase.auth.signOut();
  return {};
}
