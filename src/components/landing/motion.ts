"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * The physics behind the landing page, in one small file, so the page
 * needs no animation library.
 *
 * Motion here is a behaviour, not a script. A spring has a target and a
 * current value and velocity; a new target just changes where it is
 * heading, so anything can be interrupted and reversed at any moment
 * without a jump. Springs are described the way Apple describes them:
 * damping (1 settles with no overshoot, below 1 overshoots) and response
 * (roughly how quickly it gets there, in seconds).
 */

export type SpringConfig = { damping: number; response: number };

/** The default: settles without overshoot. */
export const SETTLE: SpringConfig = { damping: 1, response: 0.42 };
/** Only after a throw: the hand gave it momentum, so a little overshoot
 *  reads as physical rather than decorative. */
export const THROWN: SpringConfig = { damping: 0.8, response: 0.38 };
/** Following the scroll: fast enough to feel attached, soft enough to
 *  hide the steps of a mouse wheel. */
export const FOLLOW: SpringConfig = { damping: 1, response: 0.16 };

const STEP = 1 / 240;

export class Spring {
  value: number;
  velocity = 0;
  private target: number;
  private stiffness = 0;
  private friction = 0;
  private raf = 0;
  private last = 0;

  constructor(
    value: number,
    config: SpringConfig,
    private onFrame: (value: number, done: boolean) => void
  ) {
    this.value = value;
    this.target = value;
    this.configure(config);
  }

  configure({ damping, response }: SpringConfig) {
    this.stiffness = (2 * Math.PI / response) ** 2;
    this.friction = (4 * Math.PI * damping) / response;
  }

  /** Head for a new target from wherever it is now, keeping its speed. */
  to(target: number, velocity?: number) {
    this.target = target;
    if (velocity !== undefined) this.velocity = velocity;
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  /** Put it somewhere with no motion: a finger holding it, for instance. */
  set(value: number) {
    this.stop();
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (now: number) => {
    let left = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    while (left > 0) {
      const dt = Math.min(STEP, left);
      const force = -this.stiffness * (this.value - this.target) - this.friction * this.velocity;
      this.velocity += force * dt;
      this.value += this.velocity * dt;
      left -= dt;
    }
    const scale = Math.max(Math.abs(this.target), 1);
    const done =
      Math.abs(this.value - this.target) < 0.0005 * scale &&
      Math.abs(this.velocity) < 0.005 * scale;
    if (done) {
      this.value = this.target;
      this.velocity = 0;
      this.raf = 0;
    } else {
      this.raf = requestAnimationFrame(this.tick);
    }
    this.onFrame(this.value, done);
  };
}

/**
 * The same spring, run by its owner rather than by itself.
 *
 * A Spring keeps its own frame loop, which suits one value on its own.
 * The horn is drawn from five of them at once, and with each running its
 * own loop a frame's drawing was always asked for from inside another
 * frame's callbacks, so it waited for the frame after: the horn showed
 * where the page had been two frames earlier. On a phone, where the page
 * moves under the finger with no delay at all, that reads as lag.
 *
 * These do not schedule anything. `to` and `set` only say that there is
 * something to do (`wake`); the owner steps every one of them once a
 * frame and draws in that same frame.
 */
export class Driven {
  value: number;
  velocity = 0;
  private target: number;
  private stiffness = 0;
  private friction = 0;

  constructor(
    value: number,
    config: SpringConfig,
    private wake: () => void
  ) {
    this.value = value;
    this.target = value;
    this.configure(config);
  }

  configure({ damping, response }: SpringConfig) {
    this.stiffness = (2 * Math.PI / response) ** 2;
    this.friction = (4 * Math.PI * damping) / response;
  }

  to(target: number, velocity?: number) {
    this.target = target;
    if (velocity !== undefined) this.velocity = velocity;
    this.wake();
  }

  set(value: number) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.wake();
  }

  /** Move on by `dt` seconds. True while it is still moving. */
  step(dt: number): boolean {
    if (this.value === this.target && this.velocity === 0) return false;
    let left = dt;
    while (left > 0) {
      const h = Math.min(STEP, left);
      const force = -this.stiffness * (this.value - this.target) - this.friction * this.velocity;
      this.velocity += force * h;
      this.value += this.velocity * h;
      left -= h;
    }
    const scale = Math.max(Math.abs(this.target), 1);
    if (
      Math.abs(this.value - this.target) < 0.0005 * scale &&
      Math.abs(this.velocity) < 0.005 * scale
    ) {
      this.value = this.target;
      this.velocity = 0;
      return false;
    }
    return true;
  }
}

/** Where a throw would come to rest, the way a scroll view decelerates.
 *  Apple's own projection, not v²/2a. Velocity in units per second. */
export function project(velocity: number, deceleration = 0.998): number {
  return ((velocity / 1000) * deceleration) / (1 - deceleration);
}

/** Past an edge the thing follows less and less, rather than stopping
 *  dead: real things slow before they stop. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/* One scroll listener for the whole page, read once per frame. */
const listeners = new Set<() => void>();
let queued = false;
function flush() {
  queued = false;
  listeners.forEach((fn) => fn());
}
function onScroll() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(flush);
}
export function listen(fn: () => void) {
  if (listeners.size === 0) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    }
  };
}

