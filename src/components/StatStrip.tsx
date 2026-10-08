"use client";

import type { ReactNode } from "react";
import { Explain } from "@/components/Explain";
import { Tally } from "@/components/Tally";
import { daysBand } from "@/lib/performance";

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
 */

const TONE = {
  red: "text-accent-ink",
  amber: "text-warn",
  green: "text-good",
} as const;

const FILL = {
  red: "bg-accent",
  amber: "bg-warn",
  green: "bg-good",
} as const;

export type Band = keyof typeof TONE;

function Metric({
  label,
  explain,
  band,
  share,
  children,
}: {
  label: string;
  explain: ReactNode;
  band: Band;
  /** 0 to 1, drawn as a bar under the figure; none for the countdown. */
  share?: number;
  children: ReactNode;
}) {
  return (
    <div className="bg-surface px-4 py-4 sm:px-5">
      <p className="font-ui text-[14px] text-ink/70">
        {label}
        <Explain label={label}>{explain}</Explain>
      </p>
      <p className={`mt-1.5 font-display text-[32px] font-normal leading-none tabular-nums ${TONE[band]}`}>
        {children}
      </p>
      <span className="mt-3 block h-1 overflow-hidden rounded-full bg-sunk" aria-hidden="true">
        {share !== undefined && share > 0 && (
          <span
            className={`bar-grow block h-full rounded-full ${FILL[band]}`}
            style={{ width: `${Math.min(100, Math.round(share * 100))}%` }}
          />
        )}
      </span>
    </div>
  );
}

/** The part of a figure that does not move, kept small beside one that does. */
function Of({ total }: { total: number }) {
  return (
    <span className="font-ui text-[15px] text-ink/45">
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
    <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line shadow-card sm:grid-cols-4">
      <Metric
        label="Days to go"
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
    </div>
  );
}
