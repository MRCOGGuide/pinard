"use client";

import type { ReactNode } from "react";
import { Explain } from "@/components/Explain";
import { Tally } from "@/components/Tally";
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
 * Four equal columns, with the outer two pinned to the edges and the
 * inner two centred in their own share. Equal columns alone left the
 * last figure stranded in the middle of its column with the
 * right-hand quarter of the row empty; justify-between reached both
 * edges but spaced the four by their own widths, so a long figure
 * shoved its neighbours about and the row moved every time a number
 * gained a digit. This is both: fixed rhythm, flush edges.
 *
 * Sizes step down twice on the way to a phone, measured rather than
 * guessed. 22px over 9px keeps all four on one line in 343px, which
 * is a 375px screen less its gutters; 19px over 8px does the same in
 * 288px, which is the narrowest phone still in use. Both were checked
 * against the widest figures the strip can ever hold, 1,983/1,983 and
 * 100% and 35/35, rather than against a plausible-looking day. At the
 * desktop size they wrap to two rows on a phone, which is the thing
 * this is avoiding.
 *
 * Each figure carries a colour, and the colours say different things
 * on purpose. Readiness bands against the 70% pass mark because there
 * is a mark to pass. Questions and sections band in thirds because
 * there is no pass mark, only a distance. The countdown bands the
 * other way up, since a big number is the comfortable one there.
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
  align = "center",
  children,
}: {
  label: string;
  explain: ReactNode;
  band: Band;
  /** Where the cell sits inside its equal share of the row. */
  align?: "start" | "center" | "end";
  children: ReactNode;
}) {
  return (
    <div
      className={
        align === "start"
          ? "justify-self-start text-left"
          : align === "end"
            ? "justify-self-end text-right"
            : "justify-self-center text-center"
      }
    >
      <p className="whitespace-nowrap font-mono text-[8px] font-semibold uppercase tracking-wide text-ink/60 min-[360px]:text-[9px] sm:text-small">
        {label}
        <Explain label={label}>{explain}</Explain>
      </p>
      <p
        className={`mt-1 whitespace-nowrap font-mono text-[19px] font-bold leading-none min-[360px]:text-[22px] sm:text-figure ${TONE[band]}`}
      >
        {children}
      </p>
    </div>
  );
}

/** The part of a figure that does not move, kept small beside one that does. */
function Of({ total }: { total: number }) {
  return (
    <span className="text-[10px] font-normal text-ink/40 min-[360px]:text-[12px] sm:text-reading">
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
    <div className="mb-7 grid grid-cols-4 items-end gap-2">
      <Metric
        label="Days"
        align="start"
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
        label="Sections"
        align="end"
        band={sections.band}
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
