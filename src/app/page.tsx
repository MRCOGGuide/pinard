import Link from "next/link";
import { TraceHeader } from "@/components/TraceHeader";
import { AskLibrary } from "@/components/AskLibrary";
import { StatStrip } from "@/components/StatStrip";
import { getAccess, hasFullAccess } from "@/lib/access";
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

export default async function TodayPage() {
  const supabase = createClient();
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
        country={headers().get("x-vercel-ip-country")}
        testimonials={testimonials}
      />
    );
  }

  const plan = await getStudyPlan(supabase, user.id, todayISO());

  // Signed in but hasn't set an exam yet.
  if (plan.status === "needs_onboarding") {
    return (
      <>
        <TraceHeader title="Welcome to Pinard" />
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-sm leading-relaxed text-ink/80">
            Let&rsquo;s set up your revision. Choose your exam part and date, and
            your adaptive plan begins straight away.
          </p>
          <Link
            href="/onboarding"
            className="mt-5 inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good"
          >
            Set up my plan
          </Link>
        </div>
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
  const needsDiagnostic = !diag?.diagnostic_completed_at;

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

  // The Ask box is part of the subscription, like the plan itself. The
  // server action enforces that too — this keeps it from being offered
  // where it would only refuse.
  const access = await getAccess(supabase, user.id);
  const canAsk = hasFullAccess(access);
  const askAllowance = canAsk
    ? await getAskAllowance(supabase, user.id, access === "admin")
    : null;

  return (
    <>
      <TraceHeader title="Today" />

      <StatStrip
        daysRemaining={plan.plan.meta.days_remaining}
        examLabel={plan.examLabel}
        readiness={standing.readiness}
        questions={standing.questions}
        sections={standing.sections}
      />

      {needsDiagnostic && (
        <div className="mb-4 rounded-card border border-good/40 bg-surface p-6 shadow-card">
          <h2 className="font-display text-lg font-semibold text-ink-strong">
            Start with the diagnostic
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink/80">
            {canAsk
              ? "A screening across every topic. It finds your weakest areas so your plan targets them from day one."
              : "Fifteen questions, one from each of fifteen parts of the syllabus, in about a quarter of an hour. It will tell you where you are dropping marks."}
          </p>
          <Link
            href="/diagnostic"
            className="mt-4 inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good"
          >
            Take the diagnostic
          </Link>
        </div>
      )}

      <div className="rounded-card border border-line bg-surface p-6 shadow-card">
        {todayDay ? (
          <>
            <p className="text-sm leading-relaxed text-ink/85">
              {todayDay.kind === "mixed"
                ? "Today is a mixed mock paper across the syllabus."
                : todayDay.kind === "review"
                  ? "Today is a spaced review of topics you've secured."
                  : "Today's session focuses on "}
              {todayDay.kind === "study" && (
                <em className="font-display not-italic text-ink-strong">
                  {topics.slice(0, 3).join(", ")}
                </em>
              )}
              {todayDay.kind === "study" && "."}
            </p>
            <p className="mt-1 font-mono text-xs text-ink/55">
              about {targetTotal} questions
            </p>
          </>
        ) : (
          <p className="text-sm text-ink/80">
            No session scheduled for today, enjoy the breather, or practise
            off-plan any time.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/session"
            className="rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good"
          >
            Start today&rsquo;s session
          </Link>
          <Link
            href="/plan"
            className="rounded-card border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink/80 hover:text-ink-strong"
          >
            View full plan
          </Link>
        </div>
      </div>

      {canAsk && askAllowance && <AskLibrary allowance={askAllowance} />}
    </>
  );
}
