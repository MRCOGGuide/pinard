"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * A question and its answer, the FAQ's and any list like it.
 *
 * Asked for by the owner, 14 November 2026: "Make all the questions in
 * FAQ open when the mouse hover over them and close when moving away,
 * and stay open when clicked - apply this everywhere where there are
 * similar questions section."
 *
 * Under a mouse, resting on a question opens it and moving away closes
 * it, after a short pause each way, so sweeping down the list does not
 * flicker every question open. A click holds it open, and the card's
 * edge says so; a second click lets it go and closes it. On a touch
 * screen, where there is no resting, a tap opens and closes it, and so
 * does Enter or Space from the keyboard.
 *
 * The answer opens by its own height, smoothly (.faq-panel in
 * globals.css), and at once under reduced motion. While closed it is
 * inert, so a link inside it cannot be reached by Tab until it shows.
 */
export function Question({ q, children }: { q: string; children: ReactNode }) {
  const [held, setHeld] = useState(false);
  const [resting, setResting] = useState(false);
  const pause = useRef(0);
  const panel = useId();
  const open = held || resting;

  useEffect(() => () => window.clearTimeout(pause.current), []);

  const rest = (on: boolean, ms: number) => {
    window.clearTimeout(pause.current);
    pause.current = window.setTimeout(() => setResting(on), ms);
  };

  return (
    <div
      className="faq-item rounded-card border bg-surface shadow-card"
      data-open={open || undefined}
      data-held={held || undefined}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") rest(true, 90);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") rest(false, 140);
      }}
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => {
            window.clearTimeout(pause.current);
            if (held) {
              // Let go: closed now, even with the pointer still over it.
              setHeld(false);
              setResting(false);
            } else {
              setHeld(true);
            }
          }}
          className="flex w-full items-start justify-between gap-4 rounded-card p-4 text-left font-display text-[19px] font-medium leading-snug text-ink-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-good"
        >
          <span>{q}</span>
          <svg viewBox="0 0 16 16" className="faq-chevron mt-1.5 h-4 w-4 shrink-0 text-ink/55" aria-hidden="true">
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </h2>
      <div id={panel} role="region" aria-label={q} className="faq-panel" inert={!open}>
        <div>
          <div className="px-4 pb-4 font-ui text-[16px] leading-relaxed text-ink/80">{children}</div>
        </div>
      </div>
    </div>
  );
}
