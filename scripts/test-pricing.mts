/**
 * Pricing Phase 2 tests (H). Stripe TEST MODE only; refuses a live key.
 *
 *   npx tsx --conditions=react-server scripts/test-pricing.mts [--base http://localhost:3000]
 *
 * Every Stripe customer made here is a throwaway, linked to no Pinard
 * account, and is deleted at the end. Database writes are faked, except
 * the allowance counters, which are tested under their own keys and
 * removed afterwards (only rows this script created).
 */
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) throw new Error("test key only");
process.env.RESEND_API_KEY = ""; // no real emails from tests

const base = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : "http://localhost:3000";
const cfg = await import("../src/config/pricing");
const { signalsAgree } = await import("../src/lib/region");
const rc = await import("../src/lib/regionCheck");
const { taxShareFor } = await import("../src/lib/taxDisplay");
const { getStripe } = await import("../src/lib/stripe");
const { planLookupKey, priceIdFor } = await import("../src/lib/catalogue");
const { createAdminClient } = await import("../src/lib/supabase/admin");
const stripe = getStripe()!;

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// ---------- 1. Regions and signals ----------
const EU_EEA = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO".split(" ");
check("whole EU and EEA is Standard", EU_EEA.every((c) => cfg.regionForCountry(c) === "standard"));
check("UK, Switzerland, Gulf, US are Standard", ["GB", "CH", "SA", "AE", "QA", "US", "CA", "AU", "SG"].every((c) => cfg.regionForCountry(c) === "standard"));
check("Malaysia, South Africa, Jordan are Mid", ["MY", "ZA", "JO"].every((c) => cfg.regionForCountry(c) === "mid"));
check("India and the Lower list are Lower", ["IN", "PK", "BD", "LK", "NP", "EG", "NG", "GH", "KE"].every((c) => cfg.regionForCountry(c) === "lower"));
check("unlisted and unknown countries are Standard", ["BR", "XX", ""].every((c) => cfg.regionForCountry(c) === "standard"));
check("Indian IP, Indian time zone: agrees", signalsAgree("IN", "Asia/Kolkata", "en-IN"));
check("Indian IP, London time zone (VPN): Standard", !signalsAgree("IN", "Europe/London", "en-GB"));
check("Indian IP, Indian zone, en-GB language: Standard", !signalsAgree("IN", "Asia/Kolkata", "en-GB"));
check("Indian IP, Indian zone, plain English: agrees", signalsAgree("IN", "Asia/Kolkata", "en"));

// ---------- 2. Allowances ----------
check("allowances per month: 30 / 160 / 450", cfg.askAllowanceFor("basic", "month") === 30 && cfg.askAllowanceFor("plus", "month") === 160 && cfg.askAllowanceFor("premium", "month") === 450);
check("three-month plan pools three months", cfg.askAllowanceFor("plus", "quarter") === 480 && cfg.askAllowanceFor("premium", "quarter") === 1350);
check("free has no Ask Pinard", cfg.askAllowanceFor("free", "month") === 0);

// ---------- 3. Card region rules ----------
check("Indian debit card: Lower", rc.regionForCard("IN", "debit") === "lower");
check("Indian prepaid card: Standard", rc.regionForCard("IN", "prepaid") === "standard");
check("card of unknown type: Standard", rc.regionForCard("IN", "unknown") === "standard");
check("UK credit card: Standard", rc.regionForCard("GB", "credit") === "standard");

// ---------- 4. Tax shown for each country (Stripe's calculation) ----------
for (const c of ["IE", "FR", "GB", "IN", "SA"]) {
  const share = await taxShareFor(c);
  console.log(`      tax display ${c}: ${share ? `includes ${(share * 100).toFixed(0)}% (Stripe)` : "net price, tax shown at checkout"}`);
}
check("Ireland shows VAT included", (await taxShareFor("IE")) !== null);
check("France shows VAT included", (await taxShareFor("FR")) !== null);
check("India shows the net price with the checkout note", (await taxShareFor("IN")) === null);
check("Saudi Arabia shows the net price with the checkout note", (await taxShareFor("SA")) === null);

