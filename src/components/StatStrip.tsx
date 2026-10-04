"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Explain } from "@/components/Explain";

/**
 * Where a candidate stands, in one line.
 *
 * This replaced a countdown, two figures, a sentence of arithmetic and
 * a milestone, stacked above the day's session. Five things competing
 * for the first glance is four too many on a page whose job is to get
 * someone practising, and prose is the wrong form for a number that
 * changes daily: "29 topics to bring up to 70%, 48 days left: about
 * 1.7 days for each" is a paragraph asking to be read when it should
 * be a figure asking to be glanced at.
 *
 * So: four figures, one row, bold, no card. What each one means is
 * behind an (i) rather than printed beside it, because the explanation
 * is read once and the figure is read every day.
 */

/**
 * A figure that counts up from zero as soon as it exists.
 *
 * Not CountUp, and deliberately not. CountUp's rule is that a number
 * already on screen is left alone: it refuses to snap to zero in front
 * of a reader who is looking at it. That is right for a landing-page
 * claim scrolled into view and wrong here, because this strip is the
 * first thing above the fold, so CountUp would never animate at all.
 * Here arriving at the figure is the whole effect.
 *
 * It renders the true value, so the server-rendered HTML carries the
 * real number and a reader without JavaScript sees it rather than a
 * zero. The drop to zero and the climb happen on mount.
 */
function Tally({ to, duration = 750 }: { to: number; duration?: number }) {
  const [value, setValue] = useState(to);
  const frame = useRef(0);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(to);
      return;
    }
    if (to === 0) return;

    setValue(0);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease out: quick away, settling on the figure rather than
      // stopping dead on it.
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [to, duration]);

  return <>{value.toLocaleString("en-GB")}</>;
}

function Metric({
  label,
  explain,
  tone = "text-ink-strong",
  children,
}: {
  label: string;
  explain: ReactNode;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-mono text-small font-semibold uppercase tracking-wide text-ink/60">
        {label}
        <Explain label={label}>{explain}</Explain>
      </span>
      <strong className={`font-mono text-reading font-bold ${tone}`}>
        {children}
      </strong>
    </span>
  );
}

const TONE = {
  red: "text-accent-ink",
  amber: "text-warn",
  green: "text-good",
} as const;

/*
  One-word labels, because four of them plus their figures have to fit
  the 720px reading measure at this size, and "Days to exam" was what
  pushed the row onto a second line. Measured at the worst case a
  candidate can reach (four digits answered, 100%, every section done)
  with room still to spare.
*/
export function StatStrip({
  daysRemaining,
  examLabel,
  readiness,
  questions,
  sections,
}: {
  daysRemaining: number | null;
  examLabel: string;
  readiness: { percent: number; band: "red" | "amber" | "green" };
  questions: { answered: number; total: number };
  sections: { complete: number; total: number; syllabus: number };
}) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline gap-x-5 gap-y-3">
      <Metric
        label="Days"
        explain={
          <>
            Whole days from today to your {examLabel} exam. Change the date on
            your account page and everything here moves with it.
          </>
        }
      >
        {daysRemaining === null ? "..." : <Tally to={daysRemaining} />}
      </Metric>

      <Metric
        label="Readiness"
        tone={TONE[readiness.band]}
        explain={
          <>
            Your average score across every topic the bank can serve, so a topic
            you have not opened counts as a zero. A topic&rsquo;s score counts in
            full once you have answered five of its questions, or all of them
            where it holds fewer. Answer everything correctly in every topic and
            this reads 100. It turns green at 70, which is the mark you need to
            be ready for the exam, but it keeps climbing above it.
          </>
        }
      >
        <Tally to={readiness.percent} />%
      </Metric>

      <Metric
        label="Questions"
        explain={
          <>
            Questions you have answered at least once, out of the{" "}
            {questions.total.toLocaleString("en-GB")} approved in the bank
            today. New questions are written continuously, so the second figure
            climbs as well.
          </>
        }
      >
        <Tally to={questions.answered} />
        <span className="font-normal text-ink/45">
          /{questions.total.toLocaleString("en-GB")}
        </span>
      </Metric>

      <Metric
        label="Sections"
        explain={
          <>
            Topics where you have answered every question, out of the{" "}
            {sections.total} the bank can currently serve. The syllabus holds{" "}
            {sections.syllabus} in all; the rest have no questions written yet,
            and counting those would make a total nobody could reach.
          </>
        }
      >
        <Tally to={sections.complete} />
        <span className="font-normal text-ink/45">/{sections.total}</span>
      </Metric>
    </div>
  );
}
