"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that counts up from zero as soon as it exists.
 *
 * Not CountUp, and deliberately not. CountUp's rule is that a number
 * already on screen is left alone: it refuses to snap to zero in front
 * of a reader who is looking at it. That is right for a landing-page
 * claim scrolled into view and wrong for a figure at the top of a
 * screen someone has just opened, because there CountUp would never
 * animate at all, and arriving at the figure is the whole effect.
 *
 * It renders the true value, so the server-rendered HTML carries the
 * real number and a reader without JavaScript sees it rather than a
 * zero. The drop to zero and the climb happen on mount.
 */
export function Tally({
  to,
  duration = 1400,
}: {
  to: number;
  duration?: number;
}) {
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
