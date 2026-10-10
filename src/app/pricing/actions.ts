"use server";

import { cookies } from "next/headers";
import { ipCountry, signalsAgree, signedVerdict, SIGNAL_COOKIE } from "@/lib/region";
import { recordFunnel } from "@/lib/funnel";
import { withinRateLimit } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { CONSENT_COOKIE } from "@/lib/consent";
import { regionForCountry } from "@/config/pricing";
import { getPricingSettings } from "@/lib/offer";
import { pricingView, type PricingView } from "@/lib/pricingView";

/**
 * The browser's time zone and language, checked against the IP country
 * (lib/region). Takes no country, region or price: the country is the
 * server's own, and these two signals can only move a visitor to
 * Standard.
 *
 * Returns the visitor's own prices for the page to show. The verdict is
 * also kept in a signed, HttpOnly cookie, so the check need not run on
 * the next visit, but only if the visitor accepted cookies (lib/consent);
 * without it, checkout checks the same signals again from the form.
 */
export async function confirmPricingSignals(input: {
  timeZone: string;
  language: string;
}): Promise<{ view: PricingView | null }> {
  if (!(await withinRateLimit("pricing", 60, 60 * 60 * 1000))) return { view: null };
  const country = await ipCountry();
  if (!country) return { view: null };
  const timeZone = String(input?.timeZone ?? "").slice(0, 64);
  const language = String(input?.language ?? "").slice(0, 35);
  const verdict = signalsAgree(country, timeZone, language) ? "ok" : "std";
  const jar = await cookies();
  if (jar.get(CONSENT_COOKIE)?.value === "all") {
    jar.set(SIGNAL_COOKIE, await signedVerdict(country, verdict), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  const region = verdict === "ok" ? regionForCountry(country) : "standard";
  const settings = await getPricingSettings();
  const founding = settings.offer.active && settings.offer.left > 0;
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  await recordFunnel("pricing_viewed", { region, userId: user?.id ?? null, country });
  return { view: await pricingView(region, country, founding) };
}

/** The monthly / three-monthly switch was used. Nothing identifying is sent. */
export async function recordToggle(interval: string): Promise<void> {
  if (!["month", "quarter"].includes(interval)) return;
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  await recordFunnel("toggle_used", { interval, userId: user?.id ?? null });
}
