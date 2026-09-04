/**
 * Small figures for the "why not a textbook" cards.
 *
 * Drawn rather than photographed, and drawn from the product's own
 * vocabulary — a guideline being replaced, a claim tied to its passage,
 * an approval, a topic climbing toward the pass mark. A stock
 * photograph of a clinician holding a tablet would say nothing that the
 * heading does not, and would say it in someone else's voice.
 *
 * Each responds to a hover on its card (see .fig-* rules in
 * globals.css), so the picture demonstrates the point rather than
 * decorating it. Pure CSS: no JavaScript, and still under
 * prefers-reduced-motion.
 */

const BOX = "h-20 w-full";

/** A newer edition arriving on top of an older one. */
export function FigureCurrent() {
  return (
    <svg viewBox="0 0 120 64" className={BOX} aria-hidden="true">
      {/* older editions, settling back */}
      <rect x="26" y="26" width="52" height="30" rx="3" fill="#DCE5DF" />
      <rect x="32" y="20" width="52" height="32" rx="3" fill="#C3D5C9" />
      {/* the current one, which lifts on hover */}
      <g className="fig-sheet">
        <rect
          x="38"
          y="12"
          width="52"
          height="36"
          rx="3"
          fill="#FDFDFB"
          stroke="#2F6D5B"
          strokeWidth="1.4"
        />
        <rect x="44" y="20" width="30" height="2.4" rx="1.2" fill="#2F6D5B" />
        <rect x="44" y="26" width="38" height="2.4" rx="1.2" fill="#DCE5DF" />
        <rect x="44" y="32" width="34" height="2.4" rx="1.2" fill="#DCE5DF" />
        <rect x="44" y="38" width="22" height="2.4" rx="1.2" fill="#DCE5DF" />
      </g>
    </svg>
  );
}

/** A claim, and the passage it is tied to. */
export function FigureTraceable() {
  return (
    <svg viewBox="0 0 120 64" className={BOX} aria-hidden="true">
      <rect x="14" y="10" width="44" height="2.6" rx="1.3" fill="#DCE5DF" />
      <rect x="14" y="17" width="52" height="2.6" rx="1.3" fill="#DCE5DF" />
      {/* the cited line */}
      <rect x="14" y="24" width="36" height="2.6" rx="1.3" fill="#0F3D33" />
      <rect x="14" y="31" width="48" height="2.6" rx="1.3" fill="#DCE5DF" />

      {/* the tie to its source, which draws on hover */}
      <path
        className="fig-link"
        d="M52 25.3 C70 25.3 74 40 88 44"
        fill="none"
        stroke="#D64562"
        strokeWidth="1.5"
        strokeLinecap="round"
        pathLength={100}
      />
      <g className="fig-chip">
        <rect
          x="72"
          y="40"
          width="36"
          height="14"
          rx="7"
          fill="#FDFDFB"
          stroke="#2F6D5B"
          strokeWidth="1.2"
        />
        <rect x="78" y="46" width="24" height="2.2" rx="1.1" fill="#2F6D5B" />
      </g>
    </svg>
  );
}

/** An approval: the tick a reviewer leaves. */
export function FigureReviewed() {
  return (
    <svg viewBox="0 0 120 64" className={BOX} aria-hidden="true">
      <rect
        x="30"
        y="10"
        width="60"
        height="44"
        rx="4"
        fill="#FDFDFB"
        stroke="#DCE5DF"
        strokeWidth="1.4"
      />
      <rect x="38" y="20" width="30" height="2.4" rx="1.2" fill="#DCE5DF" />
      <rect x="38" y="27" width="40" height="2.4" rx="1.2" fill="#DCE5DF" />
      <path
        className="fig-tick"
        d="M42 40 L52 48 L78 24"
        fill="none"
        stroke="#2F6D5B"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
      />
    </svg>
  );
}

/** A weak topic climbing toward the 70% line — the trace, in miniature. */
export function FigureAimed() {
  return (
    <svg viewBox="0 0 120 64" className={BOX} aria-hidden="true">
      {/* the pass threshold */}
      <line
        x1="10"
        y1="22"
        x2="110"
        y2="22"
        stroke="#2F6D5B"
        strokeWidth="1.2"
        strokeDasharray="4 4"
        opacity="0.7"
      />
      <text
        x="10"
        y="17"
        fill="#2F6D5B"
        fontSize="7"
        fontFamily="var(--font-mono), monospace"
      >
        70
      </text>
      <path
        className="fig-climb"
        d="M12 52 L34 46 L52 44 L70 33 L88 26 L108 18"
        fill="none"
        stroke="#D64562"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
      />
      <circle className="fig-head" cx="108" cy="18" r="2.8" fill="#D64562" />
    </svg>
  );
}
