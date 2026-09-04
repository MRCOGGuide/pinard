"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";

/**
 * The journey: a dotted road drawn down the page as you descend it,
 * from a booked exam to the day you start preparing for it.
 *
 * Each landmark is anchored to the section it marks — measured, not
 * guessed at a percentage — so the road stays in step however the page
 * grows. Every landmark swells as it nears the middle of the screen and
 * shrinks away behind you; Pinard's own turns to face you as it comes.
 *
 * Why it works, stated plainly rather than pretended about: a path with
 * a visible end recruits the goal-gradient effect, and each landmark
 * passed is a small completion that makes the next likelier. By the
 * pricing the road is mostly drawn, so subscribing reads as continuing
 * something rather than starting it.
 *
 * What it deliberately is not: a countdown, a scarcity notice, or any
 * suggestion that the subscription is what passes the exam.
 *
 * Decorative — hidden from assistive technology, hidden where there is
 * no spare gutter, and still under prefers-reduced-motion.
 */

type Landmark = {
  /** The section it marks, by its data-journey name. */
  section: string;
  label: string;
  icon: "booked" | "questions" | "pinard" | "steps" | "current" | "plans" | "start";
};

const LANDMARKS: Landmark[] = [
  { section: "hero", label: "Exam booked", icon: "booked" },
  { section: "questions", label: "Real questions", icon: "questions" },
  { section: "ask", label: "Ask Pinard", icon: "pinard" },
  { section: "steps", label: "How it works", icon: "steps" },
  { section: "current", label: "Always current", icon: "current" },
  { section: "pricing", label: "One subscription", icon: "plans" },
  { section: "start", label: "Start today", icon: "start" },
];

/**
 * The road: a serpentine drawn in a 100×1000 box and stretched over the
 * page. Generated because the number of bends is the whole question —
 * three across five thousand pixels reads as a straight line. Fourteen
 * puts a bend roughly every screenful, and the swing narrows toward the
 * end so the last stretch runs straight at the destination.
 */
const ROAD = (() => {
  const bends = 14;
  const step = 1000 / bends;
  let d = "M50 0";
  for (let i = 0; i < bends; i++) {
    const y0 = i * step;
    const y1 = y0 + step;
    const swing = 30 * (1 - (i / bends) * 0.55);
    const side = i % 2 === 0 ? -1 : 1;
    d += ` C ${50 + side * swing} ${y0 + step * 0.35}, ${50 + side * swing} ${y1 - step * 0.35}, 50 ${y1}`;
  }
  return d;
})();

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icon({ kind }: { kind: Landmark["icon"] }) {
  switch (kind) {
    // A date in the diary, and a tick against it.
    case "booked":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" {...line} />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" {...line} />
          <path d="M9.5 14.5l2 2 3.5-4" {...line} />
        </svg>
      );
    // A question card with its options: what the section shows.
    case "questions":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <rect x="3.5" y="4" width="17" height="16" rx="2.5" {...line} />
          <path d="M7 8.5h10M7 12h6" {...line} />
          <circle cx="7.6" cy="16" r="1.1" {...line} />
          <path d="M10.5 16h6" {...line} />
        </svg>
      );
    case "pinard":
      return null; // the mark itself stands here
    // Four steps, one after another.
    case "steps":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M3 19h4v-4h5v-4h5V7h4" {...line} />
        </svg>
      );
    // A book, and the newer edition arriving over it.
    case "current":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M4 6.5A2.5 2.5 0 016.5 4H13v13H6.5A2.5 2.5 0 004 19.5z" {...line} />
          <path d="M13 8.5h5.5A2.5 2.5 0 0121 11v8.5a2.5 2.5 0 00-2.5-2.5H13z" {...line} />
          <path d="M16.5 4.5a3.2 3.2 0 11-2.4 1" {...line} />
          <path d="M13.6 2.6l.5 2.9 2.9-.5" {...line} />
        </svg>
      );
    // One plan chosen from several.
    case "plans":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <rect x="3" y="7" width="7" height="12" rx="1.8" {...line} />
          <rect x="13" y="4" width="8" height="15" rx="1.8" {...line} />
          <path d="M15.5 11.5l1.6 1.6 3-3.4" {...line} />
        </svg>
      );
    // An arrow, pointing at what to do next.
    case "start":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M5 12h13" {...line} />
          <path d="M13 6.5l5.5 5.5L13 17.5" {...line} />
        </svg>
      );
  }
}

