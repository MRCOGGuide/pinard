import { PASS_THRESHOLD } from "@/lib/performance";

/**
 * The signature "trace": a per-topic progress line drawn toward the 70%
 * pass threshold (a dashed greentop rule). Draws in over 600ms on load
 * (respects prefers-reduced-motion via .trace-path).
 */
export function TopicTrace({
  title,
  series,
  accuracy,
  attempts,
}: {
  title: string;
  series: number[]; // cumulative accuracy over time, 0–100
  accuracy: number;
  attempts: number;
}) {
  const W = 300;
  const H = 64;
  const pad = 4;
  const yFor = (v: number) => H - pad - (v / 100) * (H - pad * 2);
  const thresholdY = yFor(PASS_THRESHOLD);

  // Build the trace path. With <2 points, draw a short flat line at the level.
  const pts = series.length >= 2 ? series : [accuracy, accuracy];
  const step = pts.length > 1 ? (W - pad * 2) / (pts.length - 1) : 0;
  const d = pts
    .map((v, i) => `${i === 0 ? "M" : "L"} ${pad + i * step} ${yFor(v)}`)
    .join(" ");

  const secured = accuracy >= PASS_THRESHOLD;

  return (
    <div className="rounded-card border border-hairline bg-porcelain p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-theatre">
          {title}
        </h3>
        <span
          className={`font-mono text-sm ${secured ? "text-greentop" : "text-heartbeat"}`}
        >
          {attempts > 0 ? `${accuracy}%` : "—"}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 h-16 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}: ${attempts > 0 ? `${accuracy}% accuracy` : "not started"}, pass threshold 70%`}
      >
        {/* 70% pass-threshold rule */}
        <line
          x1={pad}
          y1={thresholdY}
          x2={W - pad}
          y2={thresholdY}
          stroke="#2F6D5B"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
        {/* the trace */}
        {attempts > 0 && (
          <path
            className="trace-path"
            pathLength={300}
            d={d}
            fill="none"
            stroke="#D64562"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <p className="mt-1 font-mono text-[10px] text-greentop/80">
        70 — pass threshold
      </p>
    </div>
  );
}
