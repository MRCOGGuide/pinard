"use client";

import { useEffect, useRef, useState } from "react";
import { Driven, reducedMotion, useIsoLayoutEffect, type SpringConfig } from "@/components/landing/motion";
import { ThinkingTrace } from "@/components/Trace";
import { BEAD, createListening, rx, ry, rz, then, type Draw, type Dye } from "./figures-gl";

/**
 * What Ask Pinard shows while it works on an answer: a small gimbal.
 *
 * Asked for by the owner on 13 November 2026: a 3D animation for the
 * wait that fits the site and its purpose, professional and clean. The
 * first version was the logo in a dark tile; the owner found it too
 * large and out of proportion, and asked for something elegant, not
 * necessarily the logo. This is that: three fine rings, one inside
 * another, and a steel bead at their middle, like the cage of a
 * gyroscope or a navigator's instrument. It is the same anodised metal,
 * lit in the same studio, as the horn and Today's figures, at the size
 * of a line of text, and it sits on the page with no box around it.
 *
 * Each ring turns on pins in the one outside it, at a speed that never
 * lines up with the others, so the motion is calm and never seen to
 * repeat, and the light glides round the metal as it turns. The inner
 * ring is the heartbeat's rose and its light beats softly; each line of
 * an answer as it arrives (`ticks`) is a beat of its own, so the mark
 * answers the work actually being done.
 *
 * The words beside it say which stage the answer is at, and are what a
 * screen reader hears. With reduced motion it is drawn once, still.
 * Without WebGL the running trace it replaced stands in.
 */

const ARRIVE: SpringConfig = { damping: 1, response: 0.55 };

/** A calm heart: a beat every 1.4 s, a second smaller one just after. */
const BEAT = 1.4;
/** How long one turn of each ring takes, outermost first, in seconds:
 *  slow, and chosen so the three never come back into step. */
const PERIODS = [7.3, 4.9, 3.4];
/** How much of the canvas the gimbal fills. */
const UNIT = 0.46;
const DYES: Dye[] = ["green", "steel", "red"];

const gauss = (x: number, at: number, width: number) => Math.exp(-(((x - at) / width) ** 2));

function Mark({ ticks, onFlat }: { ticks: number; onFlat: () => void }) {
  const holder = useRef<HTMLSpanElement | null>(null);
  const flat = useRef(onFlat);
  flat.current = onFlat;
  const heard = useRef<number[]>([]);

  // Each new line of the answer, heard.
  const counted = useRef(ticks);
  useEffect(() => {
    if (ticks > counted.current) heard.current = [...heard.current.slice(-3), performance.now()];
    counted.current = ticks;
  }, [ticks]);

  useIsoLayoutEffect(() => {
    const box = holder.current;
    if (!box) return;
    // A canvas of its own each time it is set up, taken away with it. Its
    // graphics context is let go of at once when the wait ends, so asking
    // one question after another never piles them up until the browser
    // drops one (it would drop the oldest, which may be Today's figures).
    // A canvas kept across a remount would be handed back that let-go
    // context, as it is in development, where React mounts twice.
    const cv = document.createElement("canvas");
    cv.setAttribute("aria-hidden", "true");
    box.appendChild(cv);
    const mark = createListening(cv);
    if (!mark) {
      cv.remove();
      flat.current();
      return;
    }
    const P = mark.pieces;
    const still = reducedMotion();
    let frame = 0;
    const arrive = new Driven(still ? 1 : 0, ARRIVE, () => {});
    const start = performance.now();
    let last = 0;

    function draw(now: number) {
      // Still, it is shown part way through its turn, where the three
      // rings stand clear of one another.
      const t = still ? 2.1 : (now - start) / 1000;
      const a = arrive.value;
      const h = cv.clientHeight || 40;
      const w = cv.clientWidth || 40;
      const base = {
        x: w / 2,
        y: h / 2,
        unit: h * UNIT * (0.82 + 0.18 * a),
        key: 0.35 + 0.65 * a,
        alpha: Math.min(1, a * 1.4),
      };

      // The heart, and each line of the answer heard on top of it.
      const phase = t % BEAT;
      const lines = heard.current.map((ms) => (now - ms) / 1000);
      const beat = still
        ? 0
        : Math.max(0.55 * gauss(phase, 0.08, 0.07) + 0.3 * gauss(phase, 0.3, 0.07), ...lines.map((x) => gauss(x, 0.06, 0.09)));

      // The cage: the outer ring tilted toward the reader and turning
      // about the upright; each ring inside it on pins at right angles
      // to the last.
      const turn = (i: number) => (Math.PI * 2 * t) / PERIODS[i];
      const outer = then(rx(1.12), ry(turn(0) + 0.6));
      const middle = then(rx(Math.PI / 2 + turn(1)), outer);
      const inner = then(rz(Math.PI / 2 + turn(2)), middle);
      const rings = [outer, middle, inner];

      const list: Draw[] = rings.map((rot, i) => ({
        ...base,
        piece: P.rings[i],
        rot,
        dye: DYES[i],
        rim: i === 2 ? 0.7 + 0.3 * a : 0.55 * a,
        pulse: i === 2 ? beat : 0,
      }));
      list.push({ ...base, piece: P.bead, rot: outer, dye: "steel", size: BEAD, rim: 0.5 * a, pulse: beat * 0.4 });
      mark!.draw(list);
    }

    function loop(now: number) {
      const gap = last ? now - last : 0;
      last = now;
      arrive.step(gap ? Math.min(gap / 1000, 1 / 20) : 1 / 60);
      draw(now);
      frame = requestAnimationFrame(loop);
    }

    const lost = (e: Event) => {
      e.preventDefault();
      flat.current();
    };
    cv.addEventListener("webglcontextlost", lost);
    mark.fit();

    if (still) {
      draw(start);
    } else {
      arrive.to(1);
      // A status: it moves for as long as the answer is being made, and
      // the page takes it away when the answer comes.
      frame = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(frame);
      cv.removeEventListener("webglcontextlost", lost);
      mark.dispose();
      cv.remove();
    };
  }, []);

  return <span ref={holder} className="contents" />;
}

/** The wait, with the stage it is at beside it. */
export function ThinkingMark({
  label = "Thinking…",
  ticks = 0,
  className = "",
}: {
  label?: string;
  /** How many lines of the answer have arrived so far. */
  ticks?: number;
  className?: string;
}) {
  const [flat, setFlat] = useState(false);
  if (flat) return <ThinkingTrace label={label} className={className} />;
  return (
    <p className={`flex items-center gap-3 ${className}`.trim()} role="status" aria-live="polite">
      <span className="listen-orb" aria-hidden="true">
        <Mark ticks={ticks} onFlat={() => setFlat(true)} />
      </span>
      <span className="font-ui text-[15px] leading-snug text-ink/70">{label}</span>
    </p>
  );
}
