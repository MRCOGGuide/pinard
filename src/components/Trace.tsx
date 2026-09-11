/**
 * The trace — Pinard's signature CTG-style line motif.
 * A fine 1.5px line in the accent that draws in over 600ms, and runs
 * again when pointed at (see .trace-path and .trace-live in
 * globals.css; both respect prefers-reduced-motion).
 */
export function Trace({ className = "h-5 w-44" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 24"
      preserveAspectRatio="xMinYMid meet"
      className={`trace-live text-accent ${className}`}
      aria-hidden="true"
    >
      <path
        className="trace-path"
        pathLength={300}
        d="M0 17 H92 L100 17 L106 5 L113 22 L120 9 L127 17 H220"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * The trace, running — what Pinard shows while it is thinking.
 *
 * Three identical periods of the same CTG line, shifted by exactly one
 * so the loop is seamless, behind a mask that fades both ends. Without
 * the mask the line appears to be severed at the edges rather than
 * carrying on past them.
 *
 * Static under prefers-reduced-motion (see .trace-run in globals.css),
 * where it reads as the signature motif and says the same thing more
 * quietly.
 */
export function ThinkingTrace({
  label = "Thinking…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  // One period: baseline, a complex, baseline. Repeated at 0, 110, 220.
  const period = (x: number) =>
    `M${x} 17 H${x + 70} L${x + 76} 5 L${x + 83} 22 L${x + 90} 9 L${x + 97} 17 H${x + 110}`;

  return (
    <p
      className={`flex items-center gap-2.5 font-mono text-[11px] text-ink/50 ${className}`.trim()}
      // The wait is the state worth announcing; the drawing is decoration.
      role="status"
      aria-live="polite"
    >
      <svg
        viewBox="0 0 220 24"
        preserveAspectRatio="xMinYMid meet"
        className="h-4 w-28 shrink-0 text-accent"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="trace-fade" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="white" stopOpacity="0" />
            <stop offset="0.18" stopColor="white" stopOpacity="1" />
            <stop offset="0.82" stopColor="white" stopOpacity="1" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="trace-mask">
            <rect x="0" y="0" width="220" height="24" fill="url(#trace-fade)" />
          </mask>
        </defs>
        <g mask="url(#trace-mask)">
          <path
            className="trace-run"
            d={`${period(0)} ${period(110)} ${period(220)}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      {label}
    </p>
  );
}
