/**
 * What the price looks like to someone who is not in the UK.
 *
 * More people sit this exam outside the UK than in it, and the site
 * prices as though the opposite were true: £99.99, in a currency the
 * reader has to convert in their head before they can judge it.
 *
 * Two things are deliberately separate here. What a candidate is
 * CHARGED is GBP, because that is what the Stripe prices are in, and
 * nothing in this file changes it. What they are SHOWN can also carry
 * the figure in their own money, so the decision is made on a number
 * they recognise — but only where the owner has given a rate, and
 * always labelled as the indication it is. A converted figure dressed
 * up as the price would be a quote the checkout then breaks.
 *
 * True local billing is a Stripe matter: price objects with currency
 * options, and a decision about what each market bears. That waits for
 * the Stripe keys, and for the owner.
 */

export type Currency = {
  code: string;
  symbol: string;
  /** Minor units: 2 for most, 0 where the currency has no subdivision. */
  decimals: number;
};

export const GBP: Currency = { code: "GBP", symbol: "£", decimals: 2 };

/**
 * The markets this exam is actually sat in, by ISO country code.
 *
 * Not a complete table of the world: a country that is not here shows
 * the GBP price, which is correct and is what everyone sees today.
 */
const BY_COUNTRY: Record<string, Currency> = {
  IN: { code: "INR", symbol: "₹", decimals: 0 },
  PK: { code: "PKR", symbol: "₨", decimals: 0 },
  NG: { code: "NGN", symbol: "₦", decimals: 0 },
  EG: { code: "EGP", symbol: "E£", decimals: 0 },
  BD: { code: "BDT", symbol: "৳", decimals: 0 },
  LK: { code: "LKR", symbol: "Rs", decimals: 0 },
  SD: { code: "SDG", symbol: "SDG", decimals: 0 },
  KE: { code: "KES", symbol: "KSh", decimals: 0 },
  GH: { code: "GHS", symbol: "GH₵", decimals: 2 },
  ZA: { code: "ZAR", symbol: "R", decimals: 2 },
  AE: { code: "AED", symbol: "AED", decimals: 2 },
  SA: { code: "SAR", symbol: "SAR", decimals: 2 },
  OM: { code: "OMR", symbol: "OMR", decimals: 3 },
  QA: { code: "QAR", symbol: "QAR", decimals: 2 },
  KW: { code: "KWD", symbol: "KWD", decimals: 3 },
  MY: { code: "MYR", symbol: "RM", decimals: 2 },
  SG: { code: "SGD", symbol: "S$", decimals: 2 },
  HK: { code: "HKD", symbol: "HK$", decimals: 2 },
  IE: { code: "EUR", symbol: "€", decimals: 2 },
  US: { code: "USD", symbol: "$", decimals: 2 },
  CA: { code: "CAD", symbol: "C$", decimals: 2 },
  AU: { code: "AUD", symbol: "A$", decimals: 2 },
  NZ: { code: "NZD", symbol: "NZ$", decimals: 2 },
};

/** The currency to show a visitor from this country, if we know one. */
export function currencyForCountry(country: string | null | undefined): Currency | null {
  if (!country) return null;
  return BY_COUNTRY[country.toUpperCase()] ?? null;
}

/** Every currency the table can show, for the panel that sets rates. */
export function knownCurrencies(): Currency[] {
  const seen = new Map<string, Currency>();
  for (const c of Object.values(BY_COUNTRY)) seen.set(c.code, c);
  return Array.from(seen.values()).sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * A rate table: how many units of a currency one pound indicates.
 * The owner's figures, not a live feed — a pricing page that depends on
 * an exchange API is a pricing page that breaks when the API does.
 */
export type Rates = Record<string, number>;

export function parseRates(raw: string | null | undefined): Rates {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rates: Rates = {};
    for (const [code, value] of Object.entries(parsed)) {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n) && n > 0) rates[code.toUpperCase()] = n;
    }
    return rates;
  } catch {
    return {};
  }
}

/**
 * The indicative figure, rounded the way a price is rather than the way
 * a conversion is: nobody prints ₹10,432.57.
 */
export function indicativeAmount(
  gbpPence: number,
  currency: Currency,
  rates: Rates
): string | null {
  const rate = rates[currency.code];
  if (!rate || gbpPence <= 0) return null;

  const units = (gbpPence / 100) * rate;
  if (currency.decimals === 0) {
    /* Round to something a price tag would say: the nearest ten below a
       thousand, the nearest hundred above it. */
    const rounded =
      units >= 1000 ? Math.round(units / 100) * 100 : Math.round(units / 10) * 10;
    return `${currency.symbol}${rounded.toLocaleString("en-GB")}`;
  }
  return `${currency.symbol}${units.toFixed(currency.decimals)}`;
}
