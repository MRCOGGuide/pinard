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
    // Fed only while it can be seen: further down the page there is no
    // paper on screen to move.
    let seen = true;
    const watch =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            seen = entries[entries.length - 1].isIntersecting;
            if (seen) spring.to(window.scrollY);
          });
    watch?.observe(el);
    const stop = listen(() => {
      if (seen) spring.to(window.scrollY);
    });
    return () => {
      stop();
      watch?.disconnect();
      spring.stop();
    };
  }, []);

  return (
    <div className="pl-ctg" aria-hidden="true">
      <div ref={paper} className="pl-ctg-paper" />
    </div>
  );
}
