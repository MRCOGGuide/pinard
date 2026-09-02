"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Reminder preferences: when the daily nudge arrives, and whether it
 * arrives at all. Users write their own profile row, so this goes
 * through their session rather than the service role.
 */
export async function saveReminderSettings(input: {
  enabled: boolean;
  hour: number;
}): Promise<{ error?: string; ok?: true }> {
  const supabase = createClient();
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
  if (error) return { error: error.message };

  revalidatePath("/account");
  return { ok: true };
}
