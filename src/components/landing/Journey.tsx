"use client";

import { useEffect, useRef } from "react";
import { Logo } from "@/components/Logo";

/**
 * The journey: a dotted road drawn down the page as you descend it,
 * from the day you decide to sit the exam to the day you pass.
 *
 * Why it works, stated plainly rather than pretended about: a visible
 * path with a visible end recruits the goal-gradient effect — people
 * push harder the closer a finish looks — and each landmark passed is a
 * small completion that makes the next one likelier. The road is
 * already half-drawn by the time anyone reaches the pricing, so
 * subscribing reads as continuing something rather than starting it.
 *
 * What it deliberately is not: a countdown, a fake scarcity notice, or
 * a claim about passing. The honest version of this pattern shows the
 * work between here and the exam. The dishonest version implies the
 * subscription is what passes the exam, and this one does not.
 *
 * Decorative, so it is hidden from assistive technology and from
 * screens too narrow to have a spare gutter — the page reads perfectly
 * without it.
 */

type Landmark = {
  /** Where it sits down the road, as a percentage of the page. */
  at: number;
  label: string;
  icon: "start" | "diagnostic" | "plan" | "practice" | "pinard" | "pass";
};

const LANDMARKS: Landmark[] = [
  { at: 4, label: "Exam ahead", icon: "start" },
  { at: 21, label: "Find the gaps", icon: "diagnostic" },
  { at: 39, label: "Your plan", icon: "plan" },
  { at: 55, label: "Practise", icon: "practice" },
  { at: 72, label: "Pinard", icon: "pinard" },
  { at: 93, label: "Exam day", icon: "pass" },
];

/**
 * The road itself: a serpentine drawn in a 100×1000 box and stretched
 * over the height of the page.
 *
 * Built rather than hand-written because the number of bends is the
 * whole question — three of them across five thousand pixels reads as a
 * straight line, and the road has to look like a road. Fourteen puts a
 * bend roughly every screenful, and the swing narrows toward the end so
 * the last stretch runs straight at the destination.
 */
const ROAD = (() => {
  const bends = 14;
  const step = 1000 / bends;
  let d = "M50 0";
  for (let i = 0; i < bends; i++) {
    const y0 = i * step;
    const y1 = y0 + step;
    // Swing wide early, straighten as the exam approaches.
    const swing = 30 * (1 - (i / bends) * 0.55);
    const side = i % 2 === 0 ? -1 : 1;
    d += ` C ${50 + side * swing} ${y0 + step * 0.35}, ${50 + side * swing} ${y1 - step * 0.35}, 50 ${y1}`;
  }
  return d;
})();

function Icon({ kind }: { kind: Landmark["icon"] }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "start":
      // A calendar with the date circled — the decision.
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <rect x="3" y="5" width="18" height="16" rx="2" {...stroke} />
          <path d="M3 10h18M8 3v4M16 3v4" {...stroke} />
          <circle cx="16" cy="16" r="2.6" {...stroke} />
        </svg>
      );
    case "diagnostic":
      // A trace crossing a threshold — the diagnostic's own picture.
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M3 9h18" strokeDasharray="2 2.5" {...stroke} />
          <path d="M3 18l4-2 4-3 4 2 6-6" {...stroke} />
        </svg>
      );
    case "plan":
      // Days laid out in order.
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M4 6h10M4 12h16M4 18h7" {...stroke} />
          <circle cx="18" cy="6" r="2" {...stroke} />
          <circle cx="13" cy="18" r="2" {...stroke} />
        </svg>
      );
    case "practice":
      // Someone at a book.
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M4 6.5A2.5 2.5 0 016.5 4H11v15H6.5A2.5 2.5 0 004 21.5z" {...stroke} />
          <path d="M20 6.5A2.5 2.5 0 0017.5 4H13v15h4.5a2.5 2.5 0 012.5 2.5z" {...stroke} />
          <circle cx="12" cy="2.6" r="0" {...stroke} />
        </svg>
      );
    case "pinard":
      return null; // the mark itself stands here
    case "pass":
      // A tick, earned.
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M8 12.5l2.8 2.7L16.5 9" {...stroke} />
        </svg>
      );
  }
}

export function Journey() {
  const root = useRef<HTMLDivElement | null>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reduced) {
      el.style.setProperty("--journey", "1");
      nodes.current.forEach((n) => n?.style.setProperty("--near", "1"));
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const box = el.getBoundingClientRect();
      const viewport = window.innerHeight || 1;

      // How far down the road we have travelled: 0 when its top reaches
      // the middle of the screen, 1 when its bottom does.
      const travelled = (viewport * 0.5 - box.top) / Math.max(1, box.height);
      el.style.setProperty(
        "--journey",
        String(Math.min(1, Math.max(0, travelled)))
      );

      // Each landmark wakes as it nears the middle of the screen and
      // settles back as it leaves — the Pinard mark most of all.
      for (const node of nodes.current) {
        if (!node) continue;
        const r = node.getBoundingClientRect();
        const distance = Math.abs(r.top + r.height / 2 - viewport * 0.5);
        const near = Math.min(1, Math.max(0, 1 - distance / (viewport * 0.45)));
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
  }, []);

  return (
    <div
      ref={root}
      aria-hidden="true"
      className="journey pointer-events-none absolute inset-y-0 right-full mr-8 hidden w-28 lg:block"
    >
      {/* The road. Drawn to where you have got to, dotted ahead of you. */}
      <svg
        className="absolute inset-0 h-full w-full"
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

      {LANDMARKS.map((mark, i) => (
        <div
          key={mark.label}
          ref={(n) => {
            nodes.current[i] = n;
          }}
          className="journey-stop absolute left-0 w-full -translate-y-1/2 text-center"
          style={{ top: `${mark.at}%` }}
        >
          {mark.icon === "pinard" ? (
            <span className="journey-mark block">
              <Logo variant="compact" className="mx-auto h-9 w-auto" />
            </span>
          ) : (
            <span className="journey-icon mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-porcelain text-greentop">
              <Icon kind={mark.icon} />
            </span>
          )}
          <span className="journey-label mt-1.5 block px-1 font-mono text-[10px] leading-tight text-graphite/45">
            {mark.label}
          </span>
        </div>
      ))}
    </div>
  );
}
