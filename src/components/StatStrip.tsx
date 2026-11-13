"use client";

import { useState, type ReactNode } from "react";
import { Explain } from "@/components/Explain";
import { Tally } from "@/components/Tally";
import { daysBand } from "@/lib/performance";
import { GradeBar } from "@/components/GradeBar";
import { FigureObjects, type FigureValues } from "@/components/figures/FigureObjects";

/**
 * Where a candidate stands, at the top of Today.
 *
 * Four figures in one card, each with its label above it and a thin
 * bar beneath where the figure is a share of something. Rebuilt at the
 * owner's request: the row of bold figures sitting loose on the page
 * read as the old style. The figures are now the heading face at a
 * regular weight, coloured by the site's one rule (red in the first
 * third, amber to 70%, green from there; the countdown runs the other
 * way, since a big number is the comfortable one there).
 *
 * Two by two on a phone, four across from the small breakpoint up. The
 * cells are divided by the card's own background showing through a 1px
 * gap, so the rules meet cleanly at the cross on a phone.
 *
 * Since 13 November each figure has a small machined object beside it,
 * made and lit as the landing page's horn is, that shows the figure
 * (components/figures): an hourglass, a ring filled to the readiness,
 * discs on a spindle, a dial of the topics. They take the place of the
 * bars, which come back only where the browser cannot draw them.
 */

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
  share,
  flat,
  children,
}: {
  label: string;
  explain: ReactNode;
  band: Band;
  /** 0 to 1, drawn as a bar under the figure where there is no object;
   *  none for the countdown. */
  share?: number;
  /** No object can be drawn: the bar instead. */
  flat: boolean;
  children: ReactNode;
}) {
  return (
    <div className="bg-surface px-4 py-4 sm:px-5">
      <p className="font-ui text-[14px] text-ink/70">
        {label}
        <Explain label={label}>{explain}</Explain>
      </p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p className={`font-display text-[32px] font-normal leading-none tabular-nums ${TONE[band]}`}>
          {children}
        </p>
        {!flat && <span data-figure aria-hidden="true" className="figure-slot h-14 w-14 shrink-0 sm:h-16 sm:w-16" />}
      </div>
      {flat &&
        (share !== undefined ? (
          <GradeBar percent={share * 100} className="mt-3 h-1" />
        ) : (
          <span className="mt-3 block h-1" aria-hidden="true" />
        ))}
    </div>
  );
}

/** The part of a figure that does not move, kept small beside one that does. */
function Of({ total }: { total: number }) {
  return (
    <span className="font-ui text-[15px] text-ink/65">
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
  const [flat, setFlat] = useState(false);
  const values: FigureValues = {
    days: daysBand(daysRemaining),
    readiness: { share: readiness.percent / 100, band: readiness.band },
    questions: {
      share: questions.total > 0 ? questions.answered / questions.total : 0,
      band: questions.band,
    },
    topics: { done: sections.complete, total: sections.total, band: sections.band },
  };
  return (
    <div className="relative mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line shadow-card sm:grid-cols-4">
      <Metric
        label="Days to go"
        flat={flat}
        band={daysBand(daysRemaining)}
        explain={
          <>
            Days to your {examLabel} exam. Green above a month, amber through
            the last month, red in the final week.
          </>
        }
      >
        {daysRemaining === null ? "..." : <Tally to={daysRemaining} />}
      </Metric>

      <Metric
        label="Readiness"
        flat={flat}
        band={readiness.band}
        share={readiness.percent / 100}
        explain={
          <>
            Your average score across every topic, counting one you have not
            opened as zero. A topic counts in full after five of its questions.
            70% is the mark you need, and it climbs past it.
          </>
        }
      >
        <Tally to={readiness.percent} />%
      </Metric>

      <Metric
        label="Questions"
        flat={flat}
        band={questions.band}
        share={questions.total > 0 ? questions.answered / questions.total : 0}
        explain={
          <>
            Questions you have answered, out of the bank today. New ones are
            written continuously, so the total climbs too.
          </>
        }
      >
        <Tally to={questions.answered} />
        <Of total={questions.total} />
      </Metric>

      <Metric
        label="Topics done"
        flat={flat}
        band={sections.band}
        share={sections.total > 0 ? sections.complete / sections.total : 0}
        explain={
          <>
            Topics where you have answered every question, out of the{" "}
            {sections.total} the bank can serve. The syllabus holds{" "}
            {sections.syllabus}; the rest have no questions yet.
          </>
        }
      >
        <Tally to={sections.complete} />
        <Of total={sections.total} />
      </Metric>

      {/* Mounted afresh if the figures change, so they arrive again. */}
      {!flat && <FigureObjects key={JSON.stringify(values)} values={values} onFlat={() => setFlat(true)} />}
    </div>
  );
}
