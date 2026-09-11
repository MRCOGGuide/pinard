/**
 * How much of a topic a candidate has actually worked through.
 *
 * This is COVERAGE, not accuracy — the share of a section's approved
 * questions they have answered at least once, whether they got them
 * right or not. It answers "how much of Antenatal care is left?", which
 * the 70% mastery trace on /progress deliberately does not: a candidate
 * can sit at 80% accuracy having seen a fifth of the topic.
 *
 * Red through amber to green as the section fills up, so an unstarted
 * topic is visible at a glance in a long list.
 */

const TRACK = "h-1.5 w-full overflow-hidden rounded-full bg-sunk";

/** Colour band by how much is covered. */
function bandColour(pct: number): string {
  if (pct >= 67) return "bg-good";
  if (pct >= 34) return "bg-warn";
  return "bg-accent";
}

export function CoverageBar({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  const pct = Math.min(100, Math.round((done / total) * 100));
  const left = Math.max(0, total - done);

  // Zero covered still draws the track, so the row lines up with its
  // neighbours and "nothing done here yet" reads as a state rather than
  // a missing element.
  return (
    <div className="mt-2.5">
      <div
        className={TRACK}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% of this topic covered`}
      >
        {pct > 0 && (
          <div
            className={`h-full rounded-full ${bandColour(pct)}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <p className="mt-1 font-mono text-[11px] text-ink/55">
        {done === 0
          ? "Not started"
          : left === 0
            ? "All covered"
            : `${pct}% covered · ${left} left`}
      </p>
    </div>
  );
}
