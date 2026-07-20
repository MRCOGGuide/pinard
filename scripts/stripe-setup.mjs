/**
 * One-time Stripe setup. Creates the three subscription prices and the
 * founding-member coupon in your Stripe account, then prints the env
 * lines to paste into .env.local. Safe to re-run (idempotent by
 * lookup_key / coupon id).
 *
 * Run from the project root:  node scripts/stripe-setup.mjs
 */
import Stripe from "stripe";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const key = env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is missing from .env.local — add your Stripe test secret key first.");
  process.exit(1);
}
if (!key.startsWith("sk_test_")) {
  console.error("Refusing to run: STRIPE_SECRET_KEY is not a test key (must start with sk_test_).");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });

const PRICES = [
  { lookup: "pinard_monthly", label: "Pinard Monthly", amount: 1699, interval: "month", count: 1, env: "STRIPE_PRICE_MONTHLY" },
  { lookup: "pinard_quarterly", label: "Pinard Quarterly", amount: 3999, interval: "month", count: 3, env: "STRIPE_PRICE_QUARTERLY" },
  { lookup: "pinard_annual", label: "Pinard Annual", amount: 9999, interval: "year", count: 1, env: "STRIPE_PRICE_ANNUAL" },
];

async function ensureProduct() {
  const existing = await stripe.products.search({ query: "metadata['app']:'pinard'" });
  if (existing.data.length > 0) return existing.data[0];
  return stripe.products.create({
    name: "Pinard subscription",
    metadata: { app: "pinard" },
  });
}

async function ensurePrice(product, spec) {
  const found = await stripe.prices.list({ lookup_keys: [spec.lookup], limit: 1 });
  if (found.data.length > 0) return found.data[0];
  return stripe.prices.create({
    product: product.id,
    lookup_key: spec.lookup,
    currency: "gbp",
    unit_amount: spec.amount,
    tax_behavior: "inclusive",
    recurring: { interval: spec.interval, interval_count: spec.count },
    nickname: spec.label,
  });
}

async function ensureCoupon() {
  const id = "founding-member";
  try {
    return await stripe.coupons.retrieve(id);
  } catch {
    return stripe.coupons.create({
      id,
      name: "Founding member",
      percent_off: 30,
      duration: "once",
      max_redemptions: 500,
      currency: "gbp",
    });
  }
}

const product = await ensureProduct();
const results = {};
for (const spec of PRICES) {
  const price = await ensurePrice(product, spec);
  results[spec.env] = price.id;
  console.log(`  ${spec.label}: ${price.id}`);
}
const coupon = await ensureCoupon();
console.log(`  Founding-member coupon: ${coupon.id} (30% off, max ${coupon.max_redemptions})`);

console.log("\nPaste these into .env.local:\n");
for (const spec of PRICES) console.log(`${spec.env}=${results[spec.env]}`);
console.log(`STRIPE_FOUNDING_COUPON=${coupon.id}`);
console.log("\nThen restart the dev server.");
