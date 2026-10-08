import { AiLabel } from "@/components/AiLabel";
import { withoutDashes } from "@/lib/narrative";
import { PASS_THRESHOLD } from "@/lib/performance";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { Countdown } from "@/components/Countdown";
import { createClient } from "@/lib/supabase/server";
import { getStudyPlan } from "@/lib/plan-service";
import { getAccess, hasFullAccess } from "@/lib/access";
import type { PlanDayKind } from "@/lib/studyPlan";
import { redirectToSignIn } from "@/lib/auth";
import { ScrollFade } from "@/components/scroll";

/**
 * This page generates the plan narrative, which is a model call — see
 * NARRATIVE_TIMEOUT_MS. Ten seconds is the default and the narrative
 * alone has been measured near six, leaving nothing for the plan.
 */
export const maxDuration = 60;


const KIND_LABEL: Record<PlanDayKind, string> = {
  study: "Study",
  review: "Review",
  mixed: "Mock paper",
};
const KIND_STYLE: Record<PlanDayKind, string> = {
  study: "text-ink-strong",
  review: "text-good",
  mixed: "text-accent-ink",
};

export default async function PlanPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirectToSignIn();

  const tier = await getAccess(supabase, user.id);
  if (!hasFullAccess(tier)) redirect("/pricing");

  const today = new Date().toISOString().slice(0, 10);
  const result = await getStudyPlan(supabase, user.id, today);
  if (result.status === "needs_onboarding") redirect("/onboarding");

  const { plan, narrativeIsAI, examLabel, units } = result;
  const narrative = withoutDashes(result.narrative);

  /*
    The sections the plan is concentrating on, in bold wherever they are
    named, at the owner's request: in the briefing and in each day's
    list. They are the sections below the pass mark, the ones given the
    extra time.
  */
  const focus = new Set(units.filter((u) => u.accuracy < PASS_THRESHOLD).map((u) => u.title));

  return (
    <>
      <TraceHeader title="Your study plan" />

      <div className="mb-4">
        <Countdown days={plan.meta.days_remaining} examLabel={examLabel} />
      </div>

      <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        {/* Labelled when the AI wrote it. The fallback is a fixed
            sentence built from the same figures, and says nothing. */}
        {narrativeIsAI && <AiLabel>Your briefing, written by AI</AiLabel>}
        <p className={`reading text-ink/90 ${narrativeIsAI ? "mt-2" : ""}`}>
          <Emphasised text={narrative} names={Array.from(focus)} />
        </p>
        <p className="mt-4 border-t border-line pt-3 font-ui text-[14px] text-ink/65">
          {plan.totals.study_days} study days, {plan.totals.review_days} review
          days and {plan.totals.mixed_days} mock days, across{" "}
          {plan.totals.sections} topics
        </p>
      </div>

      <div className="mt-8 space-y-8">
        {plan.weeks.map((week) => (
          <ScrollFade key={week.week_number}>
            <h2 className="mb-3 font-display text-[21px] font-semibold text-ink-strong">
              Week {week.week_number + 1}
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {week.days.map((day) => {
                const isToday = day.date === today;
                return (
                  <li
                    key={day.date}
                    aria-current={isToday ? "date" : undefined}
                    className={`px-4 py-3 ${isToday ? "bg-sunk shadow-[inset_3px_0_0_rgb(var(--c-good))]" : ""}`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="font-ui text-[15px] font-semibold text-ink-strong">
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
                          <span className="ml-2 rounded-full bg-good px-2 py-0.5 font-ui text-label font-semibold text-on-brand">
                            Today
                          </span>
                        )}
                      </span>
                      <span
                        className={`font-ui text-[14px] font-semibold ${KIND_STYLE[day.kind]}`}
                      >
                        {KIND_LABEL[day.kind]}
                      </span>
                    </div>
                    <p className="mt-1 font-ui text-[14px] leading-snug text-ink/70">
                      {day.items.map((i, n) => (
                        <span key={i.title}>
                          {n > 0 && ", "}
                          {focus.has(i.title) ? (
                            <strong className="font-semibold text-ink-strong">{i.title}</strong>
                          ) : (
                            i.title
                          )}
                        </span>
                      ))}
                    </p>
                  </li>
                );
              })}
            </ul>
          </ScrollFade>
        ))}
      </div>

      <div className="mt-8">
        <ButtonLink href="/session">Start today&rsquo;s session</ButtonLink>
      </div>
    </>
  );
}

/**
 * Text with the given names set in bold wherever they appear, matched
 * without regard to case ("Preterm birth" or "preterm birth"). Longest
 * names first, so a section whose name contains another's is matched
 * whole.
 */
function Emphasised({ text, names }: { text: string; names: string[] }) {
  const wanted = names.filter(Boolean).sort((a, b) => b.length - a.length);
  if (wanted.length === 0) return <>{text}</>;
  const escape = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(${wanted.map(escape).join("|")})`, "gi");
  const parts: ReactNode[] = text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-ink-strong">
        {part}
      </strong>
    ) : (
      part
    )
  );
  return <>{parts}</>;
}
