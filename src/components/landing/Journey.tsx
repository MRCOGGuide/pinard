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
  icon:
    | "booked"
    | "questions"
    | "pinard"
    | "steps"
    | "mock"
    | "current"
    | "plans"
    | "start";
};

const LANDMARKS: Landmark[] = [
  { section: "hero", label: "Exam booked", icon: "booked" },
  { section: "questions", label: "Real questions", icon: "questions" },
  { section: "ask", label: "Ask Pinard", icon: "pinard" },
  { section: "steps", label: "How it works", icon: "steps" },
  { section: "mock", label: "Under the clock", icon: "mock" },
  { section: "current", label: "Always current", icon: "current" },
  { section: "pricing", label: "One subscription", icon: "plans" },
  { section: "start", label: "Start today", icon: "start" },
];

/** How much bigger a landmark gets as you reach it. The circle drawn
 *  round it has to clear the largest it will ever be, not the size it
 *  happens to be when measured. Kept in step with .journey-mark-3d. */
const MAX_MARK_SCALE = 1.6;
/** The rail's width in pixels, matching the w-24 it is laid out with.
 *  The road's viewBox is in pixels so its circles stay circular. */
const RAIL_WIDTH = 96;
/** Clearance between the mark at full size and the road around it. */
const CIRCLE_GAP = 7;

/**
 * The road: straight down, with a full circle drawn around every
 * landmark.
 *
 * It used to be a serpentine stretched over the page, which put the
 * line straight through each mark and its label — the road went over
 * the destination rather than round it. A circle reads as arriving
 * somewhere, and it gives the descent a rhythm the bends were there to
 * provide.
 *
 * Built in pixels rather than in a 100x1000 box stretched to fit,
 * because a circle in a box stretched five thousand pixels tall is an
 * extremely tall ellipse.
 */
