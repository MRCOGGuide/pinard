"use client";

import { useId, useState, type ReactNode } from "react";
import { Numerals } from "@/components/Numerals";

export type WeekItem = {
  key: string | number;
  /** 1 for the first week of the plan: shown on the week's tile. */
  number: number;
  title: string;
  /** The dates the week covers. */
  dates: string;
  /** What is in it, in a few words. */
  summary: string;
  /** The figure on the right of the header (the week's questions), with its label. */
  figure?: ReactNode;
  figureLabel?: string;
  /** The week with today in it. */
  current?: boolean;
  days: ReactNode;
};

/**
 * The plan's weeks, one open at a time, as cards in the manner of the
 * modules on Practise, Progress and Mock (owner, 17 November 2026: "make
 * the Plan page weeks match the module cards too"): a tile of the
 * stage's green with the week's number on it where a module has its
 * emblem, the week and its dates and days, the questions it asks on the
 * right, and the chevron.
 *
 * One open at a time, as asked when the weeks were first folded (owner,
 * 14 November 2026: "Make it compact - candidates see the weeks, and
 * when clicking on it, it expands and shows that particular week's
 * plan"): a press opens a week and closes whichever was open. The week
 * with today in it is open to begin with, and says so. Opening is by the
 * week's own height (.faq-panel), at once under reduced motion; a closed
 * week is inert, so Tab does not wander into it.
 */
export function Weeks({ weeks, initial }: { weeks: WeekItem[]; initial: number }) {
  const [open, setOpen] = useState(initial);
  const base = useId();

  return (
    <div className="space-y-4">
      {weeks.map((week, i) => {
        const shown = open === i;
        const panel = `${base}-${i}`;
        return (
          <div
            key={week.key}
            className={`module-card overflow-hidden rounded-card border bg-surface shadow-card transition-colors duration-200 ${
              shown ? "border-good/35" : "border-line"
            }`}
          >
            <div className="faq-item" data-open={shown || undefined}>
              <h2>
                <button
                  type="button"
                  aria-expanded={shown}
                  aria-controls={panel}
                  onClick={() => setOpen(shown ? -1 : i)}
                  className="w-full px-4 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-good sm:px-5"
                >
                  <span className="flex items-center gap-4">
                    {/* The week's number on a tile, where a module has its emblem. */}
                    <span className="card-mark" aria-hidden="true">
                      <span className="text-[22px] font-bold leading-none tabular-nums">{week.number}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-[22px] font-medium leading-snug text-ink-strong">
                          <Numerals>{week.title}</Numerals>
                        </span>
                        {week.current && (
                          <span className="rounded-full bg-good px-2 py-0.5 font-ui text-label font-semibold text-on-brand">This week</span>
                        )}
                      </span>
                      <span className="mt-0.5 block font-ui text-[14px] text-ink/65">
                        <Numerals>{week.summary ? `${week.dates}, ${week.summary}` : week.dates}</Numerals>
                      </span>
                    </span>
                    {week.figure !== undefined && (
                      <span className="shrink-0 text-right">
                        <span className="block font-display text-[22px] leading-none tabular-nums text-ink-strong">{week.figure}</span>
                        {week.figureLabel && <span className="mt-1 block font-ui text-[12px] text-ink/65">{week.figureLabel}</span>}
                      </span>
                    )}
                    <svg viewBox="0 0 16 16" className="faq-chevron h-4 w-4 shrink-0 text-ink/55" aria-hidden="true">
                      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
              </h2>
              <div id={panel} role="region" aria-label={week.title} className="faq-panel" inert={!shown}>
                <div>
                  <div className="border-t border-line">{week.days}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
