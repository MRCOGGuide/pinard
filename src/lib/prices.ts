import "server-only";
import {
  PAID_TIERS,
  PRICES,
  TOP_UPS,
  type Interval,
  type PaidTier,
  type Region,
  type TopUpId,
} from "@/config/pricing";
import { readSetting, writeSetting } from "@/lib/settings";

/**
 * The prices in force: src/config/pricing.ts, with any the owner has
 * changed in Admin > Billing laid over it.
 *
 * The four-tier pricing work (10 October 2026) moved every price into
 * the config file, and with it went the owner's price editor: changing
 * a price meant a code change and a deploy. Now a price saved in Admin
 * is kept in app_settings, as the founding offer is, and is the one the
 * pricing page, the Terms and the account page show. Stripe holds the
 * same amount under the price's lookup key, which is what checkout
 * charges (see the billing actions).
 */
export const PRICE_OVERRIDES = "price_overrides";

export type PriceTable = Record<Region, Record<PaidTier, Record<Interval, number>>>;
export type TopUpPrice = { id: TopUpId; questions: number; price: number };
export type CurrentPrices = { prices: PriceTable; topUps: TopUpPrice[] };

type Overrides = {
  prices?: Partial<Record<Region, Partial<Record<PaidTier, Partial<Record<Interval, number>>>>>>;
  topUps?: Partial<Record<TopUpId, number>>;
};

const REGIONS = Object.keys(PRICES) as Region[];
const INTERVALS: Interval[] = ["month", "quarter"];
const valid = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

async function readOverrides(): Promise<Overrides> {
  try {
    const raw = await readSetting(PRICE_OVERRIDES);
    return raw ? (JSON.parse(raw) as Overrides) : {};
  } catch {
    return {};
  }
}

export async function getPrices(): Promise<CurrentPrices> {
  const o = await readOverrides();
  const prices = {} as PriceTable;
  for (const r of REGIONS) {
    prices[r] = {} as PriceTable[Region];
    for (const t of PAID_TIERS) {
      prices[r][t] = { ...PRICES[r][t] };
      for (const i of INTERVALS) {
        const v = o.prices?.[r]?.[t]?.[i];
        if (valid(v)) prices[r][t][i] = v;
      }
    }
  }
  const topUps = TOP_UPS.map((t) => {
    const v = o.topUps?.[t.id];
    return { id: t.id, questions: t.questions, price: valid(v) ? v : t.price };
  });
  return { prices, topUps };
}

/** Keep one changed price. Called only after Stripe holds the same amount. */
export async function savePlanPrice(region: Region, tier: PaidTier, interval: Interval, cents: number) {
  const o = await readOverrides();
  o.prices ??= {};
  o.prices[region] ??= {};
  o.prices[region]![tier] ??= {};
  o.prices[region]![tier]![interval] = cents;
  return writeSetting(PRICE_OVERRIDES, JSON.stringify(o));
}

export async function saveTopUpPrice(id: TopUpId, cents: number) {
  const o = await readOverrides();
  o.topUps ??= {};
  o.topUps[id] = cents;
  return writeSetting(PRICE_OVERRIDES, JSON.stringify(o));
}
