import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";

const TIER_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: { checkout?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [tier, { data: profile }, { data: sub }] = await Promise.all([
    getAccess(supabase, user.id),
    supabase.from("profiles").select("stripe_customer_id, name").eq("id", user.id).single(),
    supabase
      .from("subscriptions")
      .select("status, tier, current_period_end, founding_member")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const pilot = process.env.BETA_FULL_ACCESS === "true";
  const hasCustomer = Boolean(profile?.stripe_customer_id);

  return (
    <>
      <TraceHeader title="Account" eyebrow={user.email ?? undefined} />

      {searchParams.checkout === "success" && (
        <p className="mb-4 rounded-card border border-greentop/40 bg-sage p-3 text-sm text-greentop">
          Thanks — your subscription is active. It may take a moment to appear
          below.
        </p>
      )}

      <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
        <h2 className="font-display text-lg font-semibold text-theatre">
          Subscription
        </h2>

        {tier === "admin" ? (
          <p className="mt-2 text-sm text-graphite/80">
            You&rsquo;re an admin — full access to everything.
          </p>
        ) : sub && ["active", "trialing"].includes(sub.status) ? (
          <div className="mt-2 text-sm text-graphite/80">
            <p>
              <span className="font-medium text-greentop">
                {TIER_LABEL[sub.tier] ?? sub.tier}
              </span>{" "}
              — {sub.status}
              {sub.founding_member && (
                <span className="ml-2 rounded-full border border-heartbeat/40 px-2 py-0.5 font-mono text-[10px] text-heartbeat">
                  founding member
                </span>
              )}
            </p>
            {sub.current_period_end && (
              <p className="mt-1 font-mono text-xs text-graphite/55">
                renews{" "}
                {new Date(sub.current_period_end).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        ) : pilot ? (
          <p className="mt-2 text-sm text-graphite/80">
            Pilot access — you have the full app free while Pinard is in beta.
          </p>
        ) : (
          <p className="mt-2 text-sm text-graphite/80">
            You&rsquo;re on the free tier.{" "}
            <Link href="/pricing" className="font-medium text-greentop">
              See plans
            </Link>
            .
          </p>
        )}

        {hasCustomer && (
          <form action="/api/stripe/portal" method="post" className="mt-5">
            <button
              type="submit"
              className="rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre"
            >
              Manage billing
            </button>
          </form>
        )}
      </div>
    </>
  );
}
