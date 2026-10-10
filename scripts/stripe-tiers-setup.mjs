/**
 * Creates the four-tier catalogue in Stripe (pricing Phase 2).
 *
 *   node scripts/stripe-tiers-setup.mjs            # test mode
 *   node scripts/stripe-tiers-setup.mjs --live     # live mode: the owner runs this, at launch
 *
 * Reads the prices from src/config/pricing.ts so the two cannot drift.
 * Idempotent: each price is found by its lookup key
 * (pinard_<tier>_<interval>_<region>, pinard_topup_<n>) and made again
 * only if its amount changed, with the key moved to the new one.
 *
 * Also makes one customer-portal configuration per price region, so the
 * billing page only ever offers a customer their own region's prices:
 * upgrades take effect at once with proration, downgrades and shorter
 * periods wait for the end of the period, and cancelling is one step.
 *
 * With a live key it refuses unless --live is given: live mode is the
 * owner's to set up (docs/pricing/LIVE-CHECKLIST.md), and the agent that
 * wrote this never runs it there.
 */
import fs from "node:fs";
import Stripe from "stripe";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const live = process.argv.includes("--live");
const key = (live ? process.env.STRIPE_LIVE_SECRET_KEY : env.STRIPE_SECRET_KEY) ?? "";
if (!key.startsWith(live ? "sk_live_" : "sk_test_")) {
  console.error(live
    ? "For live mode, set STRIPE_LIVE_SECRET_KEY in this terminal only (never in a file) and run again with --live."
    : "Refusing: without --live this script only runs against a Stripe test key.");
  process.exit(1);
}
if (live) console.log("LIVE MODE: creating the catalogue in your live Stripe account.");
const stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });

// Read the figures out of the config file itself.
const config = fs.readFileSync("src/config/pricing.ts", "utf8");
const pricesBlock = config.slice(config.indexOf("export const PRICES"), config.indexOf("export const CURRENCY"));
const PRICES = {};
for (const region of ["standard", "mid", "lower"]) {
  const block = pricesBlock.slice(pricesBlock.indexOf(`${region}: {`));
  PRICES[region] = {};
  for (const tier of ["basic", "plus", "premium"]) {
    const m = block.match(new RegExp(`${tier}: \\{ month: (\\d+), quarter: (\\d+) \\}`));
    PRICES[region][tier] = { month: Number(m[1]), quarter: Number(m[2]) };
  }
}
const TOP_UPS = [...config.matchAll(/\{ id: "(topup_\d+)", questions: (\d+), price: (\d+) \}/g)].map((m) => ({
  id: m[1], questions: Number(m[2]), price: Number(m[3]),
}));
const TAX_CODE = "txcd_10000000"; // General - Electronically Supplied Services; eligible for Managed Payments
const NAMES = { basic: "Pinard Basic", plus: "Pinard Plus", premium: "Pinard Premium" };

async function product(name, metadata) {
  const found = await stripe.products.search({ query: `metadata['pinard_product']:'${metadata.pinard_product}'` });
  if (found.data[0]) {
    return stripe.products.update(found.data[0].id, { name, tax_code: TAX_CODE, active: true });
  }
  return stripe.products.create({ name, tax_code: TAX_CODE, metadata });
}

async function price(productId, lookupKey, amount, extra, metadata) {
  const existing = (await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })).data[0];
  if (existing && existing.unit_amount === amount && existing.tax_behavior === "exclusive") return existing;
  const created = await stripe.prices.create({
    product: productId,
    currency: "eur",
    unit_amount: amount,
    tax_behavior: "exclusive",
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    metadata,
    ...extra,
  });
  if (existing) await stripe.prices.update(existing.id, { active: false });
  return created;
}

const byRegion = { standard: [], mid: [], lower: [] };
const products = {};
for (const tier of ["basic", "plus", "premium"]) {
  products[tier] = await product(NAMES[tier], { pinard_product: tier, pinard_tier: tier });
  for (const region of ["standard", "mid", "lower"]) {
    for (const interval of ["month", "quarter"]) {
      const p = await price(
        products[tier].id,
        `pinard_${tier}_${interval}_${region}`,
        PRICES[region][tier][interval],
        { recurring: { interval: "month", interval_count: interval === "quarter" ? 3 : 1 } },
        { pinard_tier: tier, pinard_interval: interval, pinard_region: region }
      );
      byRegion[region].push({ tier, interval, id: p.id });
      console.log(`${tier.padEnd(7)} ${interval.padEnd(7)} ${region.padEnd(8)} €${(p.unit_amount / 100).toFixed(2)}  ${p.id}`);
    }
  }
}

const topUpProduct = await product("Ask Pinard top-up", { pinard_product: "topup" });
for (const t of TOP_UPS) {
  const p = await price(topUpProduct.id, `pinard_${t.id}`, t.price, {}, { pinard_kind: "ask_topup", questions: String(t.questions) });
  console.log(`top-up  ${String(t.questions).padEnd(15)} €${(p.unit_amount / 100).toFixed(2)}  ${p.id}`);
}

// One portal configuration per region: only that region's prices.
const configs = (await stripe.billingPortal.configurations.list({ limit: 100 })).data;
for (const region of ["standard", "mid", "lower"]) {
  const items = ["basic", "plus", "premium"].map((tier) => ({
    product: products[tier].id,
    prices: byRegion[region].filter((p) => p.tier === tier).map((p) => p.id),
  }));
  const features = {
    customer_update: { enabled: true, allowed_updates: ["email", "address", "name"] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "always_invoice",
      products: items,
      schedule_at_period_end: {
        conditions: [{ type: "decreasing_item_amount" }, { type: "shortening_interval" }],
      },
    },
  };
  const existing = configs.find((c) => c.metadata?.pinard_region === region && c.active);
  const params = {
    business_profile: { headline: "Manage your Pinard plan" },
    features,
    metadata: { pinard_region: region },
  };
  const c = existing
    ? await stripe.billingPortal.configurations.update(existing.id, params)
    : await stripe.billingPortal.configurations.create(params);
  console.log(`portal  ${region.padEnd(15)} ${c.id}`);
}
console.log("Done.");
