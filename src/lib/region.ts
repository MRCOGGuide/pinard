import "server-only";
import { cookies, headers } from "next/headers";
import { regionForCountry, type Region } from "@/config/pricing";
import { signText, verifyText } from "@/lib/signing";

/**
 * Which price region a visitor sees (docs/PRICING-MODEL.md, version 2.1).
 *
 * The IP country (Vercel's header) is only a hint. A cheaper region is
 * shown only when the browser's time zone agrees with that country;
 * otherwise, and in any doubt, the visitor sees Standard. The browser
 * sends its time zone and language through `confirmPricingSignals`
 * (app/pricing/actions.ts), never a country: those two can only move a
 * visitor to Standard, never to a cheaper price. The verdict is kept in
 * a signed, HttpOnly cookie bound to the IP country, so a change of
 * network means a fresh check.
 *
 * What is finally charged is decided by the card. The webhook refunds a
 * purchase made at a cheaper region's price with a card from a dearer
 * one (lib/regionCheck.ts).
 */

export const SIGNAL_COOKIE = "pinard_price_check";

/** Time zones that agree with each country in a cheaper region. */
const ZONES: Record<string, string[]> = {
  IN: ["Asia/Kolkata", "Asia/Calcutta"],
  PK: ["Asia/Karachi"],
  BD: ["Asia/Dhaka", "Asia/Dacca"],
  LK: ["Asia/Colombo"],
  NP: ["Asia/Kathmandu", "Asia/Katmandu"],
  EG: ["Africa/Cairo", "Egypt"],
  NG: ["Africa/Lagos"],
  GH: ["Africa/Accra"],
  KE: ["Africa/Nairobi"],
  MY: ["Asia/Kuala_Lumpur", "Asia/Kuching"],
  ZA: ["Africa/Johannesburg"],
  JO: ["Asia/Amman"],
};

/** The request's IP country. Locally and on previews, PRICING_DEV_COUNTRY
 *  stands in for it, so regions can be tested; never on the live site. */
export async function ipCountry(): Promise<string | null> {
  const dev = process.env.VERCEL_ENV !== "production" ? process.env.PRICING_DEV_COUNTRY : undefined;
  if (dev) return dev.toUpperCase();
  const c = (await headers()).get("x-vercel-ip-country");
  return c && /^[A-Z]{2}$/i.test(c) ? c.toUpperCase() : null;
}

/** Do the browser's time zone and language agree with the IP country? */
export function signalsAgree(country: string, timeZone: string, language: string): boolean {
  const zones = ZONES[country];
  if (!zones || !zones.includes(timeZone)) return false;
  // A language tagged with another country of a different region (say
  // en-GB from an Indian address) is a conflict; plain "en" is not.
  const tagged = language.split("-")[1]?.toUpperCase();
  if (tagged && /^[A-Z]{2}$/.test(tagged) && tagged !== country && regionForCountry(tagged) !== regionForCountry(country)) {
    return false;
  }
  return true;
}

/** The browser's verdict for this IP country: "ok" (agrees) or "std"
 *  (disagrees, so Standard), signed so it cannot be written by hand. */
type Verdict = "ok" | "std";

export async function signedVerdict(country: string, verdict: Verdict): Promise<string> {
  return `${country}.${verdict}.${await signText("price-region", `${verdict}:${country}`)}`;
}

async function verdictFor(country: string): Promise<Verdict | null> {
  const raw = (await cookies()).get(SIGNAL_COOKIE)?.value ?? "";
  const [c, verdict, sig] = raw.split(".");
  if (c !== country || (verdict !== "ok" && verdict !== "std")) return null;
  return (await verifyText("price-region", `${verdict}:${country}`, sig)) ? verdict : null;
}

export type RegionDecision = {
  region: Region;
  country: string | null;
  /** The IP points to a cheaper region, but the browser has not yet
   *  been asked: show nothing priced until it has. */
  needsSignals: boolean;
};

export async function displayRegion(): Promise<RegionDecision> {
  const country = await ipCountry();
  const byIp = regionForCountry(country);
  if (byIp === "standard" || !country) return { region: "standard", country, needsSignals: false };
  const verdict = await verdictFor(country);
  if (verdict === "ok") return { region: byIp, country, needsSignals: false };
  if (verdict === "std") return { region: "standard", country, needsSignals: false };
  return { region: "standard", country, needsSignals: true };
}
