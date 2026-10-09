import type { ReactNode } from "react";
import { TraceHeader } from "@/components/TraceHeader";
import { Banner, ButtonLink } from "@/components/ui";
import { ScrollFade } from "@/components/scroll";
import { AskLibrary } from "@/components/AskLibrary";
import { StatStrip } from "@/components/StatStrip";
import { Explain } from "@/components/Explain";
import {
  diagnosticAvailability,
  DIAGNOSTIC_INTERVAL_DAYS,
} from "@/lib/diagnostic";
import { getAccess, hasFullAccess, isPilotCandidate } from "@/lib/access";
import { getPilotWindow, longDate, pilotPhase } from "@/lib/pilotDates";
import { getAskAllowance } from "@/lib/askAllowance";
import { createClient } from "@/lib/supabase/server";
import { getStudyPlan } from "@/lib/plan-service";
import { getBillingPrices } from "@/lib/billing";
import { getExamAvailability } from "@/lib/examAvailability";
import { getShowcase } from "@/lib/showcase";
import { getLibrarySize } from "@/lib/library";
import { getPricingSettings, getTestimonials } from "@/lib/offer";
import { getStanding } from "@/lib/standing";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyReview, isReviewOpen } from "@/lib/pilotReview";

/**
 * Ask Pinard runs as a server action from this route, and a server
 * action inherits the limit of the route that hosts it. A grounded
 * answer is retrieval — an embedding call and a vector search, about
 * 830ms warm and several seconds on a cold index — and then a model
 * call over the passages. Ten seconds is the default, and it is not
 * enough for that: the candidate would get a Gateway Timeout instead
 * of an answer, which is what the ten-second budget was already doing
 * to the plan narrative.
 */
export const maxDuration = 60;

import { Landing } from "@/components/landing/Landing";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * One thing Today offers: a heading, a line, and what to press.
 *
 * Today used to be three identical cards, the session, the diagnostic
 * and the pilot review, which read as three things of equal weight. The
 * session is the reason the page exists, so it leads; the others follow
 * in quieter cards of their own, each fading in and out as it is
 * scrolled to and away from.
 */
