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
 * The figure is the thing, so it is thirty pixels of bold mono beside
 * fourteen of ordinary sans: the number is what the eye should land
 * on, and a label competing with it in weight and case was making the
 * row read as eight things rather than four.
 *
 * Label then figure, along one line, the way it would be said aloud.
 * It was stacked for a while on the belief that four of these could
 * not fit a 720px measure inline, which measurement does not support:
 * at the widest the strip can ever be — 1,983/1,983 and 100% and
 * 35/35 — the inline row needs 673px of the 720 available. The
 * stacking was solving a problem that was not there, and it cost the
 * pairing between each label and its own number.
 *
 * Four across from the small breakpoint up, two by two below it.
 *
 * Measured, not chosen. Word labels beside their figures need 673px
 * of the 720 available on a desktop measure, which fits; on a 375px
 * phone they need 482px of 343, and shrinking them until they fit
 * lands at an 8px label against a 14px figure and still overflows by
 * thirteen pixels. One line of four is simply not available there at
 * a size anyone can read, so the row breaks rather than the type.
 *
 * Spread with justify-between, which is the one layout here that
 * gives equal gaps.
 *
 * Measured, after two wrong turns. Four equal grid columns left the
 * last figure stranded mid-column with the right-hand quarter of the
 * row empty. Equal columns with the outer two pinned to the edges and
 * the inner two centred looked like the fix and was worse: gaps of
 * 175, 90 and 140 pixels, so the row read as one figure, a pair
 * huddled in the middle, and another figure, which is what equal
 * COLUMNS do when the things inside them are different widths.
 * justify-between divides the leftover space rather than the width:
 * 135, 135 and 135, flush at both ends.
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
  children,
}: {
  label: string;
  explain: ReactNode;
  band: Band;
  children: ReactNode;
}) {
  return (
    <p className="flex items-baseline gap-1.5 whitespace-nowrap sm:gap-2">
      <span className="text-[11px] leading-relaxed text-ink/85 min-[360px]:text-[12px] sm:text-sm">
        {label}
        <Explain label={label}>{explain}</Explain>
      </span>
      <span
        className={`font-mono text-[19px] font-bold leading-none min-[360px]:text-[22px] sm:text-figure ${TONE[band]}`}
      >
        {children}
      </span>
    </p>
  );
}

/** The part of a figure that does not move, kept small beside one that does. */
function Of({ total }: { total: number }) {
  return (
    <span className="font-normal text-ink/40" style={{ fontSize: "0.55em" }}>
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
    <div className="mb-7 flex items-end justify-between gap-2">
      <Metric
        label="Days"
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
