import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { Numerals } from "@/components/Numerals";
import { CATCH_UP_DAYS, type MissedDay } from "@/lib/studyPlan";

const KIND: Record<MissedDay["kind"], string> = { study: "Study", review: "Review", mixed: "Mock paper" };

const dayName = (date: string, weekday: "short" | "long" = "short") =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday,
    day: "numeric",
    month: weekday === "long" ? "long" : "short",
    timeZone: "UTC",
  });

/**
 * The days of the past week whose topics are still to do, each with a
 * button that catches it up (owner, 17 November 2026: "make it that a
 * missed day shows up and offer the candidate a chance to go through
 * missed day of revision topics"). On Today and above the plan's weeks.
 *
 * `shown` limits the rows (Today shows a few and sends the rest to the
 * plan); `from` is where the catch-up session goes back to.
 */
export function MissedDays({
  days,
  from,
  shown,
  className = "",
}: {
  days: MissedDay[];
  from: "today" | "plan";
  shown?: number;
  className?: string;
}) {
  if (days.length === 0) return null;
  const rows = shown ? days.slice(0, shown) : days;
  const more = days.length - rows.length;
  return (
    <section aria-labelledby="missed-days" className={`rounded-card border border-accent/30 bg-surface shadow-card ${className}`}>
      <div className="px-5 pt-5 sm:px-6">
        <h2 id="missed-days" className="font-display text-[24px] font-medium leading-snug text-ink-strong">
          {days.length === 1 ? "A missed day" : <Numerals>{`${days.length} missed days`}</Numerals>}
        </h2>
        <p className="reading mt-1.5 text-ink/85">
          <Numerals>
            {`Topics your plan set in the past ${CATCH_UP_DAYS} days that you have not practised yet. Catch up on ${
              days.length === 1 ? "it" : "any of them"
            }, or carry on with today’s session. Each is offered for a week.`}
          </Numerals>
        </p>
      </div>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {rows.map((day) => (
          <li key={day.date} className="px-5 py-3.5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span className="font-ui text-[15px] font-semibold text-ink-strong">
                <Numerals>{dayName(day.date)}</Numerals>
                <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 font-ui text-label font-semibold text-accent-ink">
                  {KIND[day.kind]}, missed
                </span>
              </span>
              <ButtonLink
                href={`/session?day=${day.date}${from === "today" ? "&from=today" : ""}`}
                size="sm"
                variant="secondary"
                aria-label={`Catch up on ${dayName(day.date, "long")}`}
              >
                Catch up
              </ButtonLink>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {day.items.map((i) => (
                <li
                  key={i.section_id}
                  className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-ui text-[13px] text-ink/80"
                >
                  {i.title}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="border-t border-line px-5 py-3 font-ui text-[14px] text-ink/70 sm:px-6">
          <Link href="/plan" className="font-semibold text-good underline-offset-2 hover:underline">
            <Numerals>{`${more} more missed day${more === 1 ? "" : "s"} on your plan`}</Numerals>
          </Link>
        </p>
      )}
    </section>
  );
}
