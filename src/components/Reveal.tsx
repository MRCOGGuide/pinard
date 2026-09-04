"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Content arrives as you reach it: a short rise and fade, once, when
 * the element first enters the viewport.
 *
 * Deliberately restrained. The move is 10px and 420ms — enough to feel
 * like the page is responding to you, not enough to make anyone wait
 * for their own content. It fires once and never again, because a
 * section that re-animates every time you scroll past is a section you
 * stop reading.
 *
 * Anything already on screen at load is shown immediately rather than
 * animated in, so the top of the page never flickers.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  /** Stagger, in ms, for items revealed as a group. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No IntersectionObserver, or motion is unwelcome: show it.
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setShown(true);
          observer.disconnect();
        }
      },
      // Fire a little before the element's top edge arrives, so it has
      // finished moving by the time it is properly in view.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      data-shown={shown ? "true" : "false"}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}

/**
 * A figure that counts up to its value the first time it is seen.
 *
 * Only for numbers a reader is meant to be impressed by — the size of
 * the library, a streak. Never for a number they need to read
 * accurately in a hurry.
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
  const [value, setValue] = useState(0);

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

    if (typeof IntersectionObserver === "undefined") {
      setValue(to);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
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
