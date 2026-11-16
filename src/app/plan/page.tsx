import { AiLabel } from "@/components/AiLabel";
import { fallbackNarrative, isLongBrief, withoutDashes } from "@/lib/narrative";
import { PASS_THRESHOLD, confidenceOverridden } from "@/lib/performance";
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
import { Weeks, type WeekItem } from "@/components/Weeks";
import { diagnosticAvailability } from "@/lib/diagnostic";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectToSignIn();

  const tier = await getAccess(supabase, user.id);
  if (!hasFullAccess(tier)) redirect("/pricing");

  const today = new Date().toISOString().slice(0, 10);
  const [result, { data: profile }] = await Promise.all([
    getStudyPlan(supabase, user.id, today),
    supabase.from("profiles").select("diagnostic_completed_at").eq("id", user.id).single(),
  ]);
  if (result.status === "needs_onboarding") redirect("/onboarding");

  const { plan, examLabel, units } = result;
  /*
    A brief written to the earlier instructions ran to 130 words. Until
    the plan is next rebuilt and a short one written, the short fixed
    brief, built from the same figures, stands in for it (owner, 14
    November 2026: "it seems a little bit long - summarize it").
  */
  const stale = result.narrativeIsAI && isLongBrief(result.narrative);
  const narrativeIsAI = result.narrativeIsAI && !stale;
  const narrative = withoutDashes(stale ? fallbackNarrative(plan, units) : result.narrative);

  /*
    The sections the plan is concentrating on, in bold wherever they are
    named, at the owner's request: in the briefing and in each day's
    list. They are the sections below the pass mark, the ones given the
    extra time.
  */
  // Only on the evidence of answers: an unasked topic reads 0% without being weak.
  // Or on the candidate's own word, where they said not confident and answers have not yet spoken.
  const focus = new Set(
    units
      .filter(
        (u) =>
          (u.source === "answers" && (u.attempts ?? 0) > 0 && u.accuracy < PASS_THRESHOLD) ||
          (u.source === "rating" && u.rating === "not_confident")
      )
      .map((u) => u.title)
  );

  /*
    Whether this plan is still generic (owner, 16 November 2026: "if the
    candidate didn't take the diagnostic test yet, inform them that this
    plan is generic ... offer a button to take candidates directly to
    diagnostic"). Generic until the diagnostic has been sat; a candidate
    who has practised some topics is told the plan knows only those.
  */
  const servable = units.filter((u) => u.covered !== false);
  const answeredTopics = servable.filter((u) => (u.attempts ?? 0) > 0).length;
  const neverDiagnosed = diagnosticAvailability(profile?.diagnostic_completed_at, new Date()).status === "never";
  const ratedTopics = servable.filter((u) => u.rating).length;
  // Called confident, answered otherwise (owner, 16 November 2026: "the model override it").
  const overridden = confidenceOverridden(servable).map((u) => u.title);

  const short = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const weeks: (WeekItem & { today: boolean })[] = plan.weeks.map((week) => {
    const first = week.days[0]?.date;
    const last = week.days[week.days.length - 1]?.date;
    const count = (kind: PlanDayKind) => week.days.filter((d) => d.kind === kind).length;
    const parts = [
      [count("study"), "study day"],
      [count("review"), "review day"],
      [count("mixed"), "mock paper"],
    ]
      .filter(([n]) => (n as number) > 0)
      .map(([n, word]) => `${n} ${word}${n === 1 ? "" : "s"}`);
    return {
      key: week.week_number,
      title: `Week ${week.week_number + 1}`,
      dates: first && last ? (first === last ? short(first) : `${short(first)} to ${short(last)}`) : "",
      summary: parts.join(", "),
      today: week.days.some((d) => d.date === today),
      days: (
        <ul className="divide-y divide-line">
          {week.days.map((day) => {
            const isToday = day.date === today;
            return (
              <li
                key={day.date}
                aria-current={isToday ? "date" : undefined}
                className={`px-4 py-3 sm:px-5 ${isToday ? "bg-sunk shadow-[inset_3px_0_0_rgb(var(--c-good))]" : ""}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-ui text-[15px] font-semibold text-ink-strong">
                    {new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    })}
                    {isToday && (
                      <span className="ml-2 rounded-full bg-good px-2 py-0.5 font-ui text-label font-semibold text-on-brand">
                        Today
                      </span>
                    )}
                  </span>
                  <span className={`font-ui text-[14px] font-semibold ${KIND_STYLE[day.kind]}`}>
                    {KIND_LABEL[day.kind]}
                  </span>
                </div>
                {/* Every topic alike, a focus topic marked by a dot (owner,
                    16 November 2026: bold green beside plain black "doesn't
                    look good that way"). */}
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {day.items.map((i) => (
                    <li
                      key={i.title}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 font-ui text-[13px] text-ink/80"
                    >
                      {focus.has(i.title) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />}
                      {i.title}
                      {focus.has(i.title) && <span className="sr-only">, a focus topic</span>}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      ),
    };
  });

  return (
    <>
      {/* The countdown on the band, as Today's figures are. */}
      <TraceHeader title="Your study plan">
        <Countdown days={plan.meta.days_remaining} examLabel={examLabel} />
      </TraceHeader>

      {neverDiagnosed && (
        <section
          aria-labelledby="generic-plan"
          className="mb-6 rounded-card border border-warn/60 bg-surface p-5 shadow-card sm:p-6"
        >
          <h2 id="generic-plan" className="font-ui text-[17px] font-semibold text-ink-strong">
            {ratedTopics > 0 ? "This plan follows your own ratings for now" : "This plan is generic for now"}
          </h2>
          <p className="reading mt-2 text-ink/85">
            {ratedTopics > 0
              ? `You rated ${ratedTopics} of ${servable.length} topics, so the plan starts with the ones you are least sure of and asks early questions in the ones you feel confident in, to check. Your answers then take over.`
              : answeredTopics === 0
                ? "Pinard has not yet seen you answer, so this plan follows the syllabus and gives the most examined topics the most time."
                : `Pinard has seen you answer ${answeredTopics} of ${servable.length} topics, so for the rest this plan can only follow the syllabus.`}{" "}
            The diagnostic asks questions from every topic. Your plan then reorders itself around the topics where you need the time.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href="/diagnostic">Take the initial diagnostic test</ButtonLink>
            <ButtonLink href="/?rate=1" variant="secondary">
              {ratedTopics > 0 ? "Change my ratings" : "Rate my topics"}
            </ButtonLink>
          </div>
        </section>
      )}

      {overridden.length > 0 && (
        <section
          aria-labelledby="overridden"
          className="mb-6 rounded-card border border-accent/40 bg-surface p-5 shadow-card sm:p-6"
        >
          <h2 id="overridden" className="font-ui text-[17px] font-semibold text-ink-strong">
            Your answers say more work is needed
          </h2>
          <p className="reading mt-2 text-ink/85">
            You rated yourself confident in {listed(overridden)}, but your answers so far are below the {PASS_THRESHOLD}% pass
            mark, so your plan now gives {overridden.length === 1 ? "it" : "them"} more time.
          </p>
        </section>
      )}

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

      {/* The weeks, one open at a time, today's to begin with (Weeks). */}
      <div className="mt-8">
        {focus.size > 0 && (
          <p className="mb-3 flex items-center gap-2 font-ui text-[14px] text-ink/70">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            A topic your plan is concentrating on: below the {PASS_THRESHOLD}% pass mark, or one you rated not confident.
          </p>
        )}
        <Weeks weeks={weeks} initial={Math.max(0, weeks.findIndex((w) => w.today))} />
      </div>

      <div className="mt-8">
        <ButtonLink href="/session">Start today&rsquo;s session</ButtonLink>
      </div>
    </>
  );
}

/** "A", "A and B", "A, B and C". */
function listed(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
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
