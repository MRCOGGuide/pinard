"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Where a candidate stands, in one line.
 *
 * This replaced a countdown, two figures, a sentence of arithmetic and
 * a milestone, stacked above the day's session. Five things competing
 * for the first glance is four things too many on a page whose job is
 * to get someone practising, and prose is the wrong form for a number
 * that changes daily — "29 topics to bring up to 70%, 48 days left:
 * about 1.7 days for each" is a paragraph asking to be read when it
 * should be a figure asking to be glanced at.
 *
 * So: four figures, one row, bold, no card. What each one means is
 * behind an (i) rather than printed beside it, because the explanation
 * is read once and the figure is read every day.
 */

/**
 * A figure that counts up from zero as soon as it exists.
 *
 * Not CountUp, and deliberately not. CountUp's rule is that a number
 * already on screen is left alone — it refuses to snap to zero in
 * front of a reader who is looking at it. That is right for a landing
 * page claim scrolled into view, and wrong here: this strip is the
 * first thing above the fold, so CountUp would never animate at all.
 * Here arriving at the figure IS the effect.
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

/**
 * The (i) beside a figure: how this number is worked out.
 *
 * Hover for a pointer, click or Enter for everything else. A tooltip
 * that only answers to hover is a tooltip a touchscreen cannot read,
 * and the explanations here are the part a candidate most needs the
 * first time they see the strip.
 *
 * Placed on open rather than in CSS. Centred on its button with a
 * plain absolute position, the panel hung off the right edge of a
 * phone — the last two metrics sit near the margin — and an element
 * past the right edge gives the whole page a horizontal scroll, which
 * is a worse fault than the tooltip being off-centre. So it is fixed
 * to the viewport and clamped inside it: centred on the (i) where
 * there is room, pushed back to the margin where there is not.
 *
 * Fixed means it does not follow the page, so scrolling dismisses it.
 */
function Explain({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const button = useRef<HTMLButtonElement | null>(null);
  const [at, setAt] = useState<{ top: number; left: number; width: number } | null>(
    null
  );

  const place = () => {
    const node = button.current;
    if (!node) return;
    const r = node.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(256, window.innerWidth - margin * 2);
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
    /* Superscript, not mid-line. Sitting it level with the label put a
       second circle in the middle of a row already carrying four
       figures; raised, it reads as a footnote mark on the label and
       the row's own line stays clean. The nudge is on an inline span
       rather than a flex child, or `top` would do nothing. */
    <span className="relative -top-1 ml-0.5 inline-block">
      <button
        ref={button}
        type="button"
        aria-label={`How ${label} is worked out`}
        aria-expanded={at !== null}
        aria-describedby={at ? id : undefined}
        onMouseEnter={place}
        onMouseLeave={() => setAt(null)}
        onFocus={place}
        onBlur={() => setAt(null)}
        onClick={() => (at ? setAt(null) : place())}
        className="grid h-3.5 w-3.5 place-items-center rounded-full border border-line text-[9px] font-semibold leading-none text-ink/55 hover:border-ink/40 hover:text-ink"
      >
        i
      </button>
      {at && (
        <span
          id={id}
          role="tooltip"
          style={{ top: at.top, left: at.left, width: at.width }}
          className="fixed z-30 block rounded-card border border-line bg-surface p-3 text-left text-small font-normal normal-case leading-relaxed tracking-normal text-ink/80 shadow-card"
        >
          {children}
        </span>
      )}
    </span>
  );
}

function Metric({
  label,
  explain,
  tone = "text-ink-strong",
  children,
}: {
  label: string;
  explain: ReactNode;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-label uppercase tracking-wide text-ink/55">
        {label}
        <Explain label={label}>{explain}</Explain>
      </span>
      <strong className={`font-mono text-sm font-semibold ${tone}`}>
        {children}
      </strong>
    </span>
  );
}

const TONE = {
  red: "text-accent-ink",
  amber: "text-warn",
  green: "text-good",
} as const;

export function StatStrip({
  daysRemaining,
  examLabel,
  readiness,
  questions,
  sections,
}: {
  daysRemaining: number | null;
  examLabel: string;
  readiness: { percent: number; band: "red" | "amber" | "green" };
  questions: { answered: number; total: number };
  sections: { complete: number; total: number; syllabus: number };
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2">
      <Metric
        label="Days to exam"
        explain={
          <>
            Whole days from today to your {examLabel} date. Change the date on
            your account page and everything here moves with it.
          </>
        }
      >
        {daysRemaining === null ? "—" : <Tally to={daysRemaining} />}
      </Metric>

      <Metric
        label="Readiness"
        tone={TONE[readiness.band]}
        explain={
          <>
            The average of your scores across every topic the bank can serve, so
            a topic you have not opened counts as a zero. A topic earns full
            marks at 70%, the pass mark, and nothing for going beyond it —
            strength in a few topics should not pay for silence in the rest. Its
            score counts in full once you have answered five of its questions,
            or all of them where it holds fewer. Practise every topic and hold
            70% in each and this reads 100%.
          </>
        }
      >
        <Tally to={readiness.percent} />%
      </Metric>

      <Metric
        label="Questions"
        explain={
          <>
            Questions you have answered at least once, out of the{" "}
            {questions.total.toLocaleString("en-GB")} approved in the bank
            today. The bank is written continuously, so the second figure
            climbs as well.
          </>
        }
      >
        <Tally to={questions.answered} />
        <span className="font-normal text-ink/45">
          /{questions.total.toLocaleString("en-GB")}
        </span>
      </Metric>

      <Metric
        label="Sections"
        explain={
          <>
            Topics where you have answered every question, out of the{" "}
            {sections.total} the bank can currently serve. The syllabus has{" "}
            {sections.syllabus} in all; the rest have no questions written yet,
            and counting those would make a total nobody could ever reach.
          </>
        }
      >
        <Tally to={sections.complete} />
        <span className="font-normal text-ink/45">/{sections.total}</span>
      </Metric>
    </div>
  );
}