// ---------- 5. Tampered requests ----------
for (const [field, value] of [["price", "price_123"], ["country", "IN"], ["region", "lower"], ["currency", "inr"]]) {
  const body = new URLSearchParams({ tier: "basic", interval: "month", [field]: value });
  const res = await fetch(`${base}/api/stripe/checkout`, { method: "POST", body, redirect: "manual" });
  check(`checkout refuses a request carrying ${field}`, res.status === 400, `status ${res.status}`);
}
const lowerId = await priceIdFor(stripe, planLookupKey("basic", "month", "lower"));
const viaQuery = await fetch(`${base}/api/stripe/checkout?price=${lowerId}`, { method: "POST", body: new URLSearchParams({ tier: "basic", interval: "month" }), redirect: "manual" });
check("checkout refuses another region's price ID in the URL", viaQuery.status === 400, `status ${viaQuery.status}`);

// ---------- 6. Card-country safety net, upgrade, cancel, failed payment ----------
type Row = Record<string, unknown>;
function fakeAdmin(sub: Row) {
  const log: string[] = [];
  const chain = (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "subscriptions" ? sub : null }) }) }),
    update: (v: Row) => ({ eq: async () => { Object.assign(sub, v); log.push(`update ${table} ${JSON.stringify(v)}`); return {}; } }),
    insert: async (v: Row) => { log.push(`insert ${table} ${String(v.message ?? "").slice(0, 60)}`); return {}; },
  });
  return { client: { from: chain } as never, log, sub };
}

const made: string[] = [];
async function subscribe(pm: string, tier: "basic" | "plus", region: "standard" | "lower", interval: "month" | "quarter" = "month") {
  const customer = await stripe.customers.create({ email: `pricing-test@example.com`, metadata: { pinard_test: "phase2" } });
  made.push(customer.id);
  const attached = await stripe.paymentMethods.attach(pm, { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: attached.id } });
  const price = (await priceIdFor(stripe, planLookupKey(tier, interval, region)))!;
  const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price }], payment_behavior: "allow_incomplete" });
  const invoice = await stripe.invoices.retrieve(sub.latest_invoice as string);
  return { customer, sub, invoice };
}

async function safety(name: string, pm: string, region: "standard" | "lower", expect: string) {
  try {
    const { sub, invoice } = await subscribe(pm, "basic", region);
    const fake = fakeAdmin({ plan_region: region, pending_region: null });
    const result = await rc.checkPaidInvoice(stripe, fake.client, invoice, "00000000-0000-4000-8000-000000000000", null);
    let detail = result;
    if (result === "refunded") {
      const after = await stripe.subscriptions.retrieve(sub.id);
      const refunds = await stripe.refunds.list({ limit: 3 });
      detail += `, subscription ${after.status}, refund ${refunds.data[0]?.status}`;
    }
    check(name, result === expect, detail);
  } catch (e) {
    check(name, false, (e as Error).message.slice(0, 120));
  }
}
// Stripe's Indian test card needs the customer's approval (India's
// rules for recurring payments), which only Checkout can collect, so the
// Indian cases test the decision itself.
check("Indian card at the Lower price: kept", rc.decideRegionAction("subscription_create", { region: rc.regionForCard("IN", "credit"), country: "IN" }, "lower") === "ok");
check("Indian card at the Standard price (Indian card on a UK IP): kept, notice of the lower price", rc.decideRegionAction("subscription_create", { region: rc.regionForCard("IN", "credit"), country: "IN" }, "standard") === "notice");
check("Indian prepaid card at the Lower price: refunded", rc.decideRegionAction("subscription_create", { region: rc.regionForCard("IN", "prepaid"), country: "IN" }, "lower") === "refund");
check("UK card on a renewal at the Lower price: notice, not a refund", rc.decideRegionAction("subscription_cycle", { region: "standard", country: "GB" }, "lower") === "notice");
await safety("UK card at the Lower price (UK card on an Indian IP): refunded and cancelled", "pm_card_gb", "lower", "refunded");
await safety("French card at the Standard price: kept", "pm_card_fr", "standard", "ok");
await safety("Irish card at the Standard price: kept", "pm_card_ie", "standard", "ok");

