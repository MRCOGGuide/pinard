import {
  type Cystometrogram as Trace,
  abdominalAt,
  describe,
  detrusorAt,
  series,
  vesicalAt,
} from "@/lib/cystometrogram";

/**
 * A filling cystometrogram, drawn the way the clinic prints it.
 *
 * Three channels stacked in the order a report shows them — Pves, Pabd,
 * Pdet — against filling volume, with the annotations a trace actually
 * carries: Cg for each cough, FD, ND and SD for the sensations, and a
 * mark where urine was seen. The diagnosis lives in how those line up:
 * a leak on a cough with Pdet flat is urodynamic stress incontinence;
 * a leak on an unprovoked Pdet rise is detrusor overactivity.
 *
 * Drawn from the description rather than from an image, so it carries
 * the theme, scales to a phone, and reads aloud: the text under it is
 * the same trace in words, which is what a screen reader gets and what
 * a candidate reads if the figure fails to load.
 *
 * currentColor throughout, so the lines follow the ink colour in both
 * themes rather than being black on a dark card.
 */

const WIDTH = 640;
const CHANNEL_HEIGHT = 86;
const GAP = 14;
const LEFT = 54;
const RIGHT = 16;
const TOP = 10;

type ChannelKey = "pves" | "pabd" | "pdet";

const CHANNELS: { key: ChannelKey; label: string; ceiling: number }[] = [
  { key: "pves", label: "Pves", ceiling: 120 },
  { key: "pabd", label: "Pabd", ceiling: 120 },
  { key: "pdet", label: "Pdet", ceiling: 60 },
];

export function Cystometrogram({ trace }: { trace: Trace }) {
  const plotWidth = WIDTH - LEFT - RIGHT;
  const height = TOP + CHANNELS.length * (CHANNEL_HEIGHT + GAP) + 34;
  const x = (volume: number) => LEFT + (volume / trace.capacity) * plotWidth;
  const top = (index: number) => TOP + index * (CHANNEL_HEIGHT + GAP);
  const y = (index: number, pressure: number, ceiling: number) =>
    top(index) + CHANNEL_HEIGHT - Math.max(0, Math.min(1, pressure / ceiling)) * CHANNEL_HEIGHT;

  const path = (key: ChannelKey, index: number, ceiling: number) =>
    series(trace, key)
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${x(p.volume).toFixed(1)},${y(index, p.pressure, ceiling).toFixed(1)}`
      )
      .join(" ");

  const sensations = [
    { key: "FD", at: trace.sensations?.fd },
    { key: "ND", at: trace.sensations?.nd },
    { key: "SD", at: trace.sensations?.sd },
  ].filter((s): s is { key: string; at: number } => typeof s.at === "number");

  const pressureAt = (key: ChannelKey, volume: number) =>
    key === "pves"
      ? vesicalAt(trace, volume)
      : key === "pabd"
        ? abdominalAt(trace, volume)
        : detrusorAt(trace, volume);

  return (
    <figure className="mt-4">
      <figcaption className="font-ui text-[14px] font-semibold text-good">
        {trace.caption}
      </figcaption>
      <div className="mt-1.5 overflow-x-auto rounded-card border border-line bg-raised/70 p-3">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="h-auto w-full min-w-[460px] text-ink"
          role="img"
          aria-label={describe(trace)}
        >
          {CHANNELS.map((channel, index) => (
            <g key={channel.key}>
              {/* The channel's own box, so three lines do not read as one. */}
              <rect
                x={LEFT}
                y={top(index)}
                width={plotWidth}
                height={CHANNEL_HEIGHT}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.14}
              />
              <text
                x={LEFT - 8}
                y={top(index) + CHANNEL_HEIGHT / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="currentColor"
                fillOpacity={0.65}
                fontFamily="ui-monospace, monospace"
              >
                {channel.label}
              </text>
              <text
                x={LEFT - 8}
                y={top(index) + 10}
                textAnchor="end"
                fontSize={8}
                fill="currentColor"
                fillOpacity={0.4}
                fontFamily="ui-monospace, monospace"
              >
                {channel.ceiling}
              </text>

              {/* A cough shows on every channel; mark where it was. */}
              {trace.coughs.map((cough) => (
                <line
                  key={`${channel.key}-cough-${cough}`}
                  x1={x(cough)}
                  x2={x(cough)}
                  y1={top(index)}
                  y2={top(index) + CHANNEL_HEIGHT}
                  stroke="currentColor"
                  strokeOpacity={0.12}
                  strokeDasharray="2 3"
                />
              ))}

              <path
                d={path(channel.key, index, channel.ceiling)}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeOpacity={channel.key === "pdet" ? 1 : 0.75}
                strokeLinejoin="round"
              />

              {/* Where she leaked, on the channel that explains it. */}
              {(trace.leaks ?? []).map((leak) =>
                (leak.during === "cough" && channel.key === "pabd") ||
                (leak.during === "contraction" && channel.key === "pdet") ? (
                  <g key={`${channel.key}-leak-${leak.at}`}>
                    <circle
                      cx={x(leak.at)}
                      cy={y(index, pressureAt(channel.key, leak.at), channel.ceiling)}
                      r={4}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                    />
                    <text
                      x={x(leak.at)}
                      y={y(index, pressureAt(channel.key, leak.at), channel.ceiling) - 8}
                      textAnchor="middle"
                      fontSize={9}
                      fill="currentColor"
                      fontFamily="ui-monospace, monospace"
                    >
                      leak
                    </text>
                  </g>
                ) : null
              )}
            </g>
          ))}

          {/* The annotations run along the bottom, as on a report. */}
          {trace.coughs.map((cough) => (
            <text
              key={`cg-${cough}`}
              x={x(cough)}
              y={top(CHANNELS.length - 1) + CHANNEL_HEIGHT + 12}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.55}
              fontFamily="ui-monospace, monospace"
            >
              Cg
            </text>
          ))}
          {sensations.map((s) => (
            <text
              key={s.key}
              x={x(s.at)}
              y={top(CHANNELS.length - 1) + CHANNEL_HEIGHT + 24}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.75}
              fontFamily="ui-monospace, monospace"
            >
              {s.key}
            </text>
          ))}
          <text
            x={x(trace.capacity)}
            y={top(CHANNELS.length - 1) + CHANNEL_HEIGHT + 24}
            textAnchor="end"
            fontSize={9}
            fill="currentColor"
            fillOpacity={0.75}
            fontFamily="ui-monospace, monospace"
          >
            MCC
          </text>
          <text
            x={LEFT}
            y={top(CHANNELS.length - 1) + CHANNEL_HEIGHT + 24}
            textAnchor="start"
            fontSize={9}
            fill="currentColor"
            fillOpacity={0.45}
            fontFamily="ui-monospace, monospace"
          >
            filling volume →
          </text>
        </svg>
      </div>
      <p className="mt-1.5 text-xs text-ink/65">
        Cg = cough; FD/ND/SD = first, normal and strong desire to void; MCC =
        maximum cystometric capacity. Pressures in cmH<sub>2</sub>O.
      </p>
    </figure>
  );
}
