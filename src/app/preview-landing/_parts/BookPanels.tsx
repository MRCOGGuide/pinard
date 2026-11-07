"use client";

import { useRef, type ReactNode } from "react";
import { RETRY_INTERVALS_DAYS } from "@/lib/review";
import {
  SETTLE,
  Spring,
  THROWN,
  passing,
  pointerDrag,
  project,
  reducedMotion,
  rubberband,
  useIsoLayoutEffect,
  useScrub,
} from "./motion";

/**
 * "What a book can't do", as on the live page: superseded guidance is
 * retired with its questions, and a missed question comes back after
 * 3, 10 and 25 days (lib/review). Both are true of the app today.
 *
 * The live page loops these every seven seconds for as long as they are
 * on screen. Here the first is drawn by the scroll and stays still when
 * the reader does. The second can be taken in the hand: the scroll walks
 * it along, or a finger can drag it, throw it, and feel it land on the
 * next review day.
 */
const [d1, d2, d3] = RETRY_INTERVALS_DAYS;
const STOPS = ["Missed", `Day ${d1}`, `Day ${d2}`, `Day ${d3}`];
const LAST = STOPS.length - 1;

export function BookPanels() {
  return (
    <div className="mt-10 grid gap-5 lg:grid-cols-2">
      <Panel
        title="Old guidance is retired"
        caption="Its questions go with it. New ones follow the update."
        picture={<Retired />}
      />
      <Panel
        title="Missed questions come back"
        caption="Until you get them right three times running."
        picture={<Returns />}
      />
    </div>
  );
}

function Panel({ title, caption, picture }: { title: string; caption: string; picture: ReactNode }) {
  return (
    <figure className="pl-book pl-rise">
      {picture}
      <figcaption className="px-6 py-5">
        <p className="font-ui text-[1.125rem] font-semibold text-ink-strong">{title}</p>
        <p className="mt-1 font-ui text-[0.9375rem] text-ink/70">{caption}</p>
      </figcaption>
    </figure>
  );
}

