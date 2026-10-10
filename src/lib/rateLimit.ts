import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestIp, visitorKey } from "@/lib/gate";

/**
 * A simple per-visitor rate limit, counted in the gate's attempts table
 * under its own namespace (the waitlist form does the same). The
 * visitor is a hash of the IP address, never the address itself. If
 * the table is unavailable the limit is skipped rather than blocking
 * every visitor.
 */
export async function withinRateLimit(namespace: string, max: number, windowMs: number): Promise<boolean> {
  try {
    const visitor = await visitorKey(`${namespace}:${requestIp(await headers())}`);
    const admin = createAdminClient();
    const { data: seen, error } = await admin
      .from("gate_attempts")
      .select("failures, first_failed_at")
      .eq("visitor", visitor)
      .maybeSingle();
    if (error) return true;
    const fresh = !seen || Date.now() - Date.parse(seen.first_failed_at as string) > windowMs;
    const count = fresh ? 1 : Number(seen?.failures ?? 0) + 1;
    await admin.from("gate_attempts").upsert({
      visitor,
      failures: count,
      first_failed_at: fresh ? new Date().toISOString() : (seen!.first_failed_at as string),
      locked_until: null,
    });
    return count <= max;
  } catch {
    return true;
  }
}
