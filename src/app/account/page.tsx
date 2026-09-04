import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { getAccess, hasFullAccess } from "@/lib/access";
import {
  ASK_TOPUP_PRICE_PENCE,
  ASK_TOPUP_QUESTIONS,
  getAskAllowance,
} from "@/lib/askAllowance";
import { getExamAvailability } from "@/lib/examAvailability";
import type { ExamPart } from "@/lib/types";
import { ExamSettings } from "./ExamSettings";
import { ReminderSettings } from "./ReminderSettings";

const TIER_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: { checkout?: string; topup?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [tier, { data: profile }, { data: sub }, availability] =
    await Promise.all([
      getAccess(supabase, user.id),
      supabase
        .from("profiles")
        .select(
          "stripe_customer_id, name, role, exam, exam_date, reminder_hour, reminders_enabled"
        )
        .eq("id", user.id)
        .single(),
      supabase
        .from("subscriptions")
        .select(
          "status, tier, current_period_end, cancel_at, founding_member"
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      getExamAvailability(supabase),
    ]);

  const askAllowance = hasFullAccess(tier)
    ? await getAskAllowance(supabase, user.id, tier === "admin")
    : null;

  const pilot = process.env.BETA_FULL_ACCESS === "true";
  const hasCustomer = Boolean(profile?.stripe_customer_id);

  return (
    <>
      <TraceHeader title="Account" eyebrow={user.email ?? undefined} />

      {searchParams.topup === "success" && (
        <p className="mb-4 rounded-card border border-greentop/40 bg-sage p-3 text-sm text-greentop">
          Thanks — {ASK_TOPUP_QUESTIONS} more Ask Pinard questions have been
          added. They carry over for as long as you stay subscribed.
        </p>
      )}

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
            {/* A cancelled subscription is still "active" in Stripe
                until the paid period runs out. Saying it renews on the
                day it actually stops is the worst thing this line
                could do, so the two states are told apart. */}
            {sub.cancel_at ? (
              <p className="mt-1 text-xs text-heartbeat">
                Cancelled — full access until{" "}
                <span className="font-mono">{longDate(sub.cancel_at)}</span>,
                then no further payment.
              </p>
            ) : (
              sub.current_period_end && (
                <p className="mt-1 font-mono text-xs text-graphite/55">
                  renews {longDate(sub.current_period_end)}
                </p>
              )
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

      {askAllowance && !askAllowance.unlimited && (
        <div className="mt-4 rounded-card border border-hairline bg-porcelain p-6 shadow-card">
          <h2 className="font-display text-lg font-semibold text-theatre">
            Ask Pinard
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-graphite/80">
            {askAllowance.monthlyUsed} of {askAllowance.monthlyLimit} questions
            used this month. Your allowance resets on the 1st.
          </p>
          {askAllowance.credits > 0 && (
            <p className="mt-1 text-sm text-graphite/80">
              Plus {askAllowance.credits} top-up{" "}
              {askAllowance.credits === 1 ? "question" : "questions"}, which
              carry over for as long as you stay subscribed.
            </p>
          )}
          <form action="/api/stripe/ask-topup" method="post" className="mt-4">
            <button
              type="submit"
              className="rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre"
            >
              Add {ASK_TOPUP_QUESTIONS} questions — £
              {(ASK_TOPUP_PRICE_PENCE / 100).toFixed(2)}
            </button>
          </form>
        </div>
      )}

      {profile?.exam && (
        <div className="mt-4">
          <ExamSettings
            exam={profile.exam as ExamPart}
            examDate={profile.exam_date ?? null}
            availability={availability}
            isAdmin={profile.role === "admin"}
          />
        </div>
      )}

      {profile?.exam && (
        <ReminderSettings
          enabled={profile.reminders_enabled !== false}
          hour={Number(profile.reminder_hour ?? 7)}
        />
      )}
    </>
  );
}
