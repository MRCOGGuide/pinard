"use client";

import { useId, useState, type ReactNode } from "react";

export type WeekItem = {
  key: string | number;
  title: string;
  /** The dates the week covers, beside its title. */
  dates: string;
  /** What is in it, in a few words. */
  summary: string;
  days: ReactNode;
};

/**
 * The plan's weeks, one open at a time.
 *
 * Asked for by the owner, 14 November 2026: "Make it compact -
 * candidates see the weeks, and when clicking on it, it expands and
 * shows that particular week's plan rather than they keep scrolling a
 * long way down." Every week was laid out in full, day by day, and a
 * plan of ten weeks ran to seventy rows.
 *
 * Each week is a row with its dates and what it holds; a press opens it
 * and closes whichever was open. The week with today in it is open to
 * begin with. Opening is by the week's own height (.faq-panel, as the
 * FAQ's answers), at once under reduced motion; a closed week is inert,
 * so Tab does not wander into it.
 */
export function Weeks({ weeks, initial }: { weeks: WeekItem[]; initial: number }) {
  const [open, setOpen] = useState(initial);
  const base = useId();

  return (
    <div className="space-y-3">
      {weeks.map((week, i) => {
        const shown = open === i;
        const panel = `${base}-${i}`;
        return (
          <div
            key={week.key}
            className="faq-item rounded-card border bg-surface shadow-card"
            data-open={shown || undefined}
          >
            <h2>
              <button
                type="button"
                aria-expanded={shown}
                aria-controls={panel}
                onClick={() => setOpen(shown ? -1 : i)}
                className="flex w-full items-center justify-between gap-4 rounded-card px-4 py-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-good sm:px-5"
              >
                <span className="min-w-0">
                  <span className="block font-display text-[20px] font-medium leading-snug text-ink-strong">
                    {week.title}
                    <span className="ml-2 font-ui text-[14px] font-normal text-ink/60">{week.dates}</span>
                  </span>
                  <span className="mt-0.5 block font-ui text-[14px] text-ink/65">{week.summary}</span>
                </span>
                <svg viewBox="0 0 16 16" className="faq-chevron h-4 w-4 shrink-0 text-ink/55" aria-hidden="true">
                  <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </h2>
            <div id={panel} role="region" aria-label={week.title} className="faq-panel" inert={!shown}>
              <div>
                <div className="border-t border-line">{week.days}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
