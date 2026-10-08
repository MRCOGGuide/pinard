import { PASS_THRESHOLD, readinessBand } from "@/lib/performance";
import { Explain } from "@/components/Explain";
import { NONE } from "@/components/ui";
import { CoverageBar } from "@/components/CoverageBar";

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
  seen,
  available,
  covered = true,
}: {
  title: string;
  series: number[]; // cumulative accuracy over time, 0–100
  accuracy: number;
  attempts: number;
  /**
   * How much of the topic has been seen: questions answered at least
   * once, out of what the bank holds.
   *
   * Accuracy alone cannot answer "how am I doing here". A candidate at
   * 80% over five questions of a hundred knows almost nothing about
   * the topic and the trace says they are secure. Omitted where the
   * caller has not counted it, and the bar is then not drawn.
   */
  seen?: number;
  available?: number;
  /**
   * False when the bank holds no approved questions for this topic yet.
   * Untouched and unwritten both show no trace, and a candidate reading
   * a blank card deserves to know which of the two it is — one is work
   * they have not done, the other is work we have not done.
   */
  covered?: boolean;
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

  // The site's one colour rule: red in the first third, amber to 70%,
  // green from there.
  const tone = { red: "text-accent-ink", amber: "text-warn", green: "text-good" }[
    readinessBand(accuracy)
  ];

  return (
    <div
      className={`rounded-card border border-line bg-surface p-4 shadow-card ${
        covered ? "" : "opacity-70"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-ui text-[15px] font-semibold leading-snug text-ink-strong">
          {title}
          <Explain label={title}>
            {covered
              ? `The line is your accuracy in this topic over time. The dashed rule across it is ${PASS_THRESHOLD}%, the mark the exam asks for, so a line above it is a topic secured.`
              : "No questions written for this topic yet, so there is nothing to practise and nothing to plot. It is not a gap in your revision."}
          </Explain>
        </h3>
        <span
          className={`font-ui text-[15px] font-semibold tabular-nums ${attempts > 0 ? tone : "text-ink/65"}`}
        >
          {attempts > 0 ? `${accuracy}%` : NONE}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 h-16 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}: ${
          !covered
            ? "no questions yet"
            : attempts > 0
              ? `${accuracy}% accuracy`
              : "not started"
        }, pass threshold 70%`}
      >
        {/* 70% pass-threshold rule */}
        <line
          x1={pad}
          y1={thresholdY}
          x2={W - pad}
          y2={thresholdY}
          className="stroke-good"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
        {/* the trace */}
        {attempts > 0 && (
          <path
            className="trace-path stroke-accent"
            pathLength={300}
            d={d}
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* The caption under every card said the same sentence about the
          same dashed rule, once per topic, thirty-five times down the
          page. It is on the (i) now. */}
      {covered && typeof seen === "number" && typeof available === "number" &&
        available > 0 && (
          <p className="mt-1 text-right font-mono text-micro text-ink/65">
            {seen}/{available} seen
          </p>
        )}
      {covered && typeof seen === "number" && typeof available === "number" &&
        available > 0 && <CoverageBar done={seen} total={available} />}
    </div>
  );
}
