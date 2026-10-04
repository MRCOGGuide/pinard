"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Explain } from "@/components/Explain";
import { daysBand } from "@/lib/performance";

/**
 * Where a candidate stands, in one row.
 *
 * This replaced a countdown, two figures, a sentence of arithmetic and
 * a milestone, stacked above the day's session. Five things competing
 * for the first glance is four too many on a page whose job is to get
 * someone practising, and prose is the wrong form for a number that
 * changes daily.
 *
 * The figure is the thing, so the figure is thirty pixels and its
 * label is twelve above it. Written inline, label and value on one
 * line, the four of them could not be read at a glance and could not
 * be made large enough to try: stacking buys the width back and puts
 * the number where the eye lands first.
 *
 * Each figure carries a colour, and the colours say different things
 * on purpose. Readiness bands against the 70% pass mark because there
 * is a mark to pass. Questions and sections band in thirds because
 * there is no pass mark, only a distance. The countdown bands the
 * other way up, since a big number is the comfortable one there.
 */

/**
 * A figure that counts up from zero as soon as it exists.
 *
 * Not CountUp, and deliberately not. CountUp's rule is that a number
 * already on screen is left alone: it refuses to snap to zero in front
 * of a reader who is looking at it. That is right for a landing-page
 * claim scrolled into view and wrong here, because this strip is the
 * first thing above the fold, so CountUp would never animate at all.
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

const TONE = {
  red: "text-accent-ink",
  amber: "text-warn",
  green: "text-good",
} as const;

export type Band = keyof typeof TONE;

function Metric({
  label,
  explain,
  band,
  children,
}: {
  label: string;
  explain: ReactNode;
  band: Band;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="font-mono text-small font-semibold uppercase tracking-wide text-ink/60">
        {label}
        <Explain label={label}>{explain}</Explain>
      </p>
      <p
        className={`mt-0.5 font-mono text-figure font-bold leading-none ${TONE[band]}`}
      >
        {children}
      </p>
    </div>
  );
}

/** The part of a figure that does not move, kept small beside one that does. */
function Of({ total }: { total: number }) {
  return (
    <span className="text-reading font-normal text-ink/40">
      /{total.toLocaleString("en-GB")}
    </span>
  );
}

export function StatStrip({
  daysRemaining,
  examLabel,
  readiness,
  questions,
  sections,
}: {
  daysRemaining: number | null;
  examLabel: string;
  readiness: { percent: number; band: Band };
  questions: { answered: number; total: number; band: Band };
  sections: { complete: number; total: number; syllabus: number; band: Band };
}) {
  return (
    <div className="mb-7 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
      <Metric
        label="Days"
        band={daysBand(daysRemaining)}
        explain={
          <>
            Days from today to your {examLabel} exam. Green above a month, amber
            through the last month, red in the final week.
          </>
        }
      >
        {daysRemaining === null ? "..." : <Tally to={daysRemaining} />}
      </Metric>

      <Metric
        label="Readiness"
        band={readiness.band}
        explain={
          <>
            Your average score across every topic the bank can serve, counting a
            topic you have not opened as zero. A topic counts in full once you
            have answered five of its questions. 70% is the mark you need; the
            figure keeps climbing above it.
          </>
        }
      >
        <Tally to={readiness.percent} />%
      </Metric>

      <Metric
        label="Questions"
        band={questions.band}
        explain={
          <>
            Questions you have answered, out of those approved in the bank
            today. New ones are written continuously, so the total climbs too.
          </>
        }
      >
        <Tally to={questions.answered} />
        <Of total={questions.total} />
      </Metric>

      <Metric
        label="Sections"
        band={sections.band}
        explain={
          <>
            Topics where you have answered every question, out of the{" "}
            {sections.total} the bank can serve. The syllabus holds{" "}
            {sections.syllabus}; the rest have no questions written yet.
          </>
        }
      >
        <Tally to={sections.complete} />
        <Of total={sections.total} />
      </Metric>
    </div>
  );
}
