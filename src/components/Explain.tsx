"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * A small (i) that holds a sentence the page would otherwise have to
 * print.
 *
 * Most of what sat under these headings was explanation: what the
 * diagnostic is for, what Ask reads from, how many questions are in
 * today's session, that Enter sends. All of it true, all of it read
 * once, and all of it competing every day with the button underneath
 * it. Behind an (i) it is still there for anyone who wants it and
 * gone for everyone who does not.
 *
 * Hover for a pointer, click or Enter for everything else. A tooltip
 * that only answers to hover cannot be read on a touchscreen, and this
 * is the part a candidate most needs the first time they see a screen.
 *
 * Placed on open rather than in CSS. Centred on its button with a
 * plain absolute position, the panel hung off the right edge of a
 * phone, and an element past the right edge gives the whole page a
 * horizontal scroll, which is a worse fault than a tooltip being
 * off-centre. So it is fixed to the viewport and clamped inside it:
 * centred on the (i) where there is room, pushed back to the margin
 * where there is not. Fixed means it does not follow the page, so
 * scrolling dismisses it.
 */
export function Explain({
  label,
  children,
  className = "",
}: {
  /** What the (i) explains, for the screen-reader label. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement | null>(null);
  const [at, setAt] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const place = () => {
    const node = button.current;
    if (!node) return;
    const r = node.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(280, window.innerWidth - margin * 2);
    const left = Math.min(
      Math.max(margin, r.left + r.width / 2 - width / 2),
      window.innerWidth - width - margin
    );
    setAt({ top: r.bottom + 8, left, width });
  };

  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [at]);

  return (
    <span className={`relative -top-px ml-1 inline-block ${className}`.trim()}>
      <button
        ref={button}
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={at !== null}
        aria-describedby={at ? id : undefined}
        onMouseEnter={place}
        onMouseLeave={() => setAt(null)}
        onFocus={place}
        onBlur={() => setAt(null)}
        onClick={() => (at ? setAt(null) : place())}
        className="grid h-4 w-4 place-items-center rounded-full border border-line align-middle text-[10px] font-semibold leading-none text-ink/55 hover:border-ink/40 hover:text-ink"
      >
        i
      </button>
      {at && (
        <span
          id={id}
          role="tooltip"
          style={{ top: at.top, left: at.left, width: at.width }}
          /*
            Every inherited type rule is reset here, not just the ones
            that looked wrong at the time. The label this sits inside
            on the Today strip is `whitespace-nowrap font-mono
            uppercase`, and the panel inherited all three: the text
            refused to wrap and ran straight out of its own white box.
            A tooltip is a box of prose wherever it is dropped, so it
            states that rather than depending on where it lands.
          */
          className="fixed z-30 block whitespace-normal break-words rounded-card border border-line bg-surface p-3 text-left font-sans text-fine font-normal normal-case leading-relaxed tracking-normal text-ink/80 shadow-card"
        >
          {children}
        </span>
      )}
    </span>
  );
}
