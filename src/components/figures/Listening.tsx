"use client";

import { useEffect, useRef, useState } from "react";
import { Driven, reducedMotion, useIsoLayoutEffect, type SpringConfig } from "@/components/landing/motion";
import { HORN_TOP } from "@/components/landing/horn-gl";
import { ThinkingTrace } from "@/components/Trace";
import { ARCS, ARC_HALF, ARC_TUBE, createListening, rx, rz, then, type Draw } from "./figures-gl";

/**
 * What Ask Pinard shows while it works on an answer: its own mark,
 * listening.
 *
 * Asked for by the owner on 13 November 2026, a 3D animation for the
 * wait that fits the site, its purpose, and stays clean. It is the logo
 * come alive: the horn, turned and lit as the landing page's is, with
 * the logo's three sound arcs over its ear plate, in a small dark lens
 * cut from the same room as the stage and Today's band.
 *
 * A Pinard is for listening to a heart, so while Pinard works it
 * listens: the horn turns slowly in the light, its rose light beats, and
 * with each beat the arcs light from the ear outward, the way the
 * logo's do. The beat is calm, slower than any fetal heart, so it reads
 * as patience rather than alarm. Each line of an answer as it arrives
 * (`ticks`) is heard as an extra beat, so the mark answers the work
 * actually being done.
 *
 * The words beside it say which stage the answer is at, and are what a
 * screen reader hears. With reduced motion the mark is drawn once, still.
 * Without WebGL the running trace it replaced stands in.
 */

const ARRIVE: SpringConfig = { damping: 1, response: 0.5 };

/** A calm heart: one beat every 1.4 s, with a second smaller one just after. */
const BEAT = 1.4;
/** The lean of the mark, as the logo's: top to the right, a little toward
 *  the reader. */
const LEAN = -0.3;
const TOWARD = 0.2;
/** How much of the lens the whole mark fills, in horn units per pixel of
 *  the lens's height. */
const UNIT = 0.215;
/** The mark's middle, so it sits centred in the lens. */
const CENTRE: [number, number, number] = [-0.2, -0.52, 0];

const gauss = (x: number, at: number, width: number) => Math.exp(-(((x - at) / width) ** 2));
/** Quick to rise, slow to fall, peaking at 1: a sound arriving. */
const bump = (x: number) => (x <= 0 ? 0 : (x / 0.09) * Math.exp(1 - x / 0.09));

function Mark({ ticks, onFlat }: { ticks: number; onFlat: () => void }) {
  const lens = useRef<HTMLSpanElement | null>(null);
  const flat = useRef(onFlat);
  flat.current = onFlat;
  const heard = useRef<number[]>([]);

  // Each new line of the answer, heard.
  const seen = useRef(ticks);
  useEffect(() => {
    if (ticks > seen.current) heard.current = [...heard.current.slice(-3), performance.now()];
    seen.current = ticks;
  }, [ticks]);

  useIsoLayoutEffect(() => {
    const holder = lens.current;
    if (!holder) return;
    // A canvas of its own each time it is set up, taken away with it. Its
    // graphics context is let go of at once when the wait ends, so asking
    // one question after another never piles them up until the browser
    // drops one (it would drop the oldest, which may be Today's figures).
    // A canvas kept across a remount would be handed back that let-go
    // context, as it is in development, where React mounts twice.
    const cv = document.createElement("canvas");
    cv.setAttribute("aria-hidden", "true");
    holder.appendChild(cv);
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
      const t = (now - start) / 1000;
      const a = arrive.value;
      const h = cv!.clientHeight || 60;
      const w = cv!.clientWidth || 60;
      const unit = h * UNIT * (0.86 + 0.14 * a);
      const base = { x: w / 2, y: h / 2, unit, key: 1, alpha: Math.min(1, a * 1.4) };

      // The horn turns slowly through the light, a small circle of its
      // axis, so the highlights glide along it.
      const turn = (Math.PI * 2 * t) / 5.5;
      const wobble = still ? [0, 0] : [0.13 * Math.sin(turn), 0.09 * Math.cos(turn)];
      const horn = then(rx(wobble[0]), rz(wobble[1]), rx(TOWARD), rz(LEAN));
      const at = (y: number): [number, number, number] => [
        horn[3] * y + CENTRE[0],
        horn[4] * y + CENTRE[1],
        horn[5] * y + CENTRE[2],
      ];

      // The heart, and what the ear hears of it.
      const phase = t % BEAT;
      const lines = heard.current.map((ms) => (now - ms) / 1000);
      const beat = still ? 0 : Math.max(gauss(phase, 0.06, 0.06) + 0.6 * gauss(phase, 0.29, 0.06), ...lines.map((x) => gauss(x, 0.05, 0.07)));

      const list: Draw[] = [
        { ...base, piece: P.horn, rot: horn, shift: CENTRE, dye: "green", rim: 0.7, pulse: beat },
      ];

      // The arcs, over the ear plate, lighting from the ear outward.
      const arcs = then(rx(Math.PI / 2 - TOWARD), rz(LEAN));
      const middle = at(HORN_TOP + 0.08);
      ARCS.forEach((radius, k) => {
        const delay = 0.14 + 0.15 * k;
        const level = still
          ? 0.6
          : Math.min(1, Math.max(bump(phase - delay), bump(phase + BEAT - delay), ...lines.map((x) => bump(x - delay) * 0.9)));
        const size = 1 + 0.05 * level;
        const look = {
          ...base,
          rot: arcs,
          shift: middle,
          dye: "red" as const,
          key: 0.45 + 0.55 * level,
          rim: 0.75 + 0.5 * level,
          alpha: base.alpha * (0.45 + 0.55 * level),
        };
        list.push({ ...look, piece: P.arcs[k], size });
        for (const side of [-1, 1]) {
          const angle = -Math.PI / 2 + side * ARC_HALF;
          list.push({
            ...look,
            piece: P.cap,
            size: ARC_TUBE * size,
            off: [radius * size * Math.cos(angle), 0, radius * size * Math.sin(angle)],
          });
        }
      });
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

  return <span ref={lens} className="contents" />;
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
    <p className={`flex items-center gap-3.5 ${className}`.trim()} role="status" aria-live="polite">
      <span className="listen-lens" aria-hidden="true">
        <Mark ticks={ticks} onFlat={() => setFlat(true)} />
      </span>
      <span className="font-ui text-[15px] leading-snug text-ink/70">{label}</span>
    </p>
  );
}
