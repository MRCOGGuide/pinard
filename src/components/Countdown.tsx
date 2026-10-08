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
    <p className="font-ui text-[15px] text-ink/70">
      <span className="font-display text-[30px] font-semibold tabular-nums text-ink-strong">{days}</span>{" "}
      {days === 1 ? "day" : "days"} to {examLabel}
    </p>
  );
}
