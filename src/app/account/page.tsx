import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { betaFullAccess, getAccess, hasFullAccess } from "@/lib/access";
import { getAskAllowance } from "@/lib/askAllowance";
import { getPlan } from "@/lib/plan";
import { AskLimitPanel, AskMeter } from "@/components/AskMeter";
import { getExamAvailability } from "@/lib/examAvailability";
import type { ExamPart } from "@/lib/types";
import { ExamSettings } from "./ExamSettings";
import { ReminderSettings } from "./ReminderSettings";
import { DeleteAccount } from "./DeleteAccount";
import { Withdraw } from "./Withdraw";
import { formatMoney, withdrawableItems } from "@/lib/withdrawal";
import { redirectToSignIn } from "@/lib/auth";
import { ScrollFade } from "@/components/scroll";
import { Banner } from "@/components/ui";
import { Tally } from "@/components/Tally";

/** Old tier names, from before the four tiers, read as Basic. */
const TIER_LABEL: Record<string, string> = {
  basic: "Basic",
  plus: "Plus",
  premium: "Premium",
  monthly: "Basic",
  quarterly: "Basic",
  annual: "Basic",
};

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function AccountPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ checkout?: string; topup?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectToSignIn();

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

  const plan = await getPlan(supabase, user.id);
  const askAllowance = hasFullAccess(tier) ? await getAskAllowance(supabase, user.id, plan) : null;

  const pilot = betaFullAccess();
  const hasCustomer = Boolean(profile?.stripe_customer_id);

  // Purchases still inside their 14 days (Phase 11, lib/withdrawal).
  const withdrawable = hasCustomer ? await withdrawableItems(user.id) : [];

  /*
    Rebuilt at the owner's request: a stack of plain cards, one of them
    with a stray comma where a dash had been swept out ("Quarterly ,
    active"). Now a header with who you are, the subscription with its
    state as a live chip, the Ask Pinard allowance as a meter that fills,
    the exam as a countdown, a switch for the reminder, and the danger
    zone set apart. Each part fades in and out as it is scrolled to.
  */
  const name = (profile?.name as string | null)?.trim() || null;
  const initial = (name?.[0] ?? user.email?.[0] ?? "?").toUpperCase();
  const active = Boolean(sub && ["active", "trialing"].includes(sub.status));
  const planName =
    tier === "admin"
      ? "Admin"
      : active && sub
        ? (TIER_LABEL[sub.tier] ?? sub.tier)
        : pilot
          ? "Pilot"
          : "Free";

  return (
    <>
      <ScrollFade as="div" className="mb-8 flex items-center gap-4">
        <span className="pop-in flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand font-display text-[30px] font-semibold text-on-brand shadow-card">
          {initial}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[30px] font-semibold leading-tight text-ink-strong sm:text-[36px]">
            {name ?? "Your account"}
          </h1>
          <p className="truncate font-ui text-[15px] text-ink/70">{user.email}</p>
        </div>
      </ScrollFade>

      {searchParams.topup === "success" && (
        <Banner tone="good" className="mb-4">
          Thanks: your extra Ask Pinard questions have been added. They
          carry over for as long as you stay subscribed.
        </Banner>
      )}
      {searchParams.topup === "consent" && (
        <Banner tone="warn" className="mb-4">
          To buy a top-up, tick the box to confirm you want the questions
          straight away.
        </Banner>
      )}
      {searchParams.checkout === "success" && (
        <Banner tone="good" className="mb-4">
          Thanks: your subscription is active. It may take a moment to appear
          below.
        </Banner>
      )}

      <ScrollFade as="div" className="rounded-card border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-ui text-[14px] font-semibold text-ink/70">Subscription</h2>
            <p className="mt-1 font-display text-[30px] font-semibold leading-none text-ink-strong">
              {planName}
            </p>
          </div>
          {/* An admin's own billing row (a test subscription, say) is not
              their access, so it does not decide the chip. A candidate's
              reads Active, or Cancelled once they have cancelled and are
              running out the paid period. */}
          {(tier === "admin" || pilot || (active && !sub?.cancel_at)) && (
            <span className="inline-flex items-center gap-2 rounded-full bg-good/10 px-3 py-1 font-ui text-[14px] font-semibold text-good">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
              </span>
              Active
            </span>
          )}
          {tier !== "admin" && active && sub?.cancel_at && (
            <span className="rounded-full bg-accent/10 px-3 py-1 font-ui text-[14px] font-semibold text-accent-ink">
              Cancelled
            </span>
          )}
        </div>

        {tier === "admin" ? (
          <p className="mt-3 font-ui text-[16px] text-ink/80">Full access to everything.</p>
        ) : active && sub ? (
          <div className="mt-3 font-ui text-[16px] text-ink/80">
            {sub.founding_member && (
              <p className="mb-2">
                <span className="rounded-full border border-accent/40 px-2.5 py-0.5 font-ui text-label font-semibold text-accent-ink">
                  Founding member
                </span>
              </p>
            )}
            {/* A cancelled subscription is still "active" in Stripe
                until the paid period runs out. Saying it renews on the
                day it actually stops is the worst thing this line
                could do, so the two states are told apart. */}
            {sub.cancel_at ? (
              <p className="text-accent-ink">
                Full access until {longDate(sub.cancel_at)}, then no further
                payment.
              </p>
            ) : (
              sub.current_period_end && <p>Renews on {longDate(sub.current_period_end)}.</p>
            )}
          </div>
        ) : pilot ? (
          <p className="mt-3 font-ui text-[16px] text-ink/80">
            You have the full app free while Pinard is in its pilot.
          </p>
        ) : (
          <p className="mt-3 font-ui text-[16px] text-ink/80">
            15 sample questions, the sample diagnostic and a preview of your plan.{" "}
            <Link href="/pricing" className="font-medium text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
              See plans
            </Link>
          </p>
        )}

        {hasCustomer && (
          <form action="/api/stripe/portal" method="post" className="mt-5">
            <button
              type="submit"
              className="btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
            >
              Manage billing or cancel
            </button>
          </form>
        )}
      </ScrollFade>

      {withdrawable.length > 0 && user.email && (
        <ScrollFade as="div">
          <Withdraw
            email={user.email}
            name={(profile?.name as string) ?? ""}
            options={withdrawable.map((w) => ({
              id: w.id,
              label: w.label,
              price: formatMoney(w.amount, w.currency),
              bought: longDate(w.purchasedAt),
              until: longDate(w.until),
            }))}
          />
        </ScrollFade>
      )}

      {askAllowance && !askAllowance.unlimited && (
        <ScrollFade as="div" id="ask" className="mt-4 scroll-mt-24 rounded-card border border-line bg-surface p-6 shadow-card">
          <h2 className="font-ui text-[14px] font-semibold text-ink/70">Ask Pinard</h2>
          <p className="mt-1 font-display text-[30px] leading-none tabular-nums text-ink-strong">
            <Tally to={askAllowance.remaining} />
            <span className="font-ui text-[15px] text-ink/65"> questions left</span>
          </p>
          <AskMeter allowance={askAllowance} className="mt-4" />
          {/* Always offered here, not only near the limit: Account is
              where a candidate comes to buy more on purpose. */}
          <AskLimitPanel allowance={{ ...askAllowance, offerTopUp: true }} className="mt-4" />
        </ScrollFade>
      )}

      {profile?.exam && (
        <ScrollFade as="div" className="mt-4">
          <ExamSettings
            exam={profile.exam as ExamPart}
            examDate={profile.exam_date ?? null}
            availability={availability}
          />
        </ScrollFade>
      )}

      {/* Reminder emails come with a subscription; a free account is not sent any. */}
      {profile?.exam && hasFullAccess(tier) && (
        <ScrollFade as="div">
          <ReminderSettings
            enabled={profile.reminders_enabled !== false}
            hour={Number(profile.reminder_hour ?? 7)}
          />
        </ScrollFade>
      )}

      <ScrollFade as="div" className="mt-4 rounded-card border border-line bg-surface p-6 shadow-card">
        <h2 className="font-ui text-[14px] font-semibold text-ink/70">Your data</h2>
        <p className="mt-1 font-ui text-[16px] leading-relaxed text-ink/80">
          A copy of everything Pinard holds that is linked to your account, as a file you can keep or take
          elsewhere. Our{" "}
          <Link href="/privacy" className="font-medium text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
            privacy policy
          </Link>{" "}
          explains what each part is.
        </p>
        <a
          href="/api/account/export"
          download
          className="btn-motion mt-4 inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
        >
          Download my data
        </a>
      </ScrollFade>

      {profile?.role !== "admin" && user.email && (
        <ScrollFade as="div">
          <DeleteAccount email={user.email} />
        </ScrollFade>
      )}
    </>
  );
}
