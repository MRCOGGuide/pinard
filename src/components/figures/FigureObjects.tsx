"use client";

import { useRef } from "react";
import {
  Driven,
  THROWN,
  clamp01,
  reducedMotion,
  useIsoLayoutEffect,
  type SpringConfig,
} from "@/components/landing/motion";
import {
  DISCS,
  DISC_FOOT,
  DISC_PITCH,
  DIAL_LIFT,
  FILL,
  STACK_TOP,
  createFigures,
  ringPoint,
  rx,
  ry,
  rz,
  then,
  type Draw,
} from "./figures-gl";

export type Band = "green" | "amber" | "red";

export type FigureValues = {
  days: Band;
  readiness: { share: number; band: Band };
  questions: { share: number; band: Band };
  topics: { done: number; total: number; band: Band };
};

/**
 * The four objects on Today's figures (./figures-gl), and how they move.
 *
 * They arrive one after another as the page opens, each doing the thing
 * that shows its figure: the hourglass turns itself over, the ring fills
 * to the readiness, the discs drop onto the spindle, the finished topics
 * rise out of the dial. The figures beside them count up over the same
 * second and a half.
 *
 * After that they move only when the reader does. Under a mouse they
 * lean toward the pointer. A press dips the one pressed at once, on the
 * press rather than the release; a tap makes it do its thing again; a
 * sideways drag turns it, and let go it carries on at the finger's speed
 * and settles back. As the band is scrolled away they tip back with it.
 *
 * Built the way the horn was rebuilt for a phone (Stage, 12 and 13
 * November): one canvas for the four, sized to the card; nothing on the
 * page measured except when the card changes size; one frame loop that
 * steps every spring and draws in the frame that asked; nothing drawn
 * when nothing moves or the card is off screen.
 *
 * With reduced motion they are drawn finished and still. Without WebGL,
 * or if the graphics context is lost, `onFlat` hands the card back its
 * bars.
 */

const ARRIVE: SpringConfig = { damping: 1, response: 0.9 };
const WEIGHT: SpringConfig = { damping: 1, response: 0.6 };
const PRESS: SpringConfig = { damping: 1, response: 0.16 };
/** Let go of: a little give, because the finger pressed it in. */
const RELEASE: SpringConfig = { damping: 0.62, response: 0.4 };
const TURN_OVER: SpringConfig = { damping: 0.8, response: 0.85 };
const FILLING: SpringConfig = { damping: 1, response: 1.1 };
const COUNTING: SpringConfig = { damping: 1, response: 1.2 };
/** A disc dropped onto the stack: it lands, and settles. */
const FALL: SpringConfig = { damping: 0.6, response: 0.42 };
const SPIN: SpringConfig = { damping: 1, response: 1.0 };
const TRAIL: SpringConfig = { damping: 1, response: 0.3 };
const TRAIL_TOUCH: SpringConfig = { damping: 1, response: 0.12 };

/** How large each is drawn against its slot: the ring and the dial are
 *  round and can fill it; the hourglass is tall. */
const FIT = [0.93, 1.12, 1.22, 1.1];
/** How high above its place a disc starts its drop, in its own units. */
const DROP = 0.9;
/** The stack's middle, so it turns about itself. */
const STACK_MID = STACK_TOP / 2;
/** A sideways drag turns an object this much a pixel. */
const DRAG = 0.012;

