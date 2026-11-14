"use client";

import { Words } from "./Words";
import { passing, useScrub } from "./motion";

const QUESTION = "Previous caesarean, now 36 weeks. What are her chances of a successful VBAC?";
const ANSWER =
  "Overall success for planned VBAC is 72 to 75%. With at least one previous vaginal birth it rises to 85 to 90%, and a previous vaginal birth, particularly a previous VBAC, is the single best predictor.";

/**
 * Ask Pinard, on real glass: the only frosted surface in the page's
 * content, because this is the one place with something behind it to
 * frost, the arcs of the horn listening.
 *
 * The page this replaced typed it out on a timer, about fourteen seconds,
 * from the start every time it came back. Here the reader's scroll draws it:
 * every word is laid out from the start, so the box never changes size,
 * and nothing is ever left blank for someone who stops to read.
 *
 * Behind the glass, rings travel outward from where the question is
 * heard, the way sound spreads. They used to grow by a tenth over the
 * whole passage, which read as barely moving (owner, 14 November 2026:
 * "make the circle lines indicating the circle expansion more
 * apparent"). Now each ring is born small and bright, opens wide and
 * fades, and another is always following, so the scroll sends a train
 * of them outward and back again; stop, and they stop. Under reduced
 * motion they stand still at staggered sizes.
 */
const RINGS = 5;
/** How many times each ring travels outward over the picture's passage. */
const WAVES = 1.6;

export function AskPicture() {
  const ref = useScrub<HTMLDivElement>(
    (el, vh) => passing(el, vh, 0.84, 0.2),
    (p, el) => {
      el.style.setProperty("--p", p.toFixed(4));
      for (let k = 0; k < RINGS; k++) {
        el.style.setProperty(`--w${k}`, ((p * WAVES + k / RINGS) % 1).toFixed(4));
      }
    }
  );
  return (
    <div ref={ref} className="pl-ask pl-pic" aria-hidden="true">
      <div className="pl-arcs">
        {Array.from({ length: RINGS }, (_, k) => (
          <span key={k} />
        ))}
      </div>
      <div className="pl-glass">
        <p className="pl-small font-semibold !text-ink-strong">Ask Pinard</p>
        <p className="pl-ask-q">
          <Words text={QUESTION} over="--a" />
        </p>
        <p className="pl-ask-label">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z" fill="currentColor" />
          </svg>
          Pinard, answering from the guidance
        </p>
        <p className="reading mt-2 !text-[1.0625rem] !leading-[1.6] text-ink">
          <Words text={ANSWER} over="--b" />
        </p>
        <p className="pl-ask-source pl-small">
          <span className="font-semibold text-ink/80">Source.</span> Birth after Previous Caesarean
          Birth. RCOG Green-top Guideline No. 45, 2015
        </p>
      </div>
    </div>
  );
}
