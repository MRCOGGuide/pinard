import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Switches the owner can throw without a deploy.
 *
 * Read with the service role, because the table carries no policies:
 * a candidate never asks whether a feature is on, the server decides
 * what to send them.
 */

export const SIMILAR_VALUES_ENABLED = "similar_values_enabled";

/** What a setting means when it cannot be read. */
const DEFAULTS: Record<string, boolean> = {
  // Off. This switch exists because the owner did not want unreviewed
  // figures in front of candidates, so the state to fall back to when
  // the answer is unknown is the one they asked for. It also covers
  // the window between deploying this and running phase 30, where the
  // table does not exist yet and every read fails.
  [SIMILAR_VALUES_ENABLED]: false,
};

export type SettingRead = {
  enabled: boolean;
  /** False when the setting could not be read at all — the table is
   *  missing, or the row was never seeded. The admin screen says so
   *  rather than showing a switch that does nothing. */
  available: boolean;
};

export async function readFlag(key: string): Promise<SettingRead> {
  const fallback = DEFAULTS[key] ?? false;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return { enabled: fallback, available: false };
    return { enabled: data.value === "true", available: true };
  } catch {
    return { enabled: fallback, available: false };
  }
}

/** Just the answer, for callers that only need to decide what to send. */
export async function isEnabled(key: string): Promise<boolean> {
  return (await readFlag(key)).enabled;
}

export async function writeFlag(
  key: string,
  enabled: boolean
): Promise<{ error?: string }> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key, value: enabled ? "true" : "false", updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/* ------------------------------------------------------------------ */
/* Settings that are not switches                                      */
/* ------------------------------------------------------------------ */

/**
 * The same table, read as text.
 *
 * It was built this way on purpose — "stored as text so a setting can
 * grow past true/false without a migration" — and the founding offer
 * is the first thing to need it: a percentage, a number of places, and
 * an exam fee the owner knows and this codebase does not.
 */
export async function readSetting(key: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return (data.value as string) ?? null;
  } catch {
    return null;
  }
}

/** Several at once, so a panel is one round trip rather than four. */
export async function readSettings(
  keys: string[]
): Promise<Record<string, string>> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", keys);
    if (error || !data) return {};
    return Object.fromEntries(
      (data as { key: string; value: string }[]).map((r) => [r.key, r.value])
    );
  } catch {
    return {};
  }
}

export async function writeSetting(
  key: string,
  value: string
): Promise<{ error?: string }> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("app_settings").upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