function roadPath(
  cx: number,
  height: number,
  stops: { y: number; r: number; resume: number }[]
): string {
  let d = `M ${cx} 0`;
  let cursor = 0;
  for (const stop of stops) {
    const top = stop.y - stop.r;
    const bottom = stop.y + stop.r;
    // Two landmarks close enough that their circles would overlap: the
    // second is left to the straight line rather than drawn through the
    // first. Compared against where the last circle ended, never
    // against the top of the box.
    if (top < cursor - 0.5) continue;
    d += ` L ${cx} ${top}`;
    // Two half-arcs: one sweep cannot return to where it started.
    d += ` A ${stop.r} ${stop.r} 0 0 1 ${cx} ${bottom}`;
    d += ` A ${stop.r} ${stop.r} 0 0 1 ${cx} ${top}`;
    // Resuming at the circle's foot would run the line straight down
    // through the label, which is the thing this was meant to stop. It
    // picks up below the writing instead, and the gap reads as the
    // label sitting in the road's lay-by.
    const resume = Math.max(bottom, stop.resume);
    d += ` M ${cx} ${resume}`;
    cursor = resume;
  }
  d += ` L ${cx} ${height}`;
  return d;
}

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
    // A clock: the paper is the same questions with the time on.
    case "mock":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <circle cx="12" cy="13" r="8" {...line} />
          <path d="M12 8.5V13l3 2" {...line} />
          <path d="M9 2.5h6" {...line} />
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
  const marks = useRef<(HTMLElement | null)[]>([]);
  /** Where each landmark's mark sits and how big a circle clears it.
   *  Measured rather than worked out: a label that wraps to two lines
   *  moves the mark up inside its stop, and the road has to follow. */
  const [rings, setRings] = useState<
    { y: number; r: number; resume: number }[]
  >([]);
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

  // offsetTop and offsetHeight rather than a bounding rect: the marks
  // are already scaled by --near when this runs, and a rect would
  // measure them at whatever size the scroll position had left them.
  useEffect(() => {
    const measured: { y: number; r: number; resume: number }[] = [];
    nodes.current.forEach((stop, i) => {
      const mark = marks.current[i];
      if (!stop || !mark || tops[i] === null) return;
      const y =
        (tops[i] as number) - stop.offsetHeight / 2 + mark.offsetTop + mark.offsetHeight / 2;
      const size = Math.max(mark.offsetWidth, mark.offsetHeight);
      measured.push({
        y,
        r: (size / 2) * MAX_MARK_SCALE + CIRCLE_GAP,
        // The foot of the whole stop, label included.
        resume: (tops[i] as number) + stop.offsetHeight / 2 + 4,
      });
    });
    setRings(measured);
  }, [tops]);

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

      /*
        Where on the screen "here" is.

        Mid-screen for most of the page, sliding to the foot of it as
        the page runs out. The last landmark sits close to the bottom
        of the document and can never be scrolled to the middle — the
        page stops first — so with a fixed mid-screen line the final
        stretch of road stayed grey however far you scrolled, and the
        last mark never quite lit. The line comes to meet it.
      */
      const maxScroll = Math.max(
        1,
        document.documentElement.scrollHeight - viewport
      );
      const pageProgress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      const focus = viewport * (0.5 + 0.5 * pageProgress);

      const travelled = (focus - box.top) / Math.max(1, box.height);
      el.style.setProperty(
        "--journey",
        String(Math.min(1, Math.max(0, travelled)))
      );

      /*
        The last landmark sits above the footer and stops perhaps 250px
        short of the foot of the screen, so even with the sliding focus
        it only ever reached about four tenths lit — it grew a little,
        glowed a little, and never arrived. Over the final tenth of the
        page the focus reaches the rest of the way to it.

        Only the final tenth: applied throughout, this would drag the
        focus toward a landmark still thousands of pixels below and
        light the wrong one all the way down.
      */
      const endgame = Math.max(0, (pageProgress - 0.9) / 0.1);
      const last = nodes.current[nodes.current.length - 1];
      const lastBox = last?.getBoundingClientRect();
      const lastCentre = lastBox ? lastBox.top + lastBox.height / 2 : focus;
      const markFocus = focus + (lastCentre - focus) * endgame;

      for (const node of nodes.current) {
        if (!node) continue;
        const r = node.getBoundingClientRect();
        const distance = Math.abs(r.top + r.height / 2 - markFocus);
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
  // The road spans the circles, not the landmark centres. Ending it at
  // the centres put the first and last circles half outside the box,
  // and the clip that reveals the travelled road clips to that box —
  // so the first landmark's ring was dropped entirely.
  const edges = rings.length
    ? [
        Math.min(...rings.map((r) => r.y - r.r)),
        Math.max(...rings.map((r) => Math.max(r.y + r.r, r.resume))),
      ]
    : placed.length
      ? [Math.min(...placed), Math.max(...placed)]
      : [0, 0];
  const roadTop = edges[0];
  const roadHeight = Math.max(0, edges[1] - edges[0]);
  const path = roadPath(
    RAIL_WIDTH / 2,
    roadHeight,
    rings.map((ring) => ({
      y: ring.y - roadTop,
      r: ring.r,
      resume: ring.resume - roadTop,
    }))
  );

  return (
    <div
      ref={root}
      aria-hidden="true"
      className="journey pointer-events-none absolute inset-y-0 right-full mr-8 hidden w-24 lg:block"
    >
      {/* The road: dotted ahead of you, drawn in the accent behind. */}
      <svg
        ref={road}
        className="absolute left-0 w-full overflow-visible"
        style={{ top: roadTop, height: roadHeight }}
        viewBox={`0 0 ${RAIL_WIDTH} ${Math.max(1, roadHeight)}`}
        fill="none"
      >
        <path
          className="journey-road-ahead"
          d={path}
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="1 9"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="journey-road-done"
          d={path}
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
              <span
                className="journey-mark-3d block"
                ref={(n) => {
                  marks.current[i] = n;
                }}
              >
                <span className="journey-mark block">
                  <Logo variant="mark" className="mx-auto h-11 w-auto" />
                </span>
              </span>
            ) : (
              <span
                ref={(n) => {
                  marks.current[i] = n;
                }}
                className="journey-icon mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-good"
              >
                <Icon kind={mark.icon} />
              </span>
            )}
            <span className="journey-label mt-2 block font-mono text-[10px] leading-tight text-ink/45">
              {mark.label}
            </span>
          </div>
        )
      )}
    </div>
  );
}
