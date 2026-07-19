/**
 * The trace — Pinard's signature CTG-style line motif.
 * A fine 1.5px line in heartbeat that draws in over 600ms
 * (see .trace-path in globals.css; respects prefers-reduced-motion).
 */
export function Trace({ className = "h-5 w-44" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 24"
      preserveAspectRatio="xMinYMid meet"
      className={`text-heartbeat ${className}`}
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
