"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ShowcaseSba } from "@/lib/showcase";
import { SETTLE, Spring, reducedMotion } from "./motion";

/**
 * One real question from the bank, answerable on the page.
 *
 * On the live page the answer opens underneath, below the fold on most
 * laptops, and the options lock. Here the options that no longer matter
 * fold away and the explanation rises into the room they leave, so it
 * lands where the reader is already looking, and "Try it again" brings
 * everything back. One spring runs the whole change, so pressing again
 * mid-way simply turns it round.
 */
export function Question({ sba, more }: { sba: ShowcaseSba; more: string }) {
  /** What the reader has picked, right now. */
  const [chosen, setChosen] = useState<string | null>(null);
  /** What the card is folded around: outlives `chosen` by the length of
   *  the fold closing, so the words stay while they are leaving. */
  const [fold, setFold] = useState<string | null>(null);
  const answered = chosen !== null;
  const right = fold === sba.correct;

  const card = useRef<HTMLElement | null>(null);
  const reveal = useRef<HTMLDivElement | null>(null);
  const inner = useRef<HTMLDivElement | null>(null);
  const spring = useRef<Spring | null>(null);

  useEffect(() => {
    const settle = (t: number) => {
      const el = card.current;
      if (!el) return;
      // At rest the card goes back to its natural size, so a change of
      // width or text size is not fighting a measured height.
      el.dataset.resting = t === 0 ? "closed" : "open";
      if (t === 0) setFold(null);
    };
    const s = new Spring(0, SETTLE, (t, done) => {
      card.current?.style.setProperty("--t", t.toFixed(4));
      if (done) settle(t);
    });
    spring.current = s;
    return () => s.stop();
  }, []);

  /** Sizes are read at rest only: mid-fold they are part-way. */
  function measure() {
    const el = card.current;
    if (!el || !el.dataset.resting) return;
    // A folded slot is not drawn, so it keeps the height it had.
    el.querySelectorAll<HTMLElement>("[data-slot]:not([data-gone])").forEach((slot) => {
      slot.style.setProperty("--h", `${slot.offsetHeight}px`);
    });
    if (reveal.current && inner.current) {
      reveal.current.style.setProperty("--eh", `${inner.current.offsetHeight}px`);
    }
    delete el.dataset.resting;
  }

  function answer(key: string) {
    if (answered) return;
    measure();
    setChosen(key);
    setFold(key);
  }

  function again() {
    measure();
    setChosen(null);
  }

  // Once React has drawn the change, so the explanation exists to be
  // measured before it opens.
  useEffect(() => {
    const el = card.current;
    const s = spring.current;
    if (!el || !s) return;
    if (chosen !== null && reveal.current && inner.current) {
      reveal.current.style.setProperty("--eh", `${inner.current.offsetHeight}px`);
    }
    const target = chosen !== null ? 1 : 0;
    if (s.value === target) return;
    if (reducedMotion()) {
      s.set(target);
      el.style.setProperty("--t", String(target));
      el.dataset.resting = target ? "open" : "closed";
      if (!target) setFold(null);
      return;
    }
    s.to(target);
  }, [chosen]);

  return (
    <figure ref={card} className="pl-question" data-resting="closed">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="pl-small font-semibold !text-ink-strong">Single best answer</span>
        <span className="pl-small">From the bank</span>
      </figcaption>

      <p className="reading mt-3 !text-[1.0625rem] !leading-[1.6] text-ink">{sba.stem}</p>

      <ul className="mt-5" aria-label="Options">
        {sba.options.map((o) => {
          const isChosen = chosen === o.key;
          const isCorrect = o.key === sba.correct;
          const stays = fold === null || fold === o.key || isCorrect;
          const state = !answered ? undefined : isCorrect ? "right" : isChosen ? "wrong" : undefined;
          return (
            <li key={o.key} data-slot="" data-gone={stays ? undefined : ""} className="pl-slot">
              <button
                type="button"
                className="pl-option w-full"
                data-state={state}
                aria-pressed={isChosen}
                aria-disabled={answered}
                tabIndex={stays ? 0 : -1}
                onClick={() => answer(o.key)}
              >
                <span className="pl-option-key">{o.key}</span>
                <span className="pt-px text-ink">{o.text}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="pl-prompt pl-small">Choose an answer to see the explanation.</p>

      <div ref={reveal} className="pl-reveal" aria-live="polite">
        <div ref={inner}>
          {fold !== null && (
            <div className="pt-4">
              <p className={`font-serif text-[1.25rem] font-semibold ${right ? "text-good" : "text-accent-ink"}`}>
                {right ? "Correct." : `The answer is ${sba.correct}.`}
              </p>
              <p className="reading mt-2 !text-[1rem] !leading-[1.6] text-ink/90">{sba.explanation}</p>
              {sba.source && (
                <p className="pl-small mt-3">
                  <span className="font-semibold text-ink/80">Source.</span> {sba.source}
                </p>
              )}
              <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Link
                  href="/sample"
                  className="font-ui text-[0.9375rem] font-semibold text-good underline decoration-good/40 underline-offset-4 hover:decoration-good"
                >
                  {more}
                </Link>
                <button
                  type="button"
                  onClick={again}
                  className="font-ui text-[0.9375rem] font-medium text-ink/70 underline decoration-ink/25 underline-offset-4 hover:text-ink-strong"
                >
                  Try it again
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </figure>
  );
}
