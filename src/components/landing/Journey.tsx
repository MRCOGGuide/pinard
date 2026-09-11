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

/** How much bigger a landmark gets as you reach it. One number for
 *  every kind of landmark, so a circle drawn round one is in the same
 *  proportion to it as the circle round the next. Kept in step with
 *  .journey-mark-3d and .journey-icon. */
const MAX_MARK_SCALE = 1.6;
/** Clearance, as a fraction of the landmark's own size rather than a
 *  fixed number of pixels — a fixed gap made the taller Pinard mark's
 *  circle read as far bigger than the icons', which is what it was. */
const CIRCLE_GAP = 0.1;
/** The rail's width in pixels, matching the w-24 it is laid out with.
 *  The road's viewBox is in pixels so its circles stay circular. */
const RAIL_WIDTH = 96;
/** How much of its section's height a name is stretched to run down.
 *  Past about two thirds it starts colliding with its neighbours where
 *  two short sections sit together. */
const NAME_SPAN = 0.62;
/** The size a name is measured at before it is fitted to its section. */
const NAME_BASE_PX = 42;
/** Wide enough to read as a set line rather than a word, and in em so
 *  it holds whatever size the section ends up asking for. */
const NAME_TRACK = "0.34em";
const NAME_WORD_GAP = "0.9em";
/** How far ahead of a circle a landmark begins to swell, and how far
 *  past it before it has let go again — both in page pixels, measured
 *  along the road rather than across the screen. Longer coming than
 *  going: arriving somewhere should be anticipated, leaving it should
 *  not linger. */
const MARK_APPROACH = 320;
const MARK_RELEASE = 240;
/** How much of a section is spent bringing its name in, and taking it
 *  out again. Out over a longer run than in: arriving should be quick
 *  and leaving should be gradual. */
const NAME_FADE_IN = 0.12;
const NAME_FADE_OUT = 0.26;
/** Past this, extra tracking stops reading as a word at all. */
const NAME_MAX_TRACK = 10;

type Ring = { y: number; r: number; resume: number };

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
/** One dot plus one gap, matching the stroke-dasharray on the road. */
const DASH_PERIOD = 10;

/** The nearest radius whose circumference is a whole number of dashes,
 *  so a circle's dots meet evenly where it closes. */
function snapRadius(r: number): number {
  const steps = Math.max(1, Math.round((2 * Math.PI * r) / DASH_PERIOD));
  return (steps * DASH_PERIOD) / (2 * Math.PI);
}

/** How long a cubic is, by walking it. There is no closed form, and the
 *  road needs the number before it is in the DOM — the dots are placed
 *  from it, so a run can be made to hold a whole number of them. Twenty
 *  four steps is accurate to about a hundredth of a pixel on bends this
 *  gentle, against a dash period of ten. */
function cubicLength(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number
): number {
  let length = 0;
  let px = x0;
  let py = y0;
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    const u = 1 - t;
    const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
    const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
    length += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return length;
}

