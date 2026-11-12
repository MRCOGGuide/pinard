"use client";

import { useRef, useState, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { createHorn, type Pose } from "./horn-gl";
import {
  Spring,
  THROWN,
  clamp01,
  listen,
  reducedMotion,
  rubberband,
  useIsoLayoutEffect,
  type SpringConfig,
} from "./motion";

/**
 * The opening of the page: the words, and the horn itself.
 *
 * The site is named after an instrument, so the instrument is what the
 * page opens on, as an object rather than a logo: it leans toward the
 * pointer, it can be taken hold of and turned, and thrown, and it lies
 * down as the page is scrolled away. Its rose light beats while the
 * page is moving, which is the heartbeat the earlier page's trace had,
 * moved onto the thing that hears it.
 *
 * Nothing here runs on a timer. Every movement is a spring heading for
 * a target, so it can be interrupted at any point, and when nothing is
 * moving nothing is drawn.
 *
 * Built for a phone first, after the owner found it lagging on one
 * (12 November 2026). Three things were costing it:
 *
 * - The drawing surface was the whole stage, 1.7 million pixels on a
 *   phone, cleared and redrawn every frame for a horn that covers a
 *   fifth of it. It is now a box just large enough to turn the horn in.
 * - Every frame measured the page (getBoundingClientRect) and wrote the
 *   handle's position back to it, which makes the browser lay the page
 *   out again in the middle of a scroll. Sizes are now read when the
 *   stage changes size and at no other time.
 * - The horn's turn was tied straight to the scroll position, so it
 *   moved in steps whenever scroll events came unevenly, as they do on
 *   a phone. It follows through a spring now, like everything else.
 */

/** Heavy and unhurried: this is a turned piece of metal, not a cursor. */
const WEIGHT: SpringConfig = { damping: 1, response: 0.7 };
const ARRIVE: SpringConfig = { damping: 1, response: 1.25 };
const FADE: SpringConfig = { damping: 1, response: 0.85 };
/** Following the scroll: close behind it, with the steps smoothed out. */
const TRAIL: SpringConfig = { damping: 1, response: 0.3 };

/** At rest: leaning away up and to the right, so the bell opens toward
 *  the reader. Lean is from upright; turn is the way it leans. */
const LEAN = 0.74;
const TURN = -0.86;

/** The surface, as a multiple of the horn's length: room for it to be
 *  turned any way up, with the nearer end drawn larger by perspective. */
const ROOM = 1.34;

const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function Stage({ children }: { children: ReactNode }) {
  const stage = useRef<HTMLElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const grip = useRef<HTMLDivElement | null>(null);
  /** No WebGL: the drawn mark stands in for the object. */
  const [flat, setFlat] = useState(false);

  useIsoLayoutEffect(() => {
    const el = stage.current;
    const cv = canvas.current;
    const hand = grip.current;
    if (!el || !cv || !hand) return;
    // A finger's screen is dense enough that half as many pixels again
    // is plenty for a smooth object, and it is the screen with the least
    // to spare.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const horn = createHorn(cv, touch ? 1.5 : 2);
    if (!horn) {
      setFlat(true);
      return;
    }

    const still = reducedMotion();
    /** The room the words leave for it on a narrow screen (landing.css). */
    const room = el.querySelector<HTMLElement>(".pd-stage-room");
    let seen = true;
    let frame = 0;
    let held = false;
    /** Where the pointer asks it to lean, on top of its resting pose. */
    let wantTurn = 0;
    let wantLean = 0;

    /* Measured in layout(), and only there. */
    let size = 1;
    let middleX = 0;
    let middleY = 0;
    let stageTop = 0;
    let stageHeight = 1;
    let stageWidth = 1;

    const request = () => {
      if (!frame && seen) frame = requestAnimationFrame(draw);
    };

    const turn = new Spring(TURN, WEIGHT, request);
    const lean = new Spring(LEAN, WEIGHT, request);
    const arrive = new Spring(still ? 1 : 0, ARRIVE, request);
    const beat = new Spring(0, FADE, request);
    /** How far the stage has been scrolled away, 0 to 1. */
    const away = new Spring(0, TRAIL, request);

    /**
     * Where the horn stands and how large, and the surface and the
     * handle placed over it. The only place the page is measured.
     */
    function layout() {
      const outer = el!.getBoundingClientRect();
      stageWidth = outer.width;
      stageHeight = outer.height;
      stageTop = outer.top + window.scrollY;
      let x: number;
      let y: number;
      if (room && room.offsetHeight > 0) {
        const inner = room.getBoundingClientRect();
        x = stageWidth * 0.5;
        y = inner.top - outer.top + inner.height * 0.5;
        size = Math.min(inner.height, stageWidth * 0.98);
      } else {
        x = stageWidth * 0.725;
        y = stageHeight * 0.505;
        size = Math.min(stageHeight * 0.8, stageWidth * 0.42);
      }
      // A box centred on the horn, cut off where the stage ends.
      const side = size * ROOM;
      const left = Math.max(0, x - side / 2);
      const right = Math.min(stageWidth, x + side / 2);
      const top = Math.max(0, y - side / 2);
      const bottom = Math.min(stageHeight, y + side / 2);
      cv!.style.left = `${left}px`;
      cv!.style.top = `${top}px`;
      cv!.style.width = `${right - left}px`;
      cv!.style.height = `${bottom - top}px`;
      middleX = x - left;
      middleY = y - top;
      hand!.style.left = `${x - size * 0.36}px`;
      hand!.style.top = `${y - size * 0.5}px`;
      hand!.style.width = `${size * 0.72}px`;
      hand!.style.height = `${size}px`;
      horn!.fit();
    }

    /*
      Keeping up. Frames that follow one another are timed, and if a run
      of them comes slower than about 36 a second the horn is drawn at
      fewer pixels, once and then once more. A gap of a tenth of a
      second is not a slow frame, it is the page having been idle.
    */
    let last = 0;
    let run = 0;
    let spent = 0;
    let share = 1;
    function pace() {
      const now = performance.now();
      const gap = now - last;
      last = now;
      if (gap > 100 || share <= 0.5) return;
      run += 1;
      spent += gap;
      if (run < 30) return;
      if (spent / run > 28) {
        share = share > 0.75 ? 0.7 : 0.5;
        horn!.soften(share);
      }
      run = 0;
      spent = 0;
    }

    function draw() {
      frame = 0;
      pace();
      const a = arrive.value;
      const out = smooth(0.05, 1, away.value);
      const theta = lean.value + (1 - a) * 0.5 + out * 0.62;
      const phi = turn.value - (1 - a) * 0.9 + out * 1.15;
      const pose: Pose = {
        axis: [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)],
        x: middleX,
        y: middleY,
        size: size * (0.9 + 0.1 * a),
        key: a,
        rim: 0.35 + 0.65 * a,
        pulse: beat.value,
        opacity: Math.min(1, a * 1.7) * (1 - smooth(0.62, 1, away.value)),
      };
      horn!.draw([pose]);
    }

    /** Heard: the rose light comes up and falls away, twice, as a heart does. */
    let lastBeat = 0;
    let second = 0;
    function pulse() {
      const now = performance.now();
      if (now - lastBeat < 950) return;
      lastBeat = now;
      beat.set(1);
      beat.to(0);
      second = window.setTimeout(() => {
        beat.set(Math.max(beat.value, 0.7));
        beat.to(0);
      }, 210);
    }

    /** From the scroll position alone: nothing on the page is measured. */
    const scrolled = () => clamp01((window.scrollY - stageTop) / Math.max(1, stageHeight * 0.9));

    // The graphics context can be taken away (a phone under memory
    // pressure does it): the drawn mark stands in from then on.
    const lost = (e: Event) => {
      e.preventDefault();
      setFlat(true);
    };
    cv.addEventListener("webglcontextlost", lost);

    const resized = new ResizeObserver(() => {
      layout();
      away.set(scrolled());
      request();
    });
    resized.observe(el);

    const watch = new IntersectionObserver((entries) => {
      seen = entries[entries.length - 1].isIntersecting;
      if (seen) request();
    });
    watch.observe(el);

    layout();
    away.set(scrolled());
    draw();

    if (still) {
      // The finished picture, which can still be turned by hand or key.
      const drag = attachDrag(false);
      return () => {
        cancelAnimationFrame(frame);
        drag();
        cv.removeEventListener("webglcontextlost", lost);
        resized.disconnect();
        watch.disconnect();
        horn.dispose();
      };
    }

    arrive.to(1);
    const firstBeat = window.setTimeout(pulse, 1500);

    const stopScroll = listen(() => {
      // Out of sight it is left alone: there is nothing to draw, and a
      // scroll further down the page should cost this nothing.
      if (!seen) return;
      const to = scrolled();
      away.to(to);
      if (to > 0.01 && to < 0.95) pulse();
    });

    const follow = (e: PointerEvent) => {
      if (held || e.pointerType !== "mouse") return;
      const px = (e.clientX / Math.max(1, stageWidth)) * 2 - 1;
      const py = ((e.clientY + window.scrollY - stageTop) / Math.max(1, stageHeight)) * 2 - 1;
      wantTurn = px * 0.42;
      wantLean = -py * 0.16;
      turn.to(TURN + wantTurn);
      lean.to(LEAN + wantLean);
    };
    const leave = () => {
      if (held) return;
      wantTurn = 0;
      wantLean = 0;
      turn.to(TURN);
      lean.to(LEAN);
    };
    el.addEventListener("pointermove", follow);
    el.addEventListener("pointerleave", leave);

    const drag = attachDrag(true);

    /**
     * Taking hold of it. While held it follows the hand exactly, with
     * no spring in between; past how far it can lean it resists rather
     * than stops; and let go, it carries on at the speed the hand left
     * it at before it settles back.
     */
    function attachDrag(springBack: boolean) {
      const node = hand!;
      const LOW = 0.12;
      const HIGH = 1.5;
      let id = -1;
      let x0 = 0;
      let y0 = 0;
      let turn0 = 0;
      let lean0 = 0;
      let trail: { x: number; y: number; t: number }[] = [];

      const down = (e: PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        id = e.pointerId;
        held = true;
        node.setPointerCapture(id);
        node.dataset.held = "";
        x0 = e.clientX;
        y0 = e.clientY;
        // From where it is on screen now, not from where it was heading.
        turn0 = turn.value;
        lean0 = lean.value;
        turn.set(turn0);
        lean.set(lean0);
        trail = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
      };
      const move = (e: PointerEvent) => {
        if (e.pointerId !== id) return;
        trail.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
        if (trail.length > 6) trail.shift();
        turn.set(turn0 + (e.clientX - x0) * 0.0085);
        let l = lean0 - (e.clientY - y0) * 0.005;
        if (l < LOW) l = LOW + rubberband(l - LOW, 0.5);
        if (l > HIGH) l = HIGH + rubberband(l - HIGH, 0.5);
        lean.set(l);
        request();
      };
      const up = (e: PointerEvent) => {
        if (e.pointerId !== id) return;
        id = -1;
        held = false;
        delete node.dataset.held;
        if (!springBack) return;
        const recent = trail.filter((p) => e.timeStamp - p.t < 100);
        const a = recent[0];
        const b = recent[recent.length - 1];
        const dt = a && b ? (b.t - a.t) / 1000 : 0;
        const vx = dt > 0 ? (b.x - a.x) / dt : 0;
        const vy = dt > 0 ? (b.y - a.y) / dt : 0;
        // Home is the nearest whole turn, so a spin is not unwound.
        const turns = Math.round((turn.value - TURN) / (Math.PI * 2));
        turn.value -= turns * Math.PI * 2;
        turn.configure(THROWN);
        lean.configure(THROWN);
        turn.to(TURN + wantTurn, vx * 0.0085);
        lean.to(LEAN + wantLean, -vy * 0.005);
        window.setTimeout(() => {
          if (held) return;
          turn.configure(WEIGHT);
          lean.configure(WEIGHT);
        }, 900);
        pulse();
      };
      const key = (e: KeyboardEvent) => {
        const step = e.shiftKey ? 0.5 : 0.18;
        const by =
          e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -0.1] : e.key === "ArrowDown" ? [0, 0.1] : null;
        if (!by) return;
        e.preventDefault();
        const t = turn.value + by[0];
        const l = Math.max(LOW, Math.min(HIGH, lean.value + by[1]));
        if (springBack) {
          turn.to(t);
          lean.to(l);
        } else {
          turn.set(t);
          lean.set(l);
          request();
        }
      };
      node.addEventListener("pointerdown", down);
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up);
      node.addEventListener("pointercancel", up);
      node.addEventListener("keydown", key);
      return () => {
        node.removeEventListener("pointerdown", down);
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        node.removeEventListener("pointercancel", up);
        node.removeEventListener("keydown", key);
      };
    }

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(firstBeat);
      clearTimeout(second);
      stopScroll();
      drag();
      el.removeEventListener("pointermove", follow);
      el.removeEventListener("pointerleave", leave);
      cv.removeEventListener("webglcontextlost", lost);
      resized.disconnect();
      watch.disconnect();
      [turn, lean, arrive, beat, away].forEach((s) => s.stop());
      horn.dispose();
    };
  }, []);

  return (
    <section ref={stage} className="bleed pd-stage">
      <div className="pd-stage-light" aria-hidden="true" />
      <canvas ref={canvas} className="pd-stage-canvas" aria-hidden="true" hidden={flat} />
      {flat ? (
        <div className="pd-stage-flat" aria-hidden="true">
          <Logo variant="mark" className="h-full w-auto" animated={false} />
        </div>
      ) : (
        <div
          ref={grip}
          className="pd-stage-grip"
          role="img"
          tabIndex={0}
          aria-label="A Pinard horn, the fetal stethoscope this site is named after. Drag it, or use the arrow keys, to turn it."
        />
      )}
      <div className="pl-frame pd-stage-words">{children}</div>
    </section>
  );
}