/**
 * A value tied to the scroll: `range` turns where the element is into
 * 0 to 1, and `onFrame` hears it through a fast, overshoot-free spring.
 * Stop scrolling and it stops; scroll back and it runs backwards. There
 * is no timer, so there is nothing to wait for and nothing to restart.
 *
 * With reduced motion it reports 1 once and never moves: the finished
 * picture, still, which is also what the server draws.
 */
export function useScrub<T extends HTMLElement>(
  range: (el: T, viewport: number) => number,
  onFrame: (p: number, el: T) => void,
  config: SpringConfig = FOLLOW
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const latest = useRef({ range, onFrame });
  latest.current = { range, onFrame };

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      latest.current.onFrame(1, el);
      return;
    }
    const read = () => clamp01(latest.current.range(el, window.innerHeight));
    const spring = new Spring(read(), config, (v) => latest.current.onFrame(v, el));
    latest.current.onFrame(spring.value, el);
    /*
      Only what is near the screen is measured as the page scrolls. A
      page of these each measuring itself on every scroll frame is what
      a phone feels as lag, and a picture two screens away has nothing
      to say: it is told once on its way out, so it rests at its start
      or its end, and then left alone until it comes back.
    */
    let near = true;
    const watch =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              near = entries[entries.length - 1].isIntersecting;
              spring.to(read());
            },
            { rootMargin: "75% 0px 75% 0px" }
          );
    watch?.observe(el);
    const stop = listen(() => {
      if (near) spring.to(read());
    });
    return () => {
      stop();
      watch?.disconnect();
      spring.stop();
    };
    // Read once, on mount; the callbacks stay current through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}

/** From the moment the element's top reaches `from` of the way down the
 *  screen until it reaches `to`. For something in the normal flow. */
export function passing(el: Element, viewport: number, from = 0.9, to = 0.42): number {
  const top = el.getBoundingClientRect().top;
  return (viewport * from - top) / (viewport * (from - to));
}

/**
 * A pointer drag along one axis. The handlers get pixels moved from the
 * press, and the release gets the speed it left the finger at, read from
 * the last few moves, so whatever happens next can carry on at that speed.
 *
 * Pointer capture keeps the tracking when the finger leaves the element.
 * touch-action: pan-y on the element leaves vertical scrolling to the
 * browser, so a page can still be scrolled through a slider.
 */
export function pointerDrag(
  e: React.PointerEvent<HTMLElement>,
  handlers: {
    onMove: (dx: number) => void;
    onEnd: (velocity: number, moved: boolean) => void;
  }
) {
  const el = e.currentTarget;
  const id = e.pointerId;
  const startX = e.clientX;
  let moved = false;
  const trail: { x: number; t: number }[] = [{ x: e.clientX, t: e.timeStamp }];
  el.setPointerCapture(id);

  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    if (Math.abs(ev.clientX - startX) > 3) moved = true;
    trail.push({ x: ev.clientX, t: ev.timeStamp });
    if (trail.length > 6) trail.shift();
    handlers.onMove(ev.clientX - startX);
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
    const now = ev.timeStamp;
    const recent = trail.filter((p) => now - p.t < 100);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const span = first && last ? (last.t - first.t) / 1000 : 0;
    const velocity = span > 0 ? (last.x - first.x) / span : 0;
    handlers.onEnd(velocity, moved);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}
