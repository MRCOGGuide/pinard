import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_ZONE, isIanaZone } from "@/lib/timezone";

/**
 * The signed-in candidate's time zone, as their browser reported it
 * (profiles.timezone), read once per request; London when unknown. The
 * pages take "today" in it (lib/timezone localDay), so a candidate in
 * India or the Gulf has their own day's plan from their own midnight.
 */
export const candidateZone = cache(async (userId: string): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  const zone = (data as { timezone?: unknown } | null)?.timezone;
  return isIanaZone(zone) ? zone : DEFAULT_ZONE;
});
