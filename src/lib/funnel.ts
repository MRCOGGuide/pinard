import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { ipCountry } from "@/lib/region";

/**
 * Funnel events for the admin conversion view (pricing Phase 2).
 *
 * Consent-respecting by construction: no cookie, no device identifier,
 * no IP address stored. Only the event, the plan it concerns, the
 * country from the request, and the account for a signed-in candidate.
 * Nothing is recorded at all when the browser asks not to be tracked
 * (Global Privacy Control or Do Not Track). Failures are swallowed: a
 * missing table (phase45 not yet run) must never break a page.
 */
export type FunnelEvent =
  | "pricing_viewed"
  | "toggle_used"
  | "plan_chosen"
  | "checkout_started"
  | "checkout_completed"
  | "limit_reached"
  | "upgrade_clicked";

export async function trackingRefused(): Promise<boolean> {
  try {
    const h = await headers();
    return h.get("sec-gpc") === "1" || h.get("dnt") === "1";
  } catch {
    return false; // no request (a webhook): nothing to refuse
  }
}

export async function recordFunnel(
  event: FunnelEvent,
  detail: { tier?: string | null; interval?: string | null; region?: string | null; userId?: string | null; country?: string | null } = {}
): Promise<void> {
  try {
    if (await trackingRefused()) return;
    let country = detail.country ?? null;
    if (!country) {
      try {
        country = await ipCountry();
      } catch {
        country = null;
      }
    }
    await createAdminClient()
      .from("funnel_events")
      .insert({
        event,
        tier: detail.tier ?? null,
        plan_interval: detail.interval ?? null,
        region: detail.region ?? null,
        country,
        user_id: detail.userId ?? null,
      });
  } catch {
    // Measurement never gets in the way.
  }
}
