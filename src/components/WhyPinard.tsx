"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RETRY_INTERVALS_DAYS } from "@/lib/review";

/**
 * What a book can't do: the two things that set Pinard apart and are
 * said nowhere else on the landing or pricing page (owner's request,
 * 10 October 2026: no repetition, few words, show it moving).
 *
 *   1. Superseded guidance is retired, and the questions written from it
 *      go with it; new ones are written from the update (Admin >
 *      Superseded, every quarter).
 *   2. A missed question comes back after 3, 10 and 25 days (lib/review),
 *      and is retired only after three right answers in a row.
 *
 * Both are true of the app today. No competitor is named; the contrast
 * is with a printed book, which is a statement about books.
 *
 * The animations start when the panel is on screen and stop when it
 * leaves. Without motion (reduced motion, or before it is seen) each
 * shows its final state, so nothing depends on watching it.
 */
const [d1, d2, d3] = RETRY_INTERVALS_DAYS;

function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOn(entry.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, on };
}

export function WhyPinard() {
  const { ref, on } = useOnScreen<HTMLDivElement>();
  return (
    <div ref={ref} className={on ? "why-on" : undefined}>
      <h2 className="font-serif text-[28px] font-semibold leading-tight text-ink-strong sm:text-[34px]">
        What a book can&rsquo;t do
      </h2>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
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
    </div>
  );
}

function Panel({ title, caption, picture }: { title: string; caption: string; picture: ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="relative h-48 bg-sunk/60 px-6 py-6" aria-hidden="true">
        {picture}
      </div>
      <figcaption className="px-6 py-5">
        <p className="font-ui text-[18px] font-semibold text-ink-strong">{title}</p>
        <p className="mt-1 font-ui text-[15px] text-ink/70">{caption}</p>
      </figcaption>
    </figure>
  );
}

/** A 2016 guideline struck through, its 2024 update arriving, and the
 *  questions swapping from one to the other. */
function Retired() {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-start gap-3">
        <div className="relative">
          <div className="why-old relative rounded-control border border-line bg-surface px-3 py-2 opacity-45">
            <p className="font-ui text-[12px] font-semibold text-ink/70">Green-top No. 51</p>
            <p className="font-mono text-[12px] text-ink/60">2016</p>
            <span className="why-strike absolute inset-x-2 top-1/2 h-[2px] origin-left bg-accent" />
          </div>
          {/* Outside the fading card, so it stays fully legible. */}
          <span className="why-stamp absolute -right-3 -top-3 rounded-full border border-accent/60 bg-surface px-2 py-0.5 font-ui text-[11px] font-semibold text-accent-ink [transform:rotate(-6deg)]">
            Superseded
          </span>
        </div>
        <span className="mt-3 text-ink/40">&rarr;</span>
        <div className="why-new rounded-control border border-good/50 bg-surface px-3 py-2 shadow-card">
          <p className="font-ui text-[12px] font-semibold text-ink-strong">Update</p>
          <p className="font-mono text-[12px] text-good">2024</p>
        </div>
      </div>
      <div className="relative h-[3.25rem]">
        <div className="absolute inset-0 space-y-2">
          {[78, 62, 70].map((w, i) => (
            <span
              key={`o${i}`}
              className="why-q-old block h-3 origin-left rounded-full bg-ink/15 [transform:scaleX(0)] opacity-0"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
        <div className="absolute inset-0 space-y-2">
          {[72, 84, 58].map((w, i) => (
            <span
              key={`n${i}`}
              className="why-q-new block h-3 origin-left rounded-full bg-good/70"
              style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Day 0 missed; a track runs out to day 3, 10 and 25, each a right
 *  answer; then the question is retired. */
function Returns() {
  const stops = [
    { label: `Day ${d1}`, cls: "why-dot-a" },
    { label: `Day ${d2}`, cls: "why-dot-b" },
    { label: `Day ${d3}`, cls: "why-dot-c" },
  ];
  return (
    <div className="flex h-full flex-col justify-center">
      <div className="relative mx-3">
        <span className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-line" />
        <span className="why-track absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 origin-left rounded-full bg-good" />
        <div className="relative flex items-center justify-between">
          <Dot className="bg-accent text-on-brand" mark="✕" />
          {stops.map((s) => (
            <Dot key={s.label} className={`${s.cls} bg-good text-on-brand`} mark="✓" />
          ))}
        </div>
      </div>
      <div className="mt-3 flex justify-between font-ui text-[12px] text-ink/60">
        <span className="w-12 text-left">Missed</span>
        {stops.map((s, i) => (
          <span key={s.label} className={`w-12 ${i === stops.length - 1 ? "text-right" : "text-center"}`}>
            {s.label}
          </span>
        ))}
      </div>
      <p className="why-retired mt-5 self-end rounded-full border border-good/50 bg-surface px-3 py-1 font-ui text-[12px] font-semibold text-good">
        Learnt
      </p>
    </div>
  );
}

function Dot({ className, mark }: { className: string; mark: string }) {
  return (
    <span
      className={`grid h-9 w-9 place-items-center rounded-full border-2 border-surface font-ui text-[15px] font-bold shadow-card ${className}`}
    >
      {mark}
    </span>
  );
}
