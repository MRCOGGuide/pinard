"use client";

import { useRef } from "react";
import { FOLLOW, Spring, listen, reducedMotion, useIsoLayoutEffect } from "./motion";

/**
 * The trace, edge to edge, passing behind the question card. It is the
 * paper of a CTG, and the reader's scroll feeds it: scroll down and it
 * runs left, scroll back and it runs right, stop and it stops. That
 * keeps what the owner liked about the earlier page's heartbeat (a line
 * that is alive while the page moves) without a timer behind it.
 */
export function CtgLine() {
  const paper = useRef<HTMLDivElement | null>(null);

  useIsoLayoutEffect(() => {
    const el = paper.current;
    if (!el || reducedMotion()) return;
    const paint = (y: number) => el.style.setProperty("--feed", `${(y * 0.55).toFixed(1)}px`);
    const spring = new Spring(window.scrollY, FOLLOW, paint);
    paint(window.scrollY);
    const stop = listen(() => spring.to(window.scrollY));
    return () => {
      stop();
      spring.stop();
    };
  }, []);

  return (
    <div className="pl-ctg" aria-hidden="true">
      <div ref={paper} className="pl-ctg-paper" />
    </div>
  );
}
