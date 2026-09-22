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
  /** IANA zone from the browser, so the hour means the candidate's own. */
  timezone?: string;
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

  /*
    The zone is written separately and its failure is swallowed, because
    the column arrives with phase33-profile-timezone.sql and this has to
    keep working before that is run. Losing the zone means reminders
    stay on London time, which is what they do today; losing the hour
    because the zone could not be stored would be the worse trade.
  */
  // An IANA name: "Europe/London", "America/Argentina/Buenos_Aires", or
  // a bare "UTC", which some browsers report. Anything else is not a
  // zone and has no business reaching the query.
  const zone = input.timezone ?? "";
  if (/^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+)*$/.test(zone) && zone.length <= 64) {
    await supabase
      .from("profiles")
      .update({ timezone: zone })
      .eq("id", user.id);
  }

  revalidatePath("/account");
  return { ok: true };
}
