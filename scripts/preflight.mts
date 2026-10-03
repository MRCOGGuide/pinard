/**
 * What is not ready, said once, before any money moves.
 *
 *   npx tsx scripts/preflight.mts
 *
 * The launch checklist as something that runs rather than something
 * that is read. Everything here is a question this machine can answer
 * for itself: is the key set, does the price exist, is the webhook
 * secret in place, is the bank big enough to sell. The things it
 * cannot answer — whether a real card was charged and refunded,
 * whether the flows feel right on a phone — are printed at the end as
 * the list that is yours.
 *
 * Exits non-zero while anything is outstanding, so it can gate a
 * deploy if you ever want it to.
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;

type Check = { label: string; ok: boolean; detail: string };
const checks: Check[] = [];
const add = (label: string, ok: boolean, detail: string) =>
  checks.push({ label, ok, detail });

const set = (key: string) => Boolean(env[key]?.trim());

/* ---- the keys ---- */
add("Supabase URL and anon key", set("NEXT_PUBLIC_SUPABASE_URL") && set("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  "the app cannot read anything without these");
add("Supabase service role key", set("SUPABASE_SERVICE_ROLE_KEY"),
  "every server-side read of the library and the bank uses it");
add("Stripe secret key", set("STRIPE_SECRET_KEY"),
  "no checkout without it: the pricing buttons return an 'unconfigured' notice");
add("Stripe webhook secret", set("STRIPE_WEBHOOK_SECRET"),
  "without it a completed payment never becomes a subscription row");
add("Email sending", set("RESEND_API_KEY") || set("EMAIL_FROM"),
  "reminders and milestones have nowhere to go");
add("Site URL", set("NEXT_PUBLIC_APP_URL"),
  "used in Stripe's return URLs and in the sitemap");

/* ---- the switches ---- */
const launched = env.NEXT_PUBLIC_LAUNCHED === "true";
add("Launch switch", launched,
  launched
    ? "the site is public, indexable, and open to sign-ups"
    : "still private: sign-ups need an invite code, robots.txt disallows everything");
const gate = env.SITE_GATE_PASSWORD?.trim();
add("Construction gate", true,
  gate ? `on: every visitor must enter the code first` : "off");
add("Beta full access", env.BETA_FULL_ACCESS !== "true",
  env.BETA_FULL_ACCESS === "true"
    ? "every signed-in user has a full subscription without paying — fine for a pilot, wrong once money moves"
    : "off, so access follows the subscription");

/* ---- what the database says ---- */
const { createAdminClient } = await import("../src/lib/supabase/admin");
const db = createAdminClient();

/*
  A real select, not a head-only count.

  `select("*", { head: true })` answers 200 with a null count for a
  table that does not exist, so the first version of this said the
  phase 36 tables were present when nothing had been run — a checklist
  reporting that the step was done. Asking for a row makes the
  database say "Could not find the table", which is the question being
  asked.
*/
const exists = async (table: string): Promise<boolean> => {
  try {
    const { error } = await db.from(table).select("*").limit(1);
    return !error;
  } catch {
    return false;
  }
};

const count = async (table: string, build?: (q: any) => any) => {
  try {
    if (!(await exists(table))) return null;
    let q = db.from(table).select("*", { count: "exact", head: true });
    if (build) q = build(q);
    const { count: n, error } = await q;
    return error ? null : n;
  } catch {
    return null;
  }
};

const approved = await count("generated_questions", (q) => q.eq("status", "approved"));
add("Questions to sell", (approved ?? 0) > 0, `${approved ?? "unknown"} approved`);

const pending = await count("generated_questions", (q) => q.eq("status", "pending"));
if ((pending ?? 0) > 0) {
  add("Review queue", true, `${pending} still waiting — they are not served, so this is not a blocker`);
}

const prices = await count("billing_prices");
add("Prices configured", (prices ?? 0) >= 3, `${prices ?? "unknown"} tiers in billing_prices`);

/* The tables phase 08 needs, which arrive with their own migration. */
for (const table of ["invite_codes", "waitlist", "feedback"]) {
  const there = await exists(table);
  const n = there ? await count(table) : null;
  add(
    `Table ${table}`,
    there,
    there
      ? `present${n === null ? "" : `, ${n} row(s)`}`
      : "missing: run supabase/phase36-pilot.sql"
  );
}

/*
  Is the vector search indexed?

  Timed rather than looked up, because what matters is not whether an
  index exists but whether the planner uses it: an HNSW index built for
  a different operator than the one match_chunks orders by is simply
  ignored, silently. Sixteen thousand chunks scanned sequentially takes
  seconds and sometimes exceeds the statement timeout, which is how Ask
  Pinard comes to report that the library does not cover a question it
  does cover.
*/
try {
  const started = Date.now();
  const { error } = await db.rpc("match_chunks", {
    query_embedding: new Array(1024).fill(0.01),
    section_ids: null,
    match_count: 8,
  });
  const ms = Date.now() - started;
  if (error) {
    add("Vector search", false, `match_chunks failed: ${error.message.slice(0, 70)}`);
  } else {
    add(
      "Vector search indexed",
      ms < 500,
      ms < 500
        ? `whole-library search in ${ms}ms`
        : `${ms}ms for one search: that is a sequential scan. Run supabase/phase31-vector-index.sql`
    );
  }
} catch (e) {
  add("Vector search", false, e instanceof Error ? e.message : String(e));
}

/* ---- Stripe, if it is configured at all ---- */
if (set("STRIPE_SECRET_KEY")) {
  try {
    const { getStripe } = await import("../src/lib/stripe");
    const stripe = getStripe();
    if (stripe) {
      const list = await stripe.prices.list({ limit: 10, active: true });
      add("Stripe has live prices", list.data.length > 0,
        `${list.data.length} active price(s) in the Stripe account`);
      const mode = env.STRIPE_SECRET_KEY?.startsWith("sk_live") ? "live" : "test";
      add("Stripe mode", true,
        mode === "live"
          ? "LIVE keys: real cards, real money"
          : "test keys: nothing here charges anybody");
    }
  } catch (e) {
    add("Stripe reachable", false, e instanceof Error ? e.message : String(e));
  }
}

/* ---- say it ---- */
const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? "ok  " : "NOT "} ${c.label.padEnd(26)} ${c.detail}`);
}

console.log(`\n${checks.length - failed.length} of ${checks.length} ready.`);

console.log(`
Only you can do these:

  1. A real purchase, a cancellation and a refund, end to end, on the
     tier you expect most people to buy. The plan's own definition of
     done is that you have taken your own money through the product and
     got it back.
  2. Every flow on a phone and on a laptop, signed out and signed in.
     The signed-out half is walkable from here; the signed-in half is
     not, because I do not sign in.
  3. Run any migration listed above as missing.
  4. Then NEXT_PUBLIC_LAUNCHED=true, which opens sign-ups, drops the
     noindex, and fills the sitemap, all at once.
`);

process.exit(failed.length === 0 ? 0 : 1);
