"use server";

import { cookies } from "next/headers";
import { ipCountry, signalsAgree, signedVerdict, SIGNAL_COOKIE } from "@/lib/region";
import { recordFunnel } from "@/lib/funnel";
import { withinRateLimit } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";

/**
 * The browser's time zone and language, checked against the IP country
 * (lib/region). Takes no country, region or price: the country is the
 * server's own, and these two signals can only move a visitor to
 * Standard. The verdict is kept in a signed, HttpOnly cookie.
 */
export async function confirmPricingSignals(input: { timeZone: string; language: string }): Promise<{ done: boolean }> {
  if (!(await withinRateLimit("pricing", 60, 60 * 60 * 1000))) return { done: false };
  const country = await ipCountry();
  if (!country) return { done: false };
  const timeZone = String(input?.timeZone ?? "").slice(0, 64);
  const language = String(input?.language ?? "").slice(0, 35);
  const verdict = signalsAgree(country, timeZone, language) ? "ok" : "std";
  (await cookies()).set(SIGNAL_COOKIE, await signedVerdict(country, verdict), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { done: true };
}

/** The monthly / three-monthly switch was used. Nothing identifying is sent. */
export async function recordToggle(interval: string): Promise<void> {
  if (!["month", "quarter"].includes(interval)) return;
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  await recordFunnel("toggle_used", { interval, userId: user?.id ?? null });
}
