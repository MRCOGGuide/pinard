import { TraceHeader } from "@/components/TraceHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/all";
import { regionForCountry } from "@/config/pricing";

export const dynamic = "force-dynamic";

/**
 * Conversion and sharing flags (pricing Phase 2, G and the abuse rules).
 *
 * Conversion: the funnel events of the last 30 days, by plan and by
 * country. Events carry no identifiers beyond the account of a signed-in
 * candidate, and none at all where the browser asked not to be tracked,
 * so these are lower bounds, not a census.
 *
 * Sharing flags: accounts signing in from three or more countries in a
 * week, or mostly from outside the region they pay for. For the owner to
 * look at, nothing more: travel is legitimate, and no account is acted
 * on automatically.
 */
type Ev = { event: string; tier: string | null; plan_interval: string | null; country: string | null; user_id: string | null; created_at: string };
type Signin = { user_id: string; day: string; country: string; sign_ins: number };

const EVENTS = ["pricing_viewed", "toggle_used", "plan_chosen", "checkout_started", "checkout_completed", "limit_reached", "upgrade_clicked"];
const LABEL: Record<string, string> = {
  pricing_viewed: "Pricing viewed",
  toggle_used: "Billing period switched",
  plan_chosen: "Plan chosen",
  checkout_started: "Checkout started",
  checkout_completed: "Checkout completed",
  limit_reached: "Ask Pinard limit reached",
  upgrade_clicked: "Upgrade clicked",
};

function pct(a: number, b: number) {
  return b ? `${Math.round((a / b) * 100)}%` : "–";
}

export default async function ConversionPage() {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  let events: Ev[] = [];
  let signins: Signin[] = [];
  let missing = false;
  try {
    events = await fetchAll<Ev>((f, t) => admin.from("funnel_events").select("*").gte("created_at", since).range(f, t));
    signins = await fetchAll<Signin>((f, t) => admin.from("signin_countries").select("*").gte("day", since.slice(0, 10)).range(f, t));
  } catch {
    missing = true;
  }

  const count = (e: string, pred: (x: Ev) => boolean = () => true) => events.filter((x) => x.event === e && pred(x)).length;

  const tiers = ["basic", "plus", "premium"];
  const countries = [...new Set(events.map((e) => e.country ?? "–"))]
    .map((c) => ({ c, viewed: count("pricing_viewed", (x) => (x.country ?? "–") === c) }))
    .sort((a, b) => b.viewed - a.viewed)
    .slice(0, 20);

  // Sharing flags.
  const { data: subs } = await admin.from("subscriptions").select("*");
  const regionOf = new Map((subs ?? []).map((s) => [s.user_id as string, (s.plan_region as string | null) ?? null]));
  const byUser = new Map<string, Signin[]>();
  for (const s of signins) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const flags: { user: string; reason: string; countries: string }[] = [];
  for (const [user, rows] of byUser) {
    const week = new Set(rows.filter((r) => r.day >= weekAgo).map((r) => r.country));
    const total = rows.reduce((n, r) => n + r.sign_ins, 0);
    const paid = regionOf.get(user);
    const outside = paid ? rows.filter((r) => regionForCountry(r.country) !== paid).reduce((n, r) => n + r.sign_ins, 0) : 0;
    const list = [...new Set(rows.map((r) => r.country))].join(", ");
    if (week.size >= 3) flags.push({ user, reason: `${week.size} countries in the last 7 days`, countries: list });
    else if (paid && total >= 5 && outside / total > 0.5) flags.push({ user, reason: `${Math.round((outside / total) * 100)}% of sign-ins outside the ${paid} region it pays for`, countries: list });
  }
  const emails = new Map<string, string>();
  if (flags.length) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) emails.set(u.id, u.email ?? u.id);
  }

  return (
    <>
      <TraceHeader title="Conversion" eyebrow="Owner area" lede="The last 30 days, from the pricing page to a paid plan, and accounts worth a look." />
      {missing && (
        <p className="mb-5 rounded-card border border-accent/40 bg-surface p-3 text-sm text-accent-ink">
          The tables for this page are not in place yet: run <code>supabase/phase45-pricing-tiers.sql</code>.
        </p>
      )}

      <h2 className="mb-3 font-display text-xl font-semibold text-ink-strong">Funnel</h2>
      <div className="mb-8 overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-[560px] border-collapse text-left font-ui text-[14px]">
          <thead className="bg-sunk">
            <tr>
              <th scope="col" className="px-3 py-2">Step</th>
              <th scope="col" className="px-3 py-2">All</th>
              {tiers.map((t) => (
                <th key={t} scope="col" className="px-3 py-2 capitalize">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((e) => (
              <tr key={e} className="border-t border-line">
                <th scope="row" className="px-3 py-2 font-normal">{LABEL[e]}</th>
                <td className="px-3 py-2 tabular-nums">{count(e)}</td>
                {tiers.map((t) => (
                  <td key={t} className="px-3 py-2 tabular-nums">{e === "pricing_viewed" || e === "toggle_used" ? "–" : count(e, (x) => x.tier === t)}</td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-line bg-sunk">
              <th scope="row" className="px-3 py-2 font-semibold">Pricing view to paid</th>
              <td className="px-3 py-2 font-semibold">{pct(count("checkout_completed"), count("pricing_viewed"))}</td>
              {tiers.map((t) => (
                <td key={t} className="px-3 py-2">{pct(count("checkout_completed", (x) => x.tier === t), count("plan_chosen", (x) => x.tier === t))} of choices</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 font-display text-xl font-semibold text-ink-strong">By country</h2>
      <div className="mb-8 overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-[480px] border-collapse text-left font-ui text-[14px]">
          <thead className="bg-sunk">
            <tr>
              <th scope="col" className="px-3 py-2">Country</th>
              <th scope="col" className="px-3 py-2">Pricing viewed</th>
              <th scope="col" className="px-3 py-2">Checkout started</th>
              <th scope="col" className="px-3 py-2">Paid</th>
              <th scope="col" className="px-3 py-2">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {countries.map(({ c, viewed }) => {
              const paid = count("checkout_completed", (x) => (x.country ?? "–") === c);
              return (
                <tr key={c} className="border-t border-line">
                  <th scope="row" className="px-3 py-2 font-normal">{c}</th>
                  <td className="px-3 py-2 tabular-nums">{viewed}</td>
                  <td className="px-3 py-2 tabular-nums">{count("checkout_started", (x) => (x.country ?? "–") === c)}</td>
                  <td className="px-3 py-2 tabular-nums">{paid}</td>
                  <td className="px-3 py-2">{pct(paid, viewed)}</td>
                </tr>
              );
            })}
            {countries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-ink/65">No events yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 font-display text-xl font-semibold text-ink-strong">Accounts worth a look</h2>
      <p className="mb-3 text-sm text-ink/65">Possible sharing or a price region that does not match where the account is used. Travel is legitimate: nothing here is acted on automatically.</p>
      <ul className="space-y-2 font-ui text-[14px]">
        {flags.map((f) => (
          <li key={f.user} className="rounded-control border border-line bg-surface px-3 py-2">
            <span className="font-semibold text-ink-strong">{emails.get(f.user) ?? f.user}</span>: {f.reason}. Countries: {f.countries}.
          </li>
        ))}
        {flags.length === 0 && <li className="text-ink/65">None in the last 30 days.</li>}
      </ul>
    </>
  );
}
