"use client";

import { Fragment } from "react";
import { passing, useScrub } from "./motion";

/**
 * One sentence of fact, read in word by word as it is scrolled to. The
 * words are all there from the start and only lighten, so nothing moves
 * and a screen reader gets the plain sentence. It finishes well before
 * the middle of the screen.
 */
export function Statement({ parts }: { parts: { text: string; strong?: boolean }[] }) {
  const ref = useScrub<HTMLParagraphElement>(
    (el, vh) => passing(el, vh, 0.88, 0.4),
    (p, el) => el.style.setProperty("--w", p.toFixed(4))
  );

  let i = 0;
  const words = parts.flatMap((part) =>
    part.text.split(" ").map((word) => ({ word, strong: part.strong, i: i++ }))
  );

  return (
    <p ref={ref} className="pl-statement" style={{ ["--n" as string]: words.length }}>
      {words.map((w) => (
        <Fragment key={w.i}>
          <span className={`pl-word ${w.strong ? "pl-word-strong" : ""}`} style={{ ["--i" as string]: w.i }}>
            {w.word}
          </span>{" "}
        </Fragment>
      ))}
    </p>
  );
}
