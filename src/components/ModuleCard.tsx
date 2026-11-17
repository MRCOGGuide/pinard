"use client";

import { useId, useState, type ReactNode } from "react";
import { GradeBar } from "@/components/GradeBar";
import { ScrollFade } from "@/components/scroll";
import { ModuleMark, moduleKind } from "@/components/ModuleMark";

/**
 * A syllabus module as a card that opens and closes, as Practise's are
 * (owner, 17 November 2026, of Progress: "Make the Progress page modules
 * collapsible too"). Headed by its emblem, its name and a line of what
 * it holds, a figure with its label, and a bar; what it lists is inside.
 * Opening is by the content's own height (.faq-panel), at once under
 * reduced motion; a closed module is inert, so Tab does not wander in.
 */
export function ModuleCard({
  heading,
  summary,
  figure,
  figureLabel,
  percent,
  defaultOpen = false,
  children,
}: {
  heading: string;
  summary: ReactNode;
  figure: ReactNode;
  figureLabel: string;
  /** The bar under the header, 0 to 100. */
  percent: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panel = useId();
  return (
    <ScrollFade
      as="div"
      className={`module-card overflow-hidden rounded-card border bg-surface shadow-card transition-colors duration-200 ${
        open ? "border-good/35" : "border-line"
      }`}
    >
      <div data-open={open || undefined} className="faq-item">
        <h2>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panel}
            onClick={() => setOpen((o) => !o)}
            className="w-full px-4 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-good sm:px-5"
          >
            <span className="flex items-center gap-4">
              <ModuleMark kind={moduleKind(heading)} />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[22px] font-medium leading-snug text-ink-strong">{heading}</span>
                <span className="mt-0.5 block font-ui text-[14px] text-ink/65">{summary}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-display text-[22px] leading-none tabular-nums text-ink-strong">{figure}</span>
                <span className="mt-1 block font-ui text-[12px] text-ink/65">{figureLabel}</span>
              </span>
              <svg viewBox="0 0 16 16" className="faq-chevron h-4 w-4 shrink-0 text-ink/55" aria-hidden="true">
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <GradeBar percent={percent} className="mt-3 h-1.5" />
          </button>
        </h2>
        <div id={panel} role="region" aria-label={heading} className="faq-panel" inert={!open}>
          <div>
            <div className="border-t border-line">{children}</div>
          </div>
        </div>
      </div>
    </ScrollFade>
  );
}