/**
 * The road: a serpentine down the page, drawing a full circle around
 * every landmark on its way past.
 *
 * The bends are the point of it — three across five thousand pixels
 * reads as a straight line — and the circles are what stop it running
 * through the marks and their labels, which is what a straight line
 * did. Between one landmark and the next it swings once, alternating
 * side, and the swing narrows toward the end so the last stretch runs
 * straight at the destination.
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
  let d = "";
  let cursor = 0;
  let leg = 0;

  /**
   * The stretch from where we are to where the next circle begins.
   *
   * Bent roughly every 340 pixels rather than once per gap: a landmark
   * can be two screenfuls from the next, and a single swing across
   * that distance is a line that looks straight and merely misaligned.
   * The side alternates and the swing narrows as the page goes on, so
   * the last stretch runs straight at the destination.
   */
  const BEND_EVERY = 340;
  const bendTo = (from: number, to: number) => {
    const span = to - from;
    // Too short for a bend, which would read as a kink.
    if (span < 90) return { d: ` L ${cx} ${to}`, length: Math.abs(span) };
    const bends = Math.max(1, Math.round(span / BEND_EVERY));
    const step = span / bends;
    let d = "";
    let length = 0;
    for (let i = 0; i < bends; i++) {
      const y0 = from + i * step;
      const y1 = y0 + step;
      const swing = 34 * (1 - Math.min(1, leg / 12) * 0.6);
      const side = leg % 2 === 0 ? -1 : 1;
      leg += 1;
      const c1 = { x: cx + side * swing, y: y0 + step * 0.35 };
      const c2 = { x: cx + side * swing, y: y1 - step * 0.35 };
      d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${cx} ${y1}`;
      length += cubicLength(cx, y0, c1.x, c1.y, c2.x, c2.y, cx, y1);
    }
    return { d, length };
  };

  for (const stop of stops) {
    /*
      A circumference that divides evenly by the dash period, so the
      last dot before the circle closes falls a whole period from the
      first. Left unsnapped, the remainder lands at the top of the
      circle and two dots sit almost on top of each other there.
    */
    const r = snapRadius(stop.r);
    const top = stop.y - r;
    const bottom = stop.y + r;
    // Two landmarks close enough that their circles would overlap: the
    // second is left to the line rather than drawn through the first.
    if (top < cursor - 0.5) continue;

    /*
      The line stops a full dash period short of the circle, and the run
      is made to hold a whole number of dashes so that it does.

      A dash pattern restarts at every subpath, so the circle's first dot
      always sits at its top, while the run's last dot fell wherever its
      length happened to leave it. The gap between the two measured 5.3
      units coming into Real questions and 14.1 into Ask Pinard, against
      the 10 that every other gap on the rail holds — the first reads as
      the line arriving almost on top of the circle.

      Widening the clearance does not help: the run loses exactly what
      the clearance gains, their sum is fixed, and the gap only ever
      jumps by a whole period. What does help is moving where the run
      BEGINS, which changes its length without touching the clearance.
      Starting it `drift` lower sets where its dots fall.

      It is aimed to end half a period past its last dot rather than on
      it. A run of a whole number of periods puts the next dash exactly
      on the path's end, and a dash with no room left is dropped by the
      renderer or drawn as a sliver — the dot at the top of the circle
      looked missing at five of the eight landmarks. Ending mid-gap
      leaves the last dot whole, with the circle one period beyond it.

      The drift is at most one period — ten pixels lower down a rail
      five thousand tall, below the landmark it is leaving.
    */
    const end = top - DASH_PERIOD / 2;
    const legBefore = leg;
    let drift = 0;
    // A run with no room for two dots has no spacing to preserve, and
    // shortening it further only eats the approach: the first landmark
    // sits near the top of the rail and its run is a few pixels long.
    if (end - cursor >= 2 * DASH_PERIOD) {
      // Shortening the run can change how many bends it is cut into, so
      // the correction is re-read rather than assumed; it settles at once.
      const AIM = DASH_PERIOD / 2;
      for (let pass = 0; pass < 3; pass++) {
        leg = legBefore;
        const remainder = bendTo(cursor + drift, end).length % DASH_PERIOD;
        const correction = (remainder - AIM + DASH_PERIOD) % DASH_PERIOD;
        if (correction < 0.05) break;
        drift += correction;
      }
    }
    leg = legBefore;
    // The first landmark can sit within a dash of the rail's start, and
    // an approach to it would be drawn upward, above where the road
    // begins. It simply goes without one.
    if (end > cursor) {
      const run = bendTo(cursor + drift, end);
      d += ` M ${cx} ${cursor + drift}` + run.d;
    }

    // The circle is its own closed subpath, so its dashes start at its
    // top and run round evenly rather than continuing the line's phase.
    d += ` M ${cx} ${top}`;
    d += ` A ${r} ${r} 0 0 1 ${cx} ${bottom}`;
    d += ` A ${r} ${r} 0 0 1 ${cx} ${top}`;
    d += " Z";

    // Resuming at the circle's foot would run the line straight down
    // through the label. It picks up below it instead.
    const resume = Math.max(bottom, stop.resume);
    cursor = resume;
  }
  d += ` M ${cx} ${cursor}` + bendTo(cursor, height).d;
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
  const [rings, setRings] = useState<(Ring | null)[]>(() =>
    LANDMARKS.map(() => null)
  );
  const [tops, setTops] = useState<(number | null)[]>(() =>
    LANDMARKS.map(() => null)
  );
  /** How tall each landmark's section is, which is what its name is
   *  stretched against. */
  const [spans, setSpans] = useState<(number | null)[]>(() =>
    LANDMARKS.map(() => null)
  );
  const names = useRef<(HTMLElement | null)[]>([]);
  /** The sections the landmarks mark. The name fades against the
   *  section's own edges, so it has to be measured, not inferred from
   *  where its landmark happens to sit. */
  const sections = useRef<(HTMLElement | null)[]>([]);

  // Anchor each landmark to the middle of the section it marks, so the
  // road stays in step when the page grows a section or loses one.
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const place = () => {
      const base = el.getBoundingClientRect().top + window.scrollY;
      const boxes = LANDMARKS.map((mark, i) => {
        const section = document.querySelector<HTMLElement>(
          `[data-journey="${mark.section}"]`
        );
        sections.current[i] = section;
        return section ? section.getBoundingClientRect() : null;
      });
      setTops(
        boxes.map((box) => (box ? box.top + window.scrollY + box.height / 2 - base : null))
      );
      setSpans(boxes.map((box) => (box ? box.height : null)));
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
    // Index-aligned with LANDMARKS, holes and all. Compacted, the
    // scroll handler below would read the wrong landmark's circle for
    // any stop whose section had not rendered.
    const measured: (Ring | null)[] = LANDMARKS.map(() => null);
    nodes.current.forEach((stop, i) => {
      const mark = marks.current[i];
      if (!stop || !mark || tops[i] === null) return;
      const y =
        (tops[i] as number) - stop.offsetHeight / 2 + mark.offsetTop + mark.offsetHeight / 2;
      // Height, not the larger of the two: the Pinard mark is a tall
      // narrow horn, and sizing its circle on the diagonal left it
      // ringed in empty space beside the icons' snug ones.
      const size = mark.offsetHeight;
      measured[i] = {
        y,
        r: (size / 2) * MAX_MARK_SCALE * (1 + CIRCLE_GAP),
        // The foot of the whole stop, label included.
        resume: (tops[i] as number) + stop.offsetHeight / 2 + 4,
      };
    });
    setRings(measured);
  }, [tops]);

  /*
    Each name is stretched to run down most of the section it marks.

    A single size cannot do that: these sections range from a few
    hundred pixels to well over a thousand, so a name that spanned a
    short one would overrun a long one and a name that fitted the long
    one would be a stub beside the short. The tracking is solved for
    instead — measure what the words come to at rest, take the
    difference from the target, and share it out between the letters,
    with a space counting for three so the gap between words stays
    the wider one.
  */
  useEffect(() => {
    names.current.forEach((name, i) => {
      const span = spans[i];
      if (!name || !span) return;

      /*
        The spacing is in em, so it grows with the type rather than
        being what is left over after it. Solved the other way round —
        size first, spacing to make up the difference — the fit came
        out right and the letters came out touching, because scaling
        the type had already closed the gap.

        With both in em the whole line scales as one, so the length is
        simply proportional to the size and one measurement settles it.
      */
      name.style.fontSize = `${NAME_BASE_PX}px`;
      name.style.letterSpacing = NAME_TRACK;
      name.style.wordSpacing = NAME_WORD_GAP;

      // Rotated by writing-mode, so the text runs along the box's height.
      const natural = name.getBoundingClientRect().height;
      const target = span * NAME_SPAN;
      const scale = clamp(target / Math.max(1, natural), 0.5, 1.9);
      name.style.fontSize = `${(NAME_BASE_PX * scale).toFixed(1)}px`;

      // A section long enough to hit the ceiling gets the rest in
      // tracking rather than being left short.
      const fitted = name.getBoundingClientRect().height;
      const short = target - fitted;
      if (short > 1) {
        const text = name.textContent ?? "";
        const gaps = Math.max(1, text.length - 1);
        const spaces = (text.match(/ /g) ?? []).length;
        const unit = Math.min(NAME_MAX_TRACK, short / (gaps + spaces * 3));
        const base = parseFloat(getComputedStyle(name).letterSpacing) || 0;
        name.style.letterSpacing = `${(base + unit).toFixed(2)}px`;
        name.style.wordSpacing = `${(base * 3 + unit * 3).toFixed(2)}px`;
      }
    });
  }, [spans, tops]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.setProperty("--journey", "1");
      nodes.current.forEach((n) => {
        n?.style.setProperty("--near", "1");
        n?.style.setProperty("--within", "1");
      });
      return;
    }

    // The road's own top, in the same rail coordinates the rings are
    // measured in. Recomputed here rather than closed over from the
    // render, which would go stale the moment a section moved.
    const measured = rings.filter((r): r is Ring => r !== null);
    const roadTopPx = measured.length
      ? Math.min(...measured.map((r) => r.y - r.r))
      : 0;

    let frame = 0;
    const update = () => {
      frame = 0;
      const box = (road.current ?? el).getBoundingClientRect();
      const viewport = window.innerHeight || 1;

      const maxScroll = Math.max(
        1,
        document.documentElement.scrollHeight - viewport
      );

      /*
        How much of the road has been travelled, measured against the
        scroll rather than against where the road happens to sit on the
        screen.

        Measured the other way, a page opened and not yet touched
        already showed a run of red dots: the road begins near the top
        of the document, so the mid-screen line was past its start
        before anyone had done anything. Nothing is travelled until
        something is scrolled.
      */
      const roadTopDoc = box.top + window.scrollY;
      const roadFoot = roadTopDoc + box.height;
      // Where the scroll has to reach for the road to be finished, and
      // never past what the page can actually scroll to.
      const finish = Math.max(1, Math.min(maxScroll, roadFoot - viewport * 0.5));
      const travelled = window.scrollY / finish;
      el.style.setProperty(
        "--journey",
        String(Math.min(1, Math.max(0, travelled)))
      );

      /*
        Where the drawn part of the road has got to, in road pixels.
        Everything a landmark does is timed against this rather than
        against the screen, so a mark grows as the line comes down to
        it, holds while the line goes round it, and lets go once the
        circle is closed. Timed against the screen it began shrinking
        the moment the line arrived — the mark was at its smallest
        while the road was still drawing its circle.
      */
      const front = Math.min(1, Math.max(0, travelled)) * box.height;

      nodes.current.forEach((node, i) => {
        if (!node) return;
        const ring = rings[i];
        let near = 0;
        if (ring) {
          const r = snapRadius(ring.r);
          const top = ring.y - roadTopPx - r;
          const bottom = ring.y - roadTopPx + r;
          near =
            front < top
              ? clamp(1 - (top - front) / MARK_APPROACH, 0, 1)
              : front <= bottom
                ? 1
                : clamp(1 - (front - bottom) / MARK_RELEASE, 0, 1);
        }
        node.style.setProperty("--near", near.toFixed(3));

        /*
          The name answers a different question from the mark.

          --near is how close the landmark is, so a name keyed to it
          began fading the moment the road finished its circle — half
          way through the section it was naming. --within is where the
          focus line sits inside the section itself: up quickly on
          entering, held all the way down, and away over the last
          quarter, so the name leaves as its section does.
        */
        const section = sections.current[i];
        if (!section) return;
        const box = section.getBoundingClientRect();
        /*
          Measured against the middle of the screen, not against focus.
          Focus slides toward the foot of the page so the road can
          finish, which is right for the road and wrong for this: by
          the middle of the page it sat a couple of hundred pixels low,
          so a section read as three quarters spent when it was half,
          and its name left early.
        */
        const progress = (viewport * 0.5 - box.top) / Math.max(1, box.height);
        const within =
          progress < 0 || progress > 1
            ? 0
            : clamp(
                Math.min(progress / NAME_FADE_IN, (1 - progress) / NAME_FADE_OUT),
                0,
                1
              );
        node.style.setProperty("--within", within.toFixed(3));
      });
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
  }, [tops, rings]);

  // The road runs from the first landmark to the last: starting it at
  // the top of the page draws a line to nowhere above the first stop.
  const placed = tops.filter((v): v is number => v !== null);
  // The road spans the circles, not the landmark centres. Ending it at
  // the centres put the first and last circles half outside the box,
  // and the clip that reveals the travelled road clips to that box —
  // so the first landmark's ring was dropped entirely.
  const placedRings = rings.filter((r): r is Ring => r !== null);
  const edges = placedRings.length
    ? [
        Math.min(...placedRings.map((r) => r.y - r.r)),
        Math.max(...placedRings.map((r) => Math.max(r.y + r.r, r.resume))),
      ]
    : placed.length
      ? [Math.min(...placed), Math.max(...placed)]
      : [0, 0];
  const roadTop = edges[0];
  const roadHeight = Math.max(0, edges[1] - edges[0]);
  const path = roadPath(
    RAIL_WIDTH / 2,
    roadHeight,
    placedRings.map((ring) => ({
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
            {/* Set on its side in the margin beside the rail, not under
                the mark: under it the road had to detour round the
                writing as well, and the name was too small to read
                anyway. Ghosted, so it names the section without
                competing with it. */}
            <span
              ref={(n) => {
                names.current[i] = n;
              }}
              className="journey-name absolute right-full top-1/2 mr-5 font-display font-semibold uppercase text-ink"
            >
              {mark.label}
            </span>
          </div>
        )
      )}
    </div>
  );
}
