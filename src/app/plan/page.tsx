import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { Countdown } from "@/components/Countdown";
import { createClient } from "@/lib/supabase/server";
import { getStudyPlan } from "@/lib/plan-service";
import type { PlanDayKind } from "@/lib/studyPlan";

const KIND_LABEL: Record<PlanDayKind, string> = {
  study: "Study",
  review: "Review",
  mixed: "Mock paper",
};
const KIND_STYLE: Record<PlanDayKind, string> = {
  study: "text-theatre",
  review: "text-greentop",
  mixed: "text-heartbeat",
};

export default async function PlanPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const today = new Date().toISOString().slice(0, 10);
  const result = await getStudyPlan(supabase, user.id, today);
  if (result.status === "needs_onboarding") redirect("/onboarding");

  const { plan, narrative, narrativeIsAI, examLabel } = result;

  return (
    <>
      <TraceHeader title="Your study plan" />

      <div className="mb-4">
        <Countdown days={plan.meta.days_remaining} examLabel={examLabel} />
      </div>

      <div className="rounded-card border border-hairline bg-porcelain p-5 shadow-card">
        <p className="text-sm leading-relaxed text-graphite/85">{narrative}</p>
        {!narrativeIsAI && (
          <p className="mt-2 text-xs text-graphite/45">
            A personalised summary will appear here once question generation is
            available.
          </p>
        )}
        <p className="mt-3 font-mono text-xs text-graphite/55">
          {plan.totals.study_days} study · {plan.totals.review_days} review ·{" "}
          {plan.totals.mixed_days} mock · {plan.totals.sections} topics
        </p>
      </div>

      <div className="mt-6 space-y-5">
        {plan.weeks.map((week) => (
          <section key={week.week_number}>
            <h2 className="mb-2 font-display text-lg font-semibold text-theatre">
              Week {week.week_number + 1}
            </h2>
            <ul className="space-y-1.5">
              {week.days.map((day) => {
                const isToday = day.date === today;
                return (
                  <li
                    key={day.date}
                    className={`rounded-card border p-3 ${
                      isToday
                        ? "border-greentop bg-sage"
                        : "border-hairline bg-porcelain"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-graphite">
                        {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(
                          "en-GB",
                          {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            timeZone: "UTC",
                          }
                        )}
                        {isToday && (
                          <span className="ml-2 font-mono text-[11px] text-greentop">
                            today
                          </span>
                        )}
                      </span>
                      <span
                        className={`font-mono text-[11px] uppercase ${KIND_STYLE[day.kind]}`}
                      >
                        {KIND_LABEL[day.kind]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-graphite/70">
                      {day.items.map((i) => i.title).join(" · ")}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-6">
        <Link
          href="/session"
          className="inline-block rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
        >
          Start today&rsquo;s session
        </Link>
      </div>
    </>
  );
}