function Retired() {
  const ref = useScrub<HTMLDivElement>(
    (el, vh) => passing(el, vh, 0.86, 0.42),
    (p, el) => el.style.setProperty("--p", p.toFixed(4))
  );
  return (
    <div ref={ref} className="pl-book-stage pl-pic pl-retired" aria-hidden="true">
      <div className="flex items-start gap-3">
        <div className="relative">
          <div className="pl-old rounded-control border border-line bg-surface px-3 py-2">
            <p className="font-ui text-[0.75rem] font-semibold text-ink/70">Green-top No. 51</p>
            <p className="font-ui text-[0.75rem] tabular-nums text-ink/60">2016</p>
            <span className="pl-strike" />
          </div>
          <span className="pl-stamp">Superseded</span>
        </div>
        <svg viewBox="0 0 24 24" className="mt-3 h-4 w-4 text-ink/40" aria-hidden="true">
          <path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="pl-new rounded-control border border-good/50 bg-surface px-3 py-2 shadow-card">
          <p className="font-ui text-[0.75rem] font-semibold text-ink-strong">Update</p>
          <p className="font-ui text-[0.75rem] tabular-nums text-good">2024</p>
        </div>
      </div>
      <div className="relative h-[3.25rem]">
        <div className="absolute inset-0 space-y-2">
          {[78, 62, 70].map((w, i) => (
            <span key={i} className="pl-q-old" style={{ width: `${w}%`, ["--i" as string]: i }} />
          ))}
        </div>
        <div className="absolute inset-0 space-y-2">
          {[72, 84, 58].map((w, i) => (
            <span key={i} className="pl-q-new" style={{ width: `${w}%`, ["--i" as string]: i }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Returns() {
  const rail = useRef<HTMLDivElement | null>(null);
  const thumb = useRef<HTMLDivElement | null>(null);
  /** Taken in the hand: from then on the scroll leaves it alone. */
  const taken = useRef(false);
  const spring = useRef<Spring | null>(null);

  function paint(pos: number) {
    const el = rail.current;
    if (!el) return;
    el.parentElement?.style.setProperty("--pos", pos.toFixed(4));
    const landed = Math.round(Math.max(0, Math.min(LAST, pos)));
    el.querySelectorAll<HTMLElement>("[data-stop]").forEach((dot, i) => {
      dot.dataset.on = pos >= i - 0.04 ? "true" : "false";
    });
    thumb.current?.setAttribute("aria-valuenow", String(landed));
    thumb.current?.setAttribute("aria-valuetext", STOPS[landed]);
  }

  // Before useScrub's first reading, which sets where it starts.
  useIsoLayoutEffect(() => {
    const s = new Spring(LAST, SETTLE, (v) => paint(v));
    spring.current = s;
    return () => s.stop();
  }, []);

  const stage = useScrub<HTMLDivElement>(
    (el, vh) => passing(el, vh, 0.8, 0.42),
    (p) => {
      if (taken.current) return;
      spring.current?.set(p * LAST);
      paint(p * LAST);
    }
  );

  function land(target: number, velocity = 0) {
    const s = spring.current;
    if (!s) return;
    if (reducedMotion()) {
      s.set(target);
      paint(target);
      return;
    }
    // A little overshoot only if the hand threw it.
    s.configure(Math.abs(velocity) > 1.5 ? THROWN : SETTLE);
    s.to(target, velocity);
  }

  function grab(e: React.PointerEvent<HTMLDivElement>) {
    const el = rail.current;
    const s = spring.current;
    if (!el || !s) return;
    e.preventDefault();
    taken.current = true;
    el.dataset.held = "true";

    const box = el.getBoundingClientRect();
    const perStop = box.width / LAST;
    // Pressed on the thumb, it keeps the offset it was grabbed at, and
    // does not jump to centre under the finger. Pressed elsewhere on the
    // line, it comes to the finger.
    const onThumb = Math.abs(e.clientX - (box.left + s.value * perStop)) < 28;
    const start = onThumb ? s.value : Math.max(0, Math.min(LAST, (e.clientX - box.left) / perStop));
    s.set(start);
    paint(start);

    pointerDrag(e, {
      onMove: (dx) => {
        const raw = start + dx / perStop;
        const over = raw < 0 ? raw : raw > LAST ? raw - LAST : 0;
        const pos = raw - over + rubberband(over * perStop, 48) / perStop;
        s.set(pos);
        paint(pos);
      },
      onEnd: (velocity) => {
        delete el.dataset.held;
        const perSecond = velocity / perStop;
        const resting = s.value + project(velocity, 0.995) / perStop;
        land(Math.max(0, Math.min(LAST, Math.round(resting))), perSecond);
      },
    });
  }

  function keys(e: React.KeyboardEvent) {
    const s = spring.current;
    if (!s) return;
    const now = Math.round(s.value);
    const to =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? now + 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? now - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? LAST
              : null;
    if (to === null) return;
    e.preventDefault();
    taken.current = true;
    land(Math.max(0, Math.min(LAST, to)));
  }

  return (
    <div ref={stage} className="pl-book-stage pl-returns">
      <p className="pl-drag-hint">Drag along the line</p>
      <div ref={rail} className="pl-rail" onPointerDown={grab}>
        <span className="pl-rail-line" />
        <span className="pl-rail-fill" />
        {STOPS.map((label, i) => (
          <span
            key={label}
            data-stop=""
            data-on="true"
            className={`pl-stop ${i === 0 ? "pl-stop-missed" : ""}`}
            style={{ ["--s" as string]: i }}
            aria-hidden="true"
          >
            {i === 0 ? <Cross /> : <Check />}
          </span>
        ))}
        <div
          ref={thumb}
          className="pl-thumb"
          role="slider"
          tabIndex={0}
          aria-label="Days since the question was missed"
          aria-valuemin={0}
          aria-valuemax={LAST}
          aria-valuenow={LAST}
          aria-valuetext={STOPS[LAST]}
          onKeyDown={keys}
        />
      </div>
      <div className="pl-stop-labels" aria-hidden="true">
        {STOPS.map((label, i) => (
          <span key={label} style={{ ["--s" as string]: i }}>
            {label}
          </span>
        ))}
      </div>
      <p className="pl-learnt" aria-hidden="true">
        Learnt
      </p>
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
