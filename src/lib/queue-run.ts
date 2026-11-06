import "server-only";

/**
 * Keeping the generation queue moving with nobody watching.
 *
 * A press on Sources starts several long runs at once, enough for a
 * normal request to finish there and then. .github/workflows/background-
 * work.yml picks up anything left, but GitHub's schedule cannot be counted
 * on: the hourly reminders have run 4 to 10 hours apart. A run must never
 * start the next itself: on the live site a run calling the next stopped
 * at the fourth (owner, 5 November 2026), which is how Vercel's protection
 * against a function calling itself is reported to behave. Several runs at
 * once are safe, as each claims its job.
 */

/** Starts a long run. It answers at once and does its work afterwards. */
export async function startQueueRun(origin: string): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const response = await fetch(`${origin}/api/generate/worker?long=1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => null);
  return Boolean(response?.ok);
}
