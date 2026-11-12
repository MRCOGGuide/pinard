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
 */

/** Heavy and unhurried: this is a turned piece of metal, not a cursor. */
const WEIGHT: SpringConfig = { damping: 1, response: 0.7 };
const ARRIVE: SpringConfig = { damping: 1, response: 1.25 };
const FADE: SpringConfig = { damping: 1, response: 0.85 };

/** At rest: leaning away up and to the right, so the bell opens toward
 *  the reader. Lean is from upright; turn is the way it leans. */
const LEAN = 0.74;
const TURN = -0.86;

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
    const horn = createHorn(cv);
    if (!horn) {
      setFlat(true);
      return;
    }

    const still = reducedMotion();
    let width = cv.clientWidth;
    let height = cv.clientHeight;
    let seen = true;
    let scrolled = 0;
    let frame = 0;
    let held = false;
    /** Where the pointer asks it to lean, on top of its resting pose. */
    let wantTurn = 0;
    let wantLean = 0;

    const request = () => {
      if (!frame && seen) frame = requestAnimationFrame(draw);
    };

    const turn = new Spring(TURN, WEIGHT, request);
    const lean = new Spring(LEAN, WEIGHT, request);
    const arrive = new Spring(still ? 1 : 0, ARRIVE, request);
    const beat = new Spring(0, FADE, request);

    /** The room the words leave for it on a narrow screen (design.css). */
    const room = el.querySelector<HTMLElement>(".pd-stage-room");

    function place(): { x: number; y: number; size: number } {
      if (room && room.offsetHeight > 0) {
        const outer = el!.getBoundingClientRect();
        const inner = room.getBoundingClientRect();
        return {
          x: width * 0.5,
          y: inner.top - outer.top + inner.height * 0.5,
          size: Math.min(inner.height * 1.12, width * 1.02),
        };
      }
      return { x: width * 0.725, y: height * 0.505, size: Math.min(height * 0.8, width * 0.42) };
    }

    function draw() {
      frame = 0;
      const at = place();
      const a = arrive.value;
      const out = smooth(0.05, 1, scrolled);
      const theta = lean.value + (1 - a) * 0.5 + out * 0.62;
      const phi = turn.value - (1 - a) * 0.9 + out * 1.15;
      const pose: Pose = {
        axis: [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)],
        x: at.x,
        // Slower than the page, so it is left behind a little as it goes.
        y: at.y + out * height * 0.16,
        size: at.size * (0.9 + 0.1 * a),
        key: a,
        rim: 0.35 + 0.65 * a,
        pulse: beat.value,
        opacity: Math.min(1, a * 1.7) * (1 - smooth(0.62, 1, scrolled)),
      };
      horn!.draw([pose]);
      // The handle sits over the horn, wherever the layout has put it.
      hand!.style.transform = `translate3d(${at.x - at.size * 0.36}px, ${at.y - at.size * 0.5}px, 0)`;
      hand!.style.width = `${at.size * 0.72}px`;
      hand!.style.height = `${at.size}px`;
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

    const readScroll = () => {
      const box = el.getBoundingClientRect();
      scrolled = clamp01(-box.top / Math.max(1, box.height * 0.9));
    };

    const size = new ResizeObserver(() => {
      horn.fit();
      width = cv.clientWidth;
      height = cv.clientHeight;
      request();
    });
    size.observe(cv);

    const watch = new IntersectionObserver((entries) => {
      seen = entries[entries.length - 1].isIntersecting;
      if (seen) request();
    });
    watch.observe(el);

    readScroll();
    draw();

    if (still) {
      // The finished picture, which can still be turned by hand or key.
      const drag = attachDrag(false);
      return () => {
        drag();
        size.disconnect();
        watch.disconnect();
        horn.dispose();
      };
    }

    arrive.to(1);
    const firstBeat = window.setTimeout(pulse, 1500);

    const stopScroll = listen(() => {
      readScroll();
      if (scrolled > 0.01 && scrolled < 0.95) pulse();
      request();
    });

    const follow = (e: PointerEvent) => {
      if (held || e.pointerType !== "mouse") return;
      const box = el.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * 2 - 1;
      const py = ((e.clientY - box.top) / box.height) * 2 - 1;
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
      size.disconnect();
      watch.disconnect();
      [turn, lean, arrive, beat].forEach((s) => s.stop());
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
