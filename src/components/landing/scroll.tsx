"use client";

import {
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

/** The band of the screen that counts as "reached": the middle 70%. */
const BAND = "-15% 0px -15% 0px";

export function useScrollPlay<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [phase, setPhase] = useState<Phase>("still");

  useIsoLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined" || reducedMotion()) return;

    // On screen when the page arrives: leave it finished rather than
    // blanking it in front of the reader. Off screen: set it back now,
    // unseen, before the first paint after hydration.
    const r = node.getBoundingClientRect();
    let onArrival = r.top < window.innerHeight * 0.85 && r.bottom > window.innerHeight * 0.15;
    if (!onArrival) setPhase("waiting");

    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries[entries.length - 1].isIntersecting;
        if (onArrival && seen) return;
        onArrival = false;
        setPhase(seen ? "playing" : "waiting");
      },
      { rootMargin: BAND }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, phase] as const;
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

/** The fade every section and step shares: 250ms, opacity and a 16px
 *  rise, nothing else. */
export const FADE = "transition-[opacity,transform] duration-[250ms] ease-out motion-reduce:transition-none";

export function fadeStyle(phase: Phase) {
  const shown = phase !== "waiting";
  return { opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(16px)" };
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
  const [ref, phase] = useScrollPlay<HTMLElement>();
  return (
    <Tag ref={ref as never} id={id} className={`${FADE} ${className}`} style={fadeStyle(phase)}>
      {children}
    </Tag>
  );
}
