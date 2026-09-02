import Link from "next/link";
import { TraceHeader } from "@/components/TraceHeader";
import { AskLibrary } from "@/components/AskLibrary";
import { Countdown } from "@/components/Countdown";
import { getAccess, hasFullAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getStudyPlan } from "@/lib/plan-service";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default async function TodayPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed out — a brief welcome.
  if (!user) {
    return (
      <>
        <TraceHeader
          title="Today"
          lede="Intelligent MRCOG revision, grounded in the evidence."
        />
        <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
          <p className="text-sm leading-relaxed text-graphite/80">
            Adaptive study plans and exam-style questions for MRCOG candidates
            worldwide, built around your exam date and your weakest topics.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-graphite/80">
            Every question is grounded in the latest RCOG, NICE and specialist
            society guidance — <strong className="text-theatre">updated
            monthly, not frozen in a textbook</strong> — and approved by
            Members of the RCOG who have passed the MRCOG themselves.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/sign-up"
              className="rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
            >
              Create an account
            </Link>
            <Link
              href="/sign-in"
              className="rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre"
            >
              Sign in
            </Link>
            <Link
              href="/pricing"
              className="rounded-card px-5 py-2.5 text-sm font-medium text-greentop hover:text-theatre"
            >
              See pricing
            </Link>
          </div>
        </div>
      </>
    );
  }

  const plan = await getStudyPlan(supabase, user.id, todayISO());

  // Signed in but hasn't set an exam yet.
  if (plan.status === "needs_onboarding") {
    return (
      <>
        <TraceHeader title="Welcome to Pinard" />
        <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
          <p className="text-sm leading-relaxed text-graphite/80">
            Let&rsquo;s set up your revision. Choose your exam part and date, and
            your adaptive plan begins straight away.
          </p>
          <Link
            href="/onboarding"
            className="mt-5 inline-block rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
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

  // The Ask box is part of the subscription, like the plan itself. The
  // server action enforces that too — this keeps it from being offered
  // where it would only refuse.
  const canAsk = hasFullAccess(await getAccess(supabase, user.id));

  return (
    <>
      <TraceHeader title="Today" />

      <div className="mb-5">
        <Countdown days={plan.plan.meta.days_remaining} examLabel={plan.examLabel} />
      </div>

      {needsDiagnostic && (
        <div className="mb-4 rounded-card border border-greentop/40 bg-porcelain p-6 shadow-card">
          <h2 className="font-display text-lg font-semibold text-theatre">
            Start with the diagnostic
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-graphite/80">
            A short screening across every topic. It finds your weakest areas
            so your plan targets them from day one.
          </p>
          <Link
            href="/diagnostic"
            className="mt-4 inline-block rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
          >
            Take the diagnostic
          </Link>
        </div>
      )}

      <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
        {todayDay ? (
          <>
            <p className="text-sm leading-relaxed text-graphite/85">
              {todayDay.kind === "mixed"
                ? "Today is a mixed mock paper across the syllabus."
                : todayDay.kind === "review"
                  ? "Today is a spaced review of topics you've secured."
                  : "Today's session focuses on "}
              {todayDay.kind === "study" && (
                <em className="font-display not-italic text-theatre">
                  {topics.slice(0, 3).join(", ")}
                </em>
              )}
              {todayDay.kind === "study" && "."}
            </p>
            <p className="mt-1 font-mono text-xs text-graphite/55">
              about {targetTotal} questions
            </p>
          </>
        ) : (
          <p className="text-sm text-graphite/80">
            No session scheduled for today — enjoy the breather, or practise
            off-plan any time.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/session"
            className="rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
          >
            Start today&rsquo;s session
          </Link>
          <Link
            href="/plan"
            className="rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre"
          >
            View full plan
          </Link>
        </div>
      </div>

      {canAsk && <AskLibrary />}
    </>
  );
}