export function Journey() {
  const root = useRef<HTMLDivElement | null>(null);
  const road = useRef<SVGSVGElement | null>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const [tops, setTops] = useState<(number | null)[]>(() =>
    LANDMARKS.map(() => null)
  );

  // Anchor each landmark to the middle of the section it marks, so the
  // road stays in step when the page grows a section or loses one.
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const place = () => {
      const base = el.getBoundingClientRect().top + window.scrollY;
      setTops(
        LANDMARKS.map((mark) => {
          const section = document.querySelector<HTMLElement>(
            `[data-journey="${mark.section}"]`
          );
          if (!section) return null;
          const box = section.getBoundingClientRect();
          return box.top + window.scrollY + box.height / 2 - base;
        })
      );
    };

    place();
    window.addEventListener("resize", place);
    // Fonts and images settle after first paint and move things down.
    const settle = window.setTimeout(place, 600);
    return () => {
      window.removeEventListener("resize", place);
      window.clearTimeout(settle);
    };
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.setProperty("--journey", "1");
      nodes.current.forEach((n) => n?.style.setProperty("--near", "1"));
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const box = (road.current ?? el).getBoundingClientRect();
      const viewport = window.innerHeight || 1;

      // How far down the road we have travelled: 0 when its start
      // reaches the middle of the screen, 1 when its end does. Measured
      // on the road, which begins at the first landmark.
      const travelled = (viewport * 0.5 - box.top) / Math.max(1, box.height);
      el.style.setProperty(
        "--journey",
        String(Math.min(1, Math.max(0, travelled)))
      );

      for (const node of nodes.current) {
        if (!node) continue;
        const r = node.getBoundingClientRect();
        const distance = Math.abs(r.top + r.height / 2 - viewport * 0.5);
        const near = Math.min(1, Math.max(0, 1 - distance / (viewport * 0.5)));
        node.style.setProperty("--near", near.toFixed(3));
      }
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [tops]);

  // The road runs from the first landmark to the last: starting it at
  // the top of the page draws a line to nowhere above the first stop.
  const placed = tops.filter((v): v is number => v !== null);
  const roadTop = placed.length ? Math.min(...placed) : 0;
  const roadHeight = placed.length ? Math.max(...placed) - roadTop : 0;

  return (
    <div
      ref={root}
      aria-hidden="true"
      className="journey pointer-events-none absolute inset-y-0 right-full mr-8 hidden w-24 lg:block"
    >
      {/* The road: dotted ahead of you, drawn in the accent behind. */}
      <svg
        ref={road}
        className="absolute left-0 w-full"
        style={{ top: roadTop, height: roadHeight }}
        viewBox="0 0 100 1000"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          className="journey-road-ahead"
          d={ROAD}
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="1 9"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="journey-road-done"
          d={ROAD}
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="1 9"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {LANDMARKS.map((mark, i) =>
        tops[i] === null ? null : (
          <div
            key={mark.section}
            ref={(n) => {
              nodes.current[i] = n;
            }}
            className="journey-stop absolute left-0 w-full -translate-y-1/2 text-center"
            style={{ top: `${tops[i]}px` }}
          >
            {mark.icon === "pinard" ? (
              <span className="journey-mark-3d block">
                <span className="journey-mark block">
                  <Logo variant="mark" className="mx-auto h-11 w-auto" />
                </span>
              </span>
            ) : (
              <span className="journey-icon mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-porcelain text-greentop">
                <Icon kind={mark.icon} />
              </span>
            )}
            <span className="journey-label mt-2 block font-mono text-[10px] leading-tight text-graphite/45">
              {mark.label}
            </span>
          </div>
        )
      )}
    </div>
  );
}
