/**
 * A progress bar whose colour flows rather than switching.
 *
 * The owner asked for the bars to grade from one colour to the next
 * instead of cutting from red to amber to green at fixed points. The
 * fill is one gradient laid along the whole track, red at the empty end
 * through amber to green at the pass mark and on to blue at 100%, so a
 * short bar shows only the reds and ambers and a full one reaches the
 * blue: the colour still says where a figure stands, it just gets there
 * smoothly.
 *
 * The gradient never moves. A cover in the track's own colour slides
 * off it to reveal as much as the figure earns, which keeps the
 * gradient anchored to the track and the motion transform-only.
 */

/*
  The stops hold each colour across its own band and blend only near
  the boundaries, so the bar is still red through the first third, amber
  up to the pass mark and green from 70%: the first version blended
  amber to green across the whole middle, and a bar a little past half
  already looked green.
*/
export const GRADE_GRADIENT =
  "linear-gradient(90deg, rgb(var(--c-accent)) 0%, rgb(var(--c-accent)) 26%, rgb(var(--c-warn)) 38%, rgb(var(--c-warn)) 63%, rgb(var(--c-good)) 72%, rgb(var(--c-good)) 88%, rgb(var(--c-blue)) 100%)";

export function GradeBar({
  percent,
  className = "h-1.5",
  /** Animate changes of `percent` (for pictures that replay) rather
   *  than only filling once when the bar first appears. */
  follow = false,
  delayMs = 0,
  label,
}: {
  percent: number;
  className?: string;
  follow?: boolean;
  /** Wait before following a change, to stagger a group of bars. */
  delayMs?: number;
  /** Read out in place of the bar; omit where a figure beside it says it. */
  label?: string;
}) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <span
      className={`relative block overflow-hidden rounded-full bg-sunk ${className}`}
      {...(label
        ? { role: "progressbar", "aria-label": label, "aria-valuenow": Math.round(p), "aria-valuemin": 0, "aria-valuemax": 100 }
        : { "aria-hidden": true })}
    >
      <span className="absolute inset-0" style={{ backgroundImage: GRADE_GRADIENT }} />
      <span
        className={`absolute inset-0 bg-sunk ${follow ? "transition-transform duration-[900ms] ease-out motion-reduce:transition-none" : "bar-uncover"}`}
        style={{ transform: `translateX(${p}%)`, transitionDelay: follow && delayMs ? `${delayMs}ms` : undefined }}
      />
    </span>
  );
}
