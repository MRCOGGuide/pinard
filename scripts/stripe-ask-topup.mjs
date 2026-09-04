/**
 * One-time Stripe setup for the Ask Pinard top-up: a £4.99 one-off
 * payment that buys 100 extra questions. Prints the env line to paste
 * into .env.local and Vercel. Safe to re-run — idempotent by lookup_key.
 *
 * Separate from the subscription prices because it is a different kind
 * of thing: mode "payment", not "subscription", so it never renews and
 * never appears in the customer portal as a plan.
 *
 * Run from the project root:  node scripts/stripe-ask-topup.mjs
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
  console.error("STRIPE_SECRET_KEY is missing from .env.local.");
  process.exit(1);
}
if (!key.startsWith("sk_test_")) {
  console.error(
    "Refusing to run: STRIPE_SECRET_KEY is not a test key (must start with sk_test_).\n" +
      "Create the live price from the Stripe dashboard when you go live."
  );
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });

const LOOKUP = "pinard_ask_topup_100";
const AMOUNT = 499;
const QUESTIONS = 100;

const existing = await stripe.prices.list({
  lookup_keys: [LOOKUP],
  active: true,
  limit: 1,
});
if (existing.data.length > 0) {
  console.log(`Price already exists: ${existing.data[0].id}`);
  console.log(`\nSTRIPE_PRICE_ASK_TOPUP=${existing.data[0].id}`);
  process.exit(0);
}

const products = await stripe.products.search({
  query: `metadata['pinard_kind']:'ask_topup'`,
  limit: 1,
});
const product =
  products.data[0] ??
  (await stripe.products.create({
    name: `Ask Pinard — ${QUESTIONS} extra questions`,
    description: `${QUESTIONS} additional Ask Pinard questions, valid until the end of your current subscription period.`,
    metadata: { pinard_kind: "ask_topup", questions: String(QUESTIONS) },
  }));

const price = await stripe.prices.create({
  product: product.id,
  unit_amount: AMOUNT,
  currency: "gbp",
  lookup_key: LOOKUP,
  // No `recurring`: a one-off charge, so Checkout runs in payment mode.
  metadata: { questions: String(QUESTIONS) },
});

console.log(`Created product ${product.id} and price ${price.id}`);
console.log(`\nAdd this to .env.local and to Vercel:\n`);
console.log(`STRIPE_PRICE_ASK_TOPUP=${price.id}`);
