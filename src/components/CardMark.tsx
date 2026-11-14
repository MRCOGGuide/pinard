/**
 * The small emblem a Today card opens with, in the manner of a well-made
 * app icon: a tile of the stage's dark green, with its pool of light,
 * and a drawing in fine lines (.card-mark in globals.css).
 *
 * Asked for by the owner, 14 November 2026: marks for Today's session
 * and the diagnostic, "expensive, elegant yet professional and clean".
 * Sized to sit beside the card's heading, not to compete with it.
 *
 *   session     a stopwatch: the day's set of questions;
 *   diagnostic  a radar sweep: the card's own words, "a fresh sweep",
 *               with two topics found.
 *
 * Under a resting mouse the card's mark moves (the hand goes round, the
 * sweep turns); otherwise it is still, and always under reduced motion.
 * Decorative: the heading beside it says what the card is.
 */
export function CardMark({ kind }: { kind: "session" | "diagnostic" }) {
  return (
    <span className={`card-mark card-mark-${kind}`} aria-hidden="true">
      {kind === "session" ? <Stopwatch /> : <Sweep />}
    </span>
  );
}

function Stopwatch() {
  return (
    <svg viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* Crown and side pusher. */}
      <path d="M21.5 9.5h5" stroke="currentColor" strokeWidth="2" />
      <path d="M24 9.5v3.6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M33.6 15.2l1.9-1.9" stroke="currentColor" strokeWidth="1.8" />
      {/* Case. */}
      <circle cx="24" cy="26.5" r="12.6" stroke="currentColor" strokeWidth="1.8" />
      {/* The quarter run so far, in the heartbeat's rose. */}
      <path d="M24 16.4a10.1 10.1 0 0 1 10.1 10.1" stroke="rgb(246 132 158)" strokeWidth="2.2" />
      {/* Hour marks. */}
      <path d="M24 16.6v1.6M34 26.5h-1.6M24 36.4v-1.6M14 26.5h1.6" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
      {/* The hand, which goes round under a resting mouse. */}
      <g className="card-mark-hand">
        <path d="M24 26.5l5.6-5.6" stroke="rgb(246 132 158)" strokeWidth="2" />
      </g>
      <circle cx="24" cy="26.5" r="1.7" fill="currentColor" />
    </svg>
  );
}

function Sweep() {
  return (
    <svg viewBox="0 0 48 48" fill="none" strokeLinecap="round">
      <defs>
        <linearGradient id="card-sweep-fill" x1="24" y1="11" x2="35" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="rgb(246 132 158)" stopOpacity="0" />
          <stop offset="1" stopColor="rgb(246 132 158)" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="13.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="24" cy="24" r="7.6" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      <path d="M24 12.6v22.8M12.6 24h22.8" stroke="currentColor" strokeWidth="1" opacity="0.28" />
      {/* The sweep, which turns under a resting mouse. */}
      <g className="card-mark-sweep">
        <path d="M24 24V10.8a13.2 13.2 0 0 1 11.43 6.6z" fill="url(#card-sweep-fill)" />
        <path d="M24 24l11.43-6.6" stroke="rgb(246 132 158)" strokeWidth="1.8" />
      </g>
      {/* Two topics found. */}
      <circle cx="30.6" cy="28.4" r="1.7" fill="rgb(150 226 200)" />
      <circle cx="17.6" cy="19.4" r="1.3" fill="rgb(150 226 200)" opacity="0.8" />
      <circle cx="24" cy="24" r="1.5" fill="currentColor" />
    </svg>
  );
}
