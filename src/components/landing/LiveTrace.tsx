"use client";

import { useEffect, useRef, useState } from "react";

const PATH = "M0 17 H92 L100 17 L106 5 L113 22 L120 9 L127 17 H220";

/**
 * The heartbeat under the landing headline, alive while the page moves.
 *
 * The same line as Trace, drawn in on load the same way, and beating
 * for as long as the reader is scrolling with it on screen: the complex
 * jumps about the baseline and a bright pulse runs along the line (the
 * .trace-heart rules in globals.css). It settles a quarter of a second
 * after the scrolling stops.
 */
export function LiveTrace({ className = "h-5 w-48" }: { className?: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [beating, setBeating] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let visible = true;
    let quiet = 0;
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((e) => {
            visible = e[e.length - 1].isIntersecting;
          });
    observer?.observe(node);
    const onScroll = () => {
      if (!visible) return;
      setBeating(true);
      clearTimeout(quiet);
      quiet = window.setTimeout(() => setBeating(false), 250);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
      clearTimeout(quiet);
    };
  }, []);

  return (
    <svg
      ref={ref}
      viewBox="0 0 220 24"
      preserveAspectRatio="xMinYMid meet"
      className={`trace-live trace-heart overflow-visible text-accent ${className}`}
      data-beating={beating ? "true" : "false"}
      aria-hidden="true"
    >
      <path
        className="trace-path"
        pathLength={300}
        d={PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        className="trace-pulse"
        pathLength={300}
        d={PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