// Card changed mid-subscription to one from another region.
{
  const facts = await rc.cardFactsForPaymentMethod(stripe, (await stripe.paymentMethods.attach("pm_card_in", { customer: made[made.length - 1] })).id);
  const fake = fakeAdmin({ plan_region: "standard", pending_region: null });
  await rc.startRegionNotice(fake.client, "00000000-0000-4000-8000-000000000000", null, facts!.region, facts!.country);
  check("card changed to an Indian card: notice recorded, price unchanged until a renewal 30+ days on", fake.sub.pending_region === "lower" && Boolean(fake.sub.region_notice_at), JSON.stringify({ pending: fake.sub.pending_region }));
  const due = await rc.applyDueRegionChange(stripe, fake.client, "sub_not_due");
  check("the change is not applied before 30 days", due === false);
}

// Upgrade now with proration; cancel at period end; failed payment.
{
  const { sub } = await subscribe("pm_card_gb", "basic", "standard");
  const plus = (await priceIdFor(stripe, planLookupKey("plus", "month", "standard")))!;
  const upgraded = await stripe.subscriptions.update(sub.id, { items: [{ id: sub.items.data[0].id, price: plus }], proration_behavior: "always_invoice" });
  const inv = await stripe.invoices.retrieve(upgraded.latest_invoice as string);
  check("upgrade Basic to Plus takes effect at once, prorated", upgraded.items.data[0].price.id === plus && inv.billing_reason === "subscription_update", `invoice ${inv.amount_due} cents`);
  const cancelled = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
  check("cancel keeps access to the end of the period", cancelled.status === "active" && (cancelled.cancel_at_period_end || Boolean(cancelled.cancel_at)));
}
{
  const { sub } = await subscribe("pm_card_chargeCustomerFail", "basic", "standard");
  check("failed first payment leaves the plan inactive", ["incomplete", "past_due"].includes(sub.status), sub.status);
}
{
  const listed = (await stripe.billingPortal.configurations.list({ limit: 100 })).data.filter((c) => c.metadata?.pinard_region && c.active);
  const configs = await Promise.all(listed.map((c) => stripe.billingPortal.configurations.retrieve(c.id, { expand: ["features.subscription_update.products"] })));
  const ok = configs.length === 3 && configs.every((c) => {
    const conds = c.features.subscription_update.schedule_at_period_end?.conditions?.map((x) => x.type) ?? [];
    return c.features.subscription_update.proration_behavior === "always_invoice" && conds.includes("decreasing_item_amount") && conds.includes("shortening_interval");
  });
  check("portal per region: upgrades now with proration, downgrades and shorter periods at period end", ok);
  const lowerCfg = configs.find((c) => c.metadata.pinard_region === "lower");
  const offered = (lowerCfg?.features.subscription_update.products ?? []).flatMap((p) => p.prices);
  const lowerPrices = await Promise.all((["basic", "plus", "premium"] as const).flatMap((t) => (["month", "quarter"] as const).map((i) => priceIdFor(stripe, planLookupKey(t, i, "lower")))));
  check("the Lower portal offers only Lower prices", offered.length === 6 && offered.every((p) => lowerPrices.includes(p)));
}

// ---------- 7. Allowance counters (needs phase45) ----------
{
  const admin = createAdminClient();
  const { data: anyone } = await admin.from("profiles").select("id").limit(1).maybeSingle();
  const user = anyone?.id as string;
  const key = `test:pricing:${Date.now()}`;
  const results = await Promise.all(Array.from({ length: 8 }, () => admin.rpc("spend_ask_allowance", { p_user_id: user, p_month: key, p_monthly_limit: 5 })));
  const spent = results.filter((r) => r.data === "monthly").length;
  check("8 simultaneous questions against an allowance of 5: exactly 5 counted", spent === 5, `${spent} counted`);
  const day = `test-${Date.now()}`;
  const daily = await admin.rpc("take_ask_daily", { p_user_id: user, p_day: day, p_limit: 2 });
  if (daily.error) {
    console.log(`SKIP  daily fair-use counter: ${daily.error.code} (run supabase/phase45-pricing-tiers.sql)`);
  } else {
    const r2 = await admin.rpc("take_ask_daily", { p_user_id: user, p_day: day, p_limit: 2 });
    const r3 = await admin.rpc("take_ask_daily", { p_user_id: user, p_day: day, p_limit: 2 });
    check("daily fair-use: third question over a limit of 2 refused", daily.data === true && r2.data === true && r3.data === false);
  }
  // Only the rows this test made.
  await admin.from("ask_usage").delete().eq("user_id", user).in("month", [key, `day:${day}`]);
}

for (const id of made) await stripe.customers.del(id).catch(() => undefined);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
