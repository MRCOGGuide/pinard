import "server-only";
import type Stripe from "stripe";
import type { Interval, PaidTier, Region, TopUpId } from "@/config/pricing";

/**
 * Stripe prices and portal settings, found by name on the server
 * (pricing Phase 2). Price IDs never leave the server: the browser asks
 * for a tier and a billing period, and this decides the price for the
 * region the server worked out. Made by scripts/stripe-tiers-setup.mjs.
 */

export function planLookupKey(tier: PaidTier, interval: Interval, region: Region) {
  return `pinard_${tier}_${interval}_${region}`;
}

const cache = new Map<string, { id: string; at: number }>();
const TTL = 10 * 60 * 1000;

export async function priceIdFor(stripe: Stripe, lookupKey: string): Promise<string | null> {
  const hit = cache.get(lookupKey);
  if (hit && Date.now() - hit.at < TTL) return hit.id;
  const found = (await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })).data[0];
  if (!found) return null;
  cache.set(lookupKey, { id: found.id, at: Date.now() });
  return found.id;
}

export function topUpLookupKey(id: TopUpId) {
  return `pinard_${id}`;
}

/** What a price says about itself, from the metadata the setup script wrote. */
export function planFromPrice(price: Stripe.Price | null | undefined): { tier: PaidTier; interval: Interval; region: Region } | null {
  const m = price?.metadata ?? {};
  if (!["basic", "plus", "premium"].includes(m.pinard_tier)) return null;
  if (!["month", "quarter"].includes(m.pinard_interval)) return null;
  if (!["standard", "mid", "lower"].includes(m.pinard_region)) return null;
  return { tier: m.pinard_tier as PaidTier, interval: m.pinard_interval as Interval, region: m.pinard_region as Region };
}

const portalCache = new Map<string, string>();

/** The portal configuration that offers only this region's prices. */
export async function portalConfigFor(stripe: Stripe, region: Region): Promise<string | undefined> {
  if (portalCache.has(region)) return portalCache.get(region);
  const list = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const found = list.data.find((c) => c.metadata?.pinard_region === region);
  if (found) portalCache.set(region, found.id);
  return found?.id;
}
