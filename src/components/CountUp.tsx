"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A figure that counts up to itself as it comes into view, and again
 * each time it comes back, or when pointed at.
 */
export function CountUp({
  to,
  duration = 900,
  className = "",
}: {
  to: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const frame = useRef(0);
  const [value, setValue] = useState(to);

  // One place that runs the count, so entering the viewport and pointing
  // at the figure do exactly the same thing.
  const run = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(to);
      return;
    }
    cancelAnimationFrame(frame.current);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease out: fast at first, settling on the real figure.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(to * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [to, duration]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") return;

    /*
      The observer reports the current state as soon as it is attached,
      and that first report is what decides whether there is anything
      to animate. Already on screen: leave the figure alone rather than
      snapping it to zero in front of the reader. Below the fold: drop
      to zero now, unseen, and count up when they reach it.

      It stays attached, so the figure counts again every time it comes
      back into view: dropped to zero, unseen, as it leaves.
    */
    let first = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries[entries.length - 1].isIntersecting;
        if (first) {
          first = false;
          if (!seen && !reduce) setValue(0);
          return;
        }
        if (reduce) return;
        if (!seen) {
          cancelAnimationFrame(frame.current);
          setValue(0);
          return;
        }
        run();
      },
      { threshold: 0.4 }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [to, run]);

  return (
    <span
      ref={ref}
      className={className}
      // Counting again on hover: the figure is the claim, and watching
      // it arrive is what makes it land a second time.
      onMouseEnter={run}
    >
      {value.toLocaleString("en-GB")}
    </span>
  );
}
