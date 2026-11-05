import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Keeping the generation queue moving with nobody watching.
 *
 * The queue used to advance while its admin page was open, and otherwise
 * once a day. Questions asked for from a source should simply arrive in
 * Review, so a run here calls the next until the queue is empty.
 */

/** A job touched this recently means a run is already going. */
const ACTIVE_MS = 90 * 1000;

export async function queueIsRunning(): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("generation_jobs")
    .select("id")
    .in("status", ["queued", "running"])
    .gt("updated_at", new Date(Date.now() - ACTIVE_MS).toISOString())
    .limit(1);
  return (data ?? []).length > 0;
}

/** Starts the next run. It answers at once and does its work afterwards. */
export async function startQueueRun(origin: string): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const response = await fetch(`${origin}/api/generate/worker?chain=1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => null);
  return Boolean(response?.ok);
}