export function FigureObjects({ values, onFlat }: { values: FigureValues; onFlat: () => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const flat = useRef(onFlat);
  flat.current = onFlat;

  useIsoLayoutEffect(() => {
    const cv = canvas.current;
    const card = cv?.parentElement;
    if (!cv || !card) return;
    const slots = Array.from(card.querySelectorAll<HTMLElement>("[data-figure]"));
    if (slots.length !== 4) return;
    const figures = createFigures(cv, values.topics.total);
    if (!figures) {
      flat.current();
      return;
    }
    const P = figures.pieces;
    const still = reducedMotion();
    const touch = window.matchMedia("(pointer: coarse)").matches;

    const discs = values.questions.share <= 0 ? 0 : Math.max(1, Math.min(DISCS, Math.round(values.questions.share * DISCS)));
    const readiness = Math.max(0, Math.min(1, values.readiness.share));
    const topicsDone = Math.max(0, Math.min(values.topics.total, values.topics.done));

    let seen = true;
    let frame = 0;
    const request = () => {
      if (!frame && seen) frame = requestAnimationFrame(loop);
    };

    type Thing = {
      x: number;
      y: number;
      unit: number;
      arrive: Driven;
      leanX: Driven;
      leanY: Driven;
      turn: Driven;
      press: Driven;
    };
    const things: Thing[] = [0, 1, 2, 3].map(() => ({
      x: 0,
      y: 0,
      unit: 0,
      arrive: new Driven(still ? 1 : 0, ARRIVE, request),
      leanX: new Driven(0, WEIGHT, request),
      leanY: new Driven(0, WEIGHT, request),
      turn: new Driven(0, WEIGHT, request),
      press: new Driven(1, PRESS, request),
    }));

    // The hourglass arrives upside down and turns itself over.
    let flipTo = 0;
    const flip = new Driven(still ? 0 : Math.PI, TURN_OVER, request);
    const fill = new Driven(still ? readiness : 0, FILLING, request);
    let ringTo = 0;
    const ringSpin = new Driven(0, SPIN, request);
    const count = new Driven(still ? discs : 0, COUNTING, request);
    const drops = Array.from({ length: DISCS }, () => new Driven(still ? 0 : DROP, FALL, request));
    const dropping = drops.map(() => still);
    const done = new Driven(still ? topicsDone : 0, COUNTING, request);
    let dialTo = 0;
    const dialSpin = new Driven(0, SPIN, request);
    const away = new Driven(0, touch ? TRAIL_TOUCH : TRAIL, request);

    const springs: Driven[] = [
      ...things.flatMap((t) => [t.arrive, t.leanX, t.leanY, t.turn, t.press]),
      flip,
      fill,
      ringSpin,
      count,
      ...drops,
      done,
      dialSpin,
      away,
    ];

    /* Measured here and only here: when the card changes size. */
    let cardLeft = 0;
    let cardTop = 0;
    let bandBottom = 1;
    function layout() {
      const box = cv!.getBoundingClientRect();
      cardLeft = box.left + window.scrollX;
      cardTop = box.top + window.scrollY;
      bandBottom = box.bottom + window.scrollY;
      slots.forEach((slot, i) => {
        const r = slot.getBoundingClientRect();
        things[i].x = r.left - box.left + r.width / 2;
        things[i].y = r.top - box.top + r.height / 2;
        things[i].unit = Math.min(r.width, r.height) / 2;
      });
      figures!.fit();
    }

    let last = 0;
    function loop(now: number) {
      frame = 0;
      const gap = last ? now - last : 0;
      last = now;
      const dt = gap ? Math.min(gap / 1000, 1 / 20) : 1 / 60;
      let moving = false;
      for (const s of springs) if (s.step(dt)) moving = true;
      // Each disc is let go as the count reaches it.
      for (let i = 0; i < discs; i++) {
        if (!dropping[i] && count.value > i) {
          dropping[i] = true;
          drops[i].to(0);
          moving = true;
        }
      }
      draw();
      if (moving && seen && !frame) frame = requestAnimationFrame(loop);
      if (!frame) last = 0;
    }

    function draw() {
      const tip = away.value * 0.5;
      const list: Draw[] = [];
      const pose = (i: number) => {
        const t = things[i];
        const a = t.arrive.value;
        return {
          // Leaning toward the pointer, turned by a hand, and turning
          // into place as it arrives; tipped back as the band leaves.
          after: [rx(t.leanY.value + tip), ry(t.leanX.value + t.turn.value - (1 - a) * 1.1)],
          x: t.x,
          y: t.y,
          unit: t.unit * FIT[i] * (0.8 + 0.2 * a) * t.press.value,
          key: 0.25 + 0.75 * a,
          rim: 0.3 + 0.7 * a,
          alpha: Math.min(1, a * 1.6),
        };
      };

      // Days to go: the hourglass.
      {
        const p = pose(0);
        list.push({ ...p, piece: P.glass, rot: then(ry(0.35), rz(flip.value), rx(0.3), ...p.after), dye: values.days });
      }

      // Readiness: the ring, filled to the share, a ball at each end of
      // the fill, and a small steel jewel at the 70% pass mark.
      {
        const p = pose(1);
        const rot = then(ry(ringSpin.value), rx(1.18), ...p.after);
        const dye = values.readiness.band;
        const f = Math.max(0, fill.value);
        list.push({ ...p, piece: P.track, rot, dye: "graphite" });
        if (f > 0.002) list.push({ ...p, piece: P.fill, rot, dye, sweep: f });
        list.push({ ...p, piece: P.ball, rot, dye, size: FILL, off: ringPoint(0) });
        if (f > 0.002) list.push({ ...p, piece: P.ball, rot, dye, size: FILL, off: ringPoint(f) });
        const mark = ringPoint(0.7);
        list.push({ ...p, piece: P.ball, rot, dye: "steel", size: 0.032, off: [mark[0], 0.088, mark[2]] });
      }

      // Questions: the stand, the spindle, and the discs on it.
      {
        const p = pose(2);
        const rot = then(ry(0.2), rx(0.42), ...p.after);
        const base: [number, number, number] = [0, -STACK_MID, 0];
        list.push({ ...p, piece: P.stand, rot, dye: "graphite", off: base });
        list.push({ ...p, piece: P.spindle, rot, dye: "steel", off: base });
        for (let i = 0; i < discs; i++) {
          if (!dropping[i]) continue;
          const lift = drops[i].value;
          list.push({
            ...p,
            piece: P.disc,
            rot,
            dye: values.questions.band,
            off: [0, -STACK_MID + DISC_FOOT + i * DISC_PITCH + lift, 0],
            alpha: p.alpha * Math.min(1, 0.25 + (DROP - lift) / 0.35),
          });
        }
      }

      // Topics done: the dial, its finished segments raised.
      {
        const p = pose(3);
        const rot = then(ry(dialSpin.value), rx(1.02), ...p.after);
        list.push({ ...p, piece: P.dialBase, rot, dye: "graphite" });
        list.push({ ...p, piece: P.dial, rot, dye: values.topics.band, done: done.value, lift: DIAL_LIFT, dim: 0.72 });
        list.push({ ...p, piece: P.hub, rot, dye: "steel" });
      }

      figures!.draw(list);
    }

    const lost = (e: Event) => {
      e.preventDefault();
      flat.current();
    };
    cv.addEventListener("webglcontextlost", lost);

    const resized = new ResizeObserver(() => {
      layout();
      request();
    });
    resized.observe(card);

    const watch = new IntersectionObserver((entries) => {
      seen = entries[entries.length - 1].isIntersecting;
      if (seen) request();
    });
    watch.observe(card);

    layout();
    draw();

    if (still) {
      return () => {
        cancelAnimationFrame(frame);
        cv.removeEventListener("webglcontextlost", lost);
        resized.disconnect();
        watch.disconnect();
        figures.dispose();
      };
    }

    // Arriving, one after another.
    const starts = [
      () => {
        flipTo = 0;
        flip.to(flipTo);
      },
      () => fill.to(readiness),
      () => count.to(discs),
      () => done.to(topicsDone),
    ];
    const timers = things.map((t, i) =>
      window.setTimeout(() => {
        t.arrive.to(1);
        starts[i]();
      }, 120 + i * 110)
    );

    /** What a tap on each does: its arrival, once more. */
    const again = [
      () => {
        flipTo -= Math.PI;
        flip.to(flipTo);
      },
      () => {
        ringTo += Math.PI * 2;
        ringSpin.to(ringTo);
      },
      () => {
        // The top disc hops and lands again.
        if (discs > 0) drops[discs - 1].to(0, 3.4);
      },
      () => {
        dialTo -= Math.PI * 2;
        dialSpin.to(dialTo);
      },
    ];

    const onScroll = () => {
      if (!seen) return;
      away.to(clamp01(window.scrollY / Math.max(1, bandBottom)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    /** Which object a finger or the mouse button is holding, if any. */
    let held = -1;
    let id = -1;
    let x0 = 0;
    let y0 = 0;
    let turn0 = 0;
    let dragged = false;
    let trail: { x: number; t: number }[] = [];

    // Under a mouse, each leans toward the pointer.
    const follow = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || held >= 0) return;
      const px = e.clientX + window.scrollX - cardLeft;
      const py = e.clientY + window.scrollY - cardTop;
      for (const t of things) {
        t.leanX.to(Math.max(-1, Math.min(1, (px - t.x) / 170)) * 0.34);
        t.leanY.to(Math.max(-1, Math.min(1, (py - t.y) / 120)) * 0.22);
      }
    };
    const rest = () => {
      if (held >= 0) return;
      for (const t of things) {
        t.leanX.to(0);
        t.leanY.to(0);
      }
    };
    card.addEventListener("pointermove", follow);
    card.addEventListener("pointerleave", rest);

    // Taking hold of one (the state is declared above).
    const downs = slots.map((slot, i) => (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      held = i;
      id = e.pointerId;
      slot.setPointerCapture(id);
      x0 = e.clientX;
      y0 = e.clientY;
      dragged = false;
      turn0 = things[i].turn.value;
      things[i].turn.set(turn0);
      trail = [{ x: e.clientX, t: e.timeStamp }];
      things[i].press.configure(PRESS);
      things[i].press.to(0.9);
    });
    const move = (e: PointerEvent) => {
      if (held < 0 || e.pointerId !== id) return;
      const dx = e.clientX - x0;
      if (!dragged && Math.abs(dx) > 8) dragged = true;
      if (!dragged) return;
      trail.push({ x: e.clientX, t: e.timeStamp });
      if (trail.length > 6) trail.shift();
      things[held].turn.set(turn0 + dx * DRAG);
    };
    const up = (e: PointerEvent) => {
      if (held < 0 || e.pointerId !== id) return;
      const t = things[held];
      t.press.configure(RELEASE);
      t.press.to(1);
      const moved = Math.hypot(e.clientX - x0, e.clientY - y0);
      if (dragged) {
        const recent = trail.filter((p) => e.timeStamp - p.t < 100);
        const a = recent[0];
        const b = recent[recent.length - 1];
        const span = a && b ? (b.t - a.t) / 1000 : 0;
        const v = span > 0 ? (b.x - a.x) / span : 0;
        // Home is the nearest whole turn, so a spin is not unwound.
        const turns = Math.round(t.turn.value / (Math.PI * 2));
        t.turn.value -= turns * Math.PI * 2;
        t.turn.configure(THROWN);
        t.turn.to(0, v * DRAG);
        const which = t;
        window.setTimeout(() => which.turn.configure(WEIGHT), 900);
      } else if (e.type === "pointerup" && moved < 10) {
        again[held]();
      }
      held = -1;
      id = -1;
    };
    slots.forEach((slot, i) => {
      slot.addEventListener("pointerdown", downs[i]);
      slot.addEventListener("pointermove", move);
      slot.addEventListener("pointerup", up);
      slot.addEventListener("pointercancel", up);
    });

    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      window.removeEventListener("scroll", onScroll);
      card.removeEventListener("pointermove", follow);
      card.removeEventListener("pointerleave", rest);
      slots.forEach((slot, i) => {
        slot.removeEventListener("pointerdown", downs[i]);
        slot.removeEventListener("pointermove", move);
        slot.removeEventListener("pointerup", up);
        slot.removeEventListener("pointercancel", up);
      });
      cv.removeEventListener("webglcontextlost", lost);
      resized.disconnect();
      watch.disconnect();
      figures.dispose();
    };
    // Mounted afresh when the figures change (StatStrip keys it on them).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvas} className="figure-canvas" aria-hidden="true" />;
}