function Offer({
  title,
  children,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  action: ReactNode;
}) {
  return (
    <ScrollFade className="mt-4 rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="font-display text-[22px] font-semibold leading-snug text-ink-strong">
        {title}
      </h2>
      {children && (
        <p className="mt-1.5 max-w-[38rem] font-ui text-[16px] leading-relaxed text-ink/80">
          {children}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">{action}</div>
    </ScrollFade>
  );
}

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed out: the case for the product, not the app's own dashboard.
  if (!user) {
    // exam_availability is readable by signed-in users only, and this
    // page's whole audience is signed out. Read it server-side rather
    // than widening the policy: which exams are on sale is not secret,
    // but it is also nobody's business to write.
    const [prices, availability, showcase, library, pricing, testimonials] =
      await Promise.all([
        getBillingPrices(),
        getExamAvailability(createAdminClient()),
        getShowcase(),
        getLibrarySize(),
        getPricingSettings(),
        getTestimonials(),
      ]);
    return (
      <Landing
        prices={prices}
        availability={availability}
        showcase={showcase}
        library={library}
        pricing={pricing}
        country={(await headers()).get("x-vercel-ip-country")}
        testimonials={testimonials}
      />
    );
  }

  const plan = await getStudyPlan(supabase, user.id, todayISO());

  // Signed in but hasn't set an exam yet.
  if (plan.status === "needs_onboarding") {
    return (
      <>
        <TraceHeader
          title="Welcome to Pinard"
          lede="Tell Pinard which paper you are sitting and when, and your plan starts today."
        />
        <ButtonLink href="/onboarding">Set up my plan</ButtonLink>
      </>
    );
  }

  const today = todayISO();
  const todayDay = plan.plan.weeks
    .flatMap((w) => w.days)
    .find((d) => d.date === today);
  const targetTotal = todayDay
    ? todayDay.items.reduce((s, i) => s + i.question_target, 0)
    : 0;
  const topics = todayDay?.items.map((i) => i.title) ?? [];

  const { data: diag } = await supabase
    .from("profiles")
    .select("diagnostic_completed_at")
    .eq("id", user.id)
    .single();
  /*
    The card offers the first sitting and, four weeks later, the next
    one. It used to appear only until the first was done, which meant
    the one mechanism that sweeps topics the plan has stopped
    scheduling was offered once and then never mentioned again.
  */
  const diagnostic = diagnosticAvailability(
    diag?.diagnostic_completed_at,
    new Date()
  );
  const needsDiagnostic = diagnostic.status !== "waiting";

  /*
    Where they stand, on the screen they open every day.

    Readiness and the streak lived on /progress, which is a page a
    candidate visits when they already suspect the answer. The two
    numbers that change what someone does today belong on the page they
    land on, beside the countdown that gives them their meaning.

    The units come off the plan rather than being rebuilt: getStudyPlan
    has already read the sections, the performance rows and which
    sections the bank can serve, and asking for all three again to
    compute the same thing would be three queries to reach a number
    this page is already holding.
  */
  const standing = await getStanding(supabase, user.id, plan.units);

  // The pilot's closing review, asked once on the page they open every
  // day, and gone the moment they have sent it.
  const askForReview = (await isReviewOpen()) && !(await getMyReview(user.id));

  // The Ask box is part of the subscription, like the plan itself. The
  // server action enforces that too — this keeps it from being offered
  // where it would only refuse.
  const access = await getAccess(supabase, user.id);
  const canAsk = hasFullAccess(access);
  // An invited candidate outside the pilot's dates is on the free tier;
  // say why, rather than leaving them to wonder where the product went.
  const pilotWindow = !canAsk && (await isPilotCandidate(user.id)) ? await getPilotWindow() : null;
  const pilotNotice = pilotWindow ? pilotPhase(pilotWindow) : null;

  const askAllowance = canAsk
    ? await getAskAllowance(supabase, user.id, access === "admin")
    : null;

  return (
    <>
      <TraceHeader title="Today" />

      <ScrollFade as="div">
        <StatStrip
          daysRemaining={plan.plan.meta.days_remaining}
          examLabel={plan.examLabel}
          readiness={standing.readiness}
          questions={standing.questions}
          sections={standing.sections}
        />
      </ScrollFade>

      {pilotNotice === "before" && pilotWindow?.from && (
        <Banner tone="good" className="mb-5">
          The pilot starts on {longDate(pilotWindow.from)}. From then you have the
          full product: your plan, every question, the mock and Ask Pinard.
        </Banner>
      )}
      {pilotNotice === "after" && pilotWindow?.until && (
        <Banner className="mb-5">
          The pilot ended on {longDate(pilotWindow.until)}. Thank you for taking
          part. Your progress is kept, and a subscription picks up where you
          left off.
        </Banner>
      )}

      {/* The day's session first: it is what the page is for. */}
      <ScrollFade className="rounded-card border border-line bg-surface p-6 shadow-card">
        {todayDay ? (
          <>
            {/* A heading in the same voice as the other two cards, and
                the question count behind the (i) with it. The card led
                with a sentence where the others lead with a title, so
                the three read as three different kinds of thing when
                they are three offers of the same shape. */}
            <h2 className="font-display text-[24px] font-semibold leading-snug text-ink-strong">
              Today&rsquo;s session
              <Explain label="today's session">
                About {targetTotal} questions from the topics your plan has
                scheduled for today, plus any you answered wrongly before,
                which come back after three days, then ten, then
                twenty-five. A returning question is there to be learnt, so
                it does not count again towards your score for that topic.
              </Explain>
            </h2>
            <p className="reading mt-1.5 text-ink/85">
              {todayDay.kind === "mixed"
                ? "A mixed mock paper across the syllabus."
                : todayDay.kind === "review"
                  ? "A spaced review of topics you've secured."
                  : topics.slice(0, 3).join(", ")}
            </p>
          </>
        ) : (
          <p className="font-ui text-[16px] leading-relaxed text-ink/80">
            Nothing is scheduled for today. Take the day, or practise any topic
            you like.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href="/session">Start today&rsquo;s session</ButtonLink>
          <ButtonLink href="/plan" variant="secondary">
            See the full plan
          </ButtonLink>
        </div>
      </ScrollFade>

      <div>
        {needsDiagnostic && (
          <Offer
            title={
              <>
                {diagnostic.status === "never"
                  ? "Take the diagnostic"
                  : "Time for another diagnostic"}
                <Explain label="the diagnostic">
                  {diagnostic.status === "never"
                    ? canAsk
                      ? "One question from every topic, no feedback until the end. It finds your weakest areas so your plan targets them from day one."
                      : "Fifteen questions spread across Pinard's revision sections, five from each module, in about a quarter of an hour. It will tell you where you are dropping marks."
                    : `Your last one was ${diagnostic.daysSince} days ago. Your plan concentrates on weak topics, so a topic you secured early can go weeks unasked; this sweeps every one of them. Repeatable every ${DIAGNOSTIC_INTERVAL_DAYS} days.`}
                </Explain>
              </>
            }
            action={
              <ButtonLink href="/diagnostic" variant={diagnostic.status === "never" ? "primary" : "secondary"}>
                Start the diagnostic
              </ButtonLink>
            }
          >
            {diagnostic.status === "never"
              ? "It tells your plan where to start."
              : "A fresh sweep, so topics you secured early are checked again."}
          </Offer>
        )}

        {askForReview && (
          <Offer
            title="How was Pinard?"
            action={
              <ButtonLink href="/pilot-review" variant="secondary">
                Review Pinard
              </ButtonLink>
            }
          >
            The pilot is closing. Score each part of the site out of ten and tell
            us what to change: about five minutes, and it decides what we fix
            before launch.
          </Offer>
        )}
      </div>

      {canAsk && askAllowance && (
        <ScrollFade as="div">
          <AskLibrary allowance={askAllowance} />
        </ScrollFade>
      )}
    </>
  );
}
