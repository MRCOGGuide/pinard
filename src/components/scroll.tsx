"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Scroll behaviour for the landing page, in one place.
 *
 * A section fades and rises in as it reaches the middle of the screen
 * and fades out again as it leaves, and the pictures in it play from
 * the start every time it comes back. The owner asked for the page to
 * answer the scroll in both directions, so nothing here fires once and
 * disconnects.
 *
 * Under prefers-reduced-motion, without IntersectionObserver, or before
 * the script runs, everything is simply shown in its finished state.
 */

export const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** still: drawn finished. waiting: out of view, drawn at the start.
 *  playing: in view, running through its stages. */
export type Phase = "still" | "waiting" | "playing";

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The band of the screen that counts as "reached": all but the top 6%
 *  and the bottom 15%. The top margin is small on purpose: what sits at
 *  the very top of a page (a heading, the account header) must count as
 *  on screen, and a 15% margin there left it outside the band, faded
 *  out, on a tall screen. */
const BAND = "-6% 0px -15% 0px";

/** Which edge of the screen an element went out of view past, so it
 *  comes back from that side: down from above when scrolling up, up
 *  from below when scrolling down. */
export type Side = "above" | "below";

export function useScrollPlay<T extends HTMLElement>(
  /** Play once when the page opens if already on screen, rather than
   *  showing it finished: for a picture that is the first thing on a
   *  page and would otherwise only play once scrolled away and back. */
  { playOnArrival = false }: { playOnArrival?: boolean } = {}
) {
  const ref = useRef<T | null>(null);
  // A picture that plays on arrival starts empty, so it does not show
  // finished for a moment and then blank before playing.
  const [phase, setPhase] = useState<Phase>(playOnArrival ? "waiting" : "still");
  const [side, setSide] = useState<Side>("below");

  useIsoLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined" || reducedMotion()) {
      if (playOnArrival) setPhase("still");
      return;
    }

    // On screen when the page arrives: leave it finished rather than
    // blanking it in front of the reader. Off screen: set it back now,
    // unseen, before the first paint after hydration.
    const r = node.getBoundingClientRect();
    let onArrival = r.top < window.innerHeight * 0.85 && r.bottom > window.innerHeight * 0.15;
    let frame = 0;
    if (!onArrival) {
      setSide(r.bottom <= window.innerHeight * 0.15 ? "above" : "below");
      setPhase("waiting");
    } else if (playOnArrival) {
      // Already empty; run it from the start once it has painted.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setPhase("playing"));
      });
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        const seen = entry.isIntersecting;
        if (onArrival && seen) return;
        onArrival = false;
        if (!seen) {
          const middle = entry.rootBounds
            ? (entry.rootBounds.top + entry.rootBounds.bottom) / 2
            : window.innerHeight / 2;
          setSide(entry.boundingClientRect.top < middle ? "above" : "below");
        }
        setPhase(seen ? "playing" : "waiting");
      },
      { rootMargin: BAND }
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    // Read once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [ref, phase, side] as const;
}

/** How many of the stages, at these offsets in ms, have been reached.
 *  Starts again from nothing every time the phase turns to playing. */
export function useStages(phase: Phase, at: number[]): number {
  const [reached, setReached] = useState(0);
  useEffect(() => {
    setReached(0);
    if (phase !== "playing") return;
    const timers = at.map((ms, i) => window.setTimeout(() => setReached(i + 1), ms));
    return () => timers.forEach(clearTimeout);
    // The offsets are constants at each call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  return phase === "still" ? at.length : phase === "waiting" ? 0 : reached;
}

/** Characters typed so far, one every `every` ms once `go` is true. */
export function useTyping(phase: Phase, total: number, go: boolean, every: number): number {
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    setTyped(0);
    if (phase !== "playing" || !go) return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setTyped(n);
      if (n >= total) clearInterval(id);
    }, every);
    return () => clearInterval(id);
  }, [phase, go, total, every]);
  return phase === "still" ? total : typed;
}

/** The fade every section and step shares: 700ms, opacity and a 24px
 *  move from the side it left by, nothing else. */
export const FADE = "transition-[opacity,transform] duration-[700ms] ease-out motion-reduce:transition-none";

export function fadeStyle(phase: Phase, side: Side = "below") {
  const shown = phase !== "waiting";
  return {
    opacity: shown ? 1 : 0,
    transform: shown ? "none" : `translateY(${side === "above" ? -24 : 24}px)`,
  };
}

/** A landing section that fades in as it is reached and out as it goes. */
export function ScrollFade({
  children,
  className = "",
  id,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  as?: "section" | "div";
}) {
  const [ref, phase, side] = useScrollPlay<HTMLElement>();
  return (
    <Tag ref={ref as never} id={id} className={`${FADE} ${className}`} style={fadeStyle(phase, side)}>
      {children}
    </Tag>
  );
}

/**
 * A row of cards that arrive one after another each time the row is
 * reached, and leave together. SequenceItem reads its turn from here.
 */
const SequenceContext = createContext<{ phase: Phase; side: Side }>({ phase: "still", side: "below" });

export function Sequence({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [ref, phase, side] = useScrollPlay<HTMLDivElement>();
  return (
    <div ref={ref} className={className}>
      <SequenceContext.Provider value={{ phase, side }}>{children}</SequenceContext.Provider>
    </div>
  );
}

/** One card in a Sequence, 220ms after the one before it. */
export function SequenceItem({ index, children }: { index: number; children: ReactNode }) {
  const { phase, side } = useContext(SequenceContext);
  const shown = phase !== "waiting";
  return (
    <div
      className={`h-full ${FADE}`}
      style={{ ...fadeStyle(phase, side), transitionDelay: shown ? `${index * 220}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
