/**
 * The exam countdown, e.g. "94 days to Part 2" — data in Spline Sans Mono,
 * per the design system.
 */
export function Countdown({
  days,
  examLabel,
}: {
  days: number;
  examLabel: string;
}) {
  return (
    <p className="font-mono text-sm text-graphite/70">
      <span className="text-2xl font-medium text-heartbeat">{days}</span>{" "}
      {days === 1 ? "day" : "days"} to {examLabel}
    </p>
  );
}
