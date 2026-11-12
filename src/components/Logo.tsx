/*
  The horn's outline, as the landing page draws it (landing/horn-gl.ts),
  stood upright and seen from a little below so the bell opens toward
  the reader. Printed by scripts/logo-from-horn.mjs: run that again and
  paste what it prints if the horn's outline ever changes, so the mark
  and the object stay one shape.
*/
const BODY =
  "M49.96 109.14 L50.69 108.42 51.75 107.31 52.9 105.97 54.07 104.46 55.2 102.81 56.27 101.05 57.27 99.18 58.2 97.21 59.05 95.15 59.83 93.01 60.54 90.79 61.2 88.51 61.8 86.15 62.35 83.73 62.84 81.25 63.3 78.71 63.7 76.12 64.06 73.47 64.37 70.77 64.64 68.02 64.86 65.22 65.03 62.37 65.16 59.48 65.25 56.54 65.29 53.56 65.3 50.54 65.22 48.74 64.93 47.29 64.32 46.14 63.3 45.28 61.77 44.65 59.64 44.23 L80.36 44.23 78.23 44.65 76.7 45.28 75.68 46.14 75.07 47.29 74.78 48.74 74.7 50.54 74.71 53.56 74.75 56.54 74.84 59.48 74.97 62.37 75.14 65.22 75.36 68.02 75.63 70.77 75.94 73.47 76.3 76.12 76.7 78.71 77.16 81.25 77.65 83.73 78.2 86.15 78.8 88.51 79.46 90.79 80.17 93.01 80.95 95.15 81.8 97.21 82.73 99.18 83.73 101.05 84.8 102.81 85.93 104.46 87.1 105.97 88.25 107.31 89.31 108.42 90.04 109.14 A20.04 6.86 0 0 1 49.96 109.14 Z";
const LIGHT =
  "M52.76 109.14 L53.39 108.42 54.3 107.31 55.3 105.97 56.3 104.46 57.27 102.81 58.19 101.05 59.05 99.18 59.85 97.21 60.58 95.15 61.25 93.01 61.87 90.79 62.43 88.51 62.95 86.15 63.42 83.73 63.85 81.25 64.23 78.71 64.58 76.12 64.89 73.47 65.16 70.77 65.39 68.02 65.58 65.22 65.73 62.37 65.84 59.48 65.91 56.54 65.95 53.56 65.96 50.54 65.89 48.74 65.64 47.29 65.11 46.14 64.23 45.28 62.92 44.65 61.09 44.23 L64.82 44.23 65.88 44.65 66.65 45.28 67.16 46.14 67.46 47.29 67.61 48.74 67.65 50.54 67.65 53.56 67.62 56.54 67.58 59.48 67.52 62.37 67.43 65.22 67.32 68.02 67.19 70.77 67.03 73.47 66.85 76.12 66.65 78.71 66.42 81.25 66.17 83.73 65.9 86.15 65.6 88.51 65.27 90.79 64.91 93.01 64.52 95.15 64.1 97.21 63.63 99.18 63.13 101.05 62.6 102.81 62.03 104.46 61.45 105.97 60.87 107.31 60.35 108.42 59.98 109.14 Z";
const ROSE =
  "M86.44 109.14 L85.83 108.42 84.97 107.31 84.02 105.97 83.07 104.46 82.14 102.81 81.26 101.05 80.44 99.18 79.68 97.21 78.98 95.15 78.34 93.01 77.75 90.79 77.22 88.51 76.72 86.15 76.28 83.73 75.87 81.25 75.5 78.71 75.17 76.12 74.87 73.47 74.62 70.77 74.4 68.02 74.22 65.22 74.07 62.37 73.97 59.48 73.9 56.54 73.86 53.56 73.85 50.54 73.92 48.74 74.16 47.29 74.66 46.14 75.5 45.28 76.75 44.65 78.5 44.23 L80.36 44.23 78.23 44.65 76.7 45.28 75.68 46.14 75.07 47.29 74.78 48.74 74.7 50.54 74.71 53.56 74.75 56.54 74.84 59.48 74.97 62.37 75.14 65.22 75.36 68.02 75.63 70.77 75.94 73.47 76.3 76.12 76.7 78.71 77.16 81.25 77.65 83.73 78.2 86.15 78.8 88.51 79.46 90.79 80.17 93.01 80.95 95.15 81.8 97.21 82.73 99.18 83.73 101.05 84.8 102.81 85.93 104.46 87.1 105.97 88.25 107.31 89.31 108.42 90.04 109.14 Z";
const PLATE_EDGE = "M54.34 41.66 A15.66 5.36 0 0 1 85.66 41.66 L85.66 43.94 A15.66 5.36 0 0 0 54.34 43.94 Z";

/**
 * Pinard brand mark, inlined so the wordmark renders in the page's
 * loaded webfonts. A flat version also lives at /public/pinard-logo.svg.
 *
 * variant "full"    — mark + wordmark + tagline (marketing surfaces)
 * variant "compact" — mark + wordmark only (app header)
 * variant "mark"    — the horn alone, no words, for places where the
 *                     name is already on the page
 *
 * Redrawn on 12 November 2026 from the horn the landing page opens on,
 * at the owner's request: the earlier mark was a drawing of its own,
 * squatter than a real Pinard, and beside the object it looked like a
 * different instrument. This one has the object's proportions and its
 * finish: a light down the near side of the cone, the rose light along
 * the far edge, and the two rims cut bright.
 *
 * And it listens. The arcs pulse outward on a 2.4s cycle, the way a
 * heartbeat arrives through the horn: found, then heard, then gone.
 * Frozen at rest under prefers-reduced-motion (see globals.css).
 */
export function Logo({
  variant = "compact",
  className = "h-10 w-auto",
  animated = true,
}: {
  variant?: "full" | "compact" | "mark";
  className?: string;
  /** The pulse. Off where a moving logo would distract — print, email. */
  animated?: boolean;
}) {
  const defs = (
    <defs>
      {/* The cone: its edge, the light down the near side, the long dark
          turn away from it. */}
      <linearGradient id="pinard-horn" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--logo-horn-2)" />
        <stop offset="24%" stopColor="var(--logo-horn-1)" />
        <stop offset="56%" stopColor="var(--logo-horn-2)" />
        <stop offset="100%" stopColor="var(--logo-horn-3)" />
      </linearGradient>
      {/* The two cut rims catch the most light. */}
      <linearGradient id="pinard-rim" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--logo-lit-rim)" />
        <stop offset="40%" stopColor="var(--logo-rim-1)" />
        <stop offset="100%" stopColor="var(--logo-rim-3)" />
      </linearGradient>
      {/* The bore: an opening, so it darkens inward rather than filling. */}
      <radialGradient id="pinard-bore" cx="0.4" cy="0.25" r="0.9">
        <stop offset="0%" stopColor="var(--logo-bore-1)" />
        <stop offset="55%" stopColor="var(--logo-bore-2)" />
        <stop offset="100%" stopColor="var(--logo-bore-3)" />
      </radialGradient>
      <linearGradient id="pinard-ear" x1="0" y1="0" x2="1" y2="0.4">
        <stop offset="0%" stopColor="var(--logo-ear-1)" />
        <stop offset="100%" stopColor="var(--logo-ear-2)" />
      </linearGradient>
    </defs>
  );

  const pulse = animated ? "logo-arc" : "";

  const mark = (
    <g id="mark">
      {/* Listening arcs: the sound arriving. */}
      <g fill="none" className="stroke-accent" strokeWidth="3" strokeLinecap="round">
        <path
          className={pulse}
          style={{ animationDelay: "0ms", "--arc-o": 1 } as React.CSSProperties}
          d="M59.5 29.8 A15 15 0 0 1 80.5 29.8"
        />
        <path
          className={pulse}
          style={{ animationDelay: "160ms", "--arc-o": 0.72 } as React.CSSProperties}
          opacity="0.72"
          d="M53.9 21.8 A23 23 0 0 1 86.1 21.8"
        />
        <path
          className={pulse}
          style={{ animationDelay: "320ms", "--arc-o": 0.44 } as React.CSSProperties}
          opacity="0.44"
          d="M48.3 13.8 A31 31 0 0 1 91.7 13.8"
        />
      </g>

      {/* The ear plate from beneath, and the near edge of it above. */}
      <ellipse cx="70" cy="43.94" rx="15.66" ry="5.36" fill="url(#pinard-ear)" />
      <path d={PLATE_EDGE} fill="url(#pinard-rim)" />

      {/* The cone, the light down its near side and the rose along its far edge. */}
      <path d={BODY} fill="url(#pinard-horn)" />
      <path d={LIGHT} fill="var(--logo-spec)" opacity="0.2" />
      <path d={ROSE} className="fill-accent" opacity="0.42" />

      {/* The bell: its cut rim, and the bore it opens into. */}
      <ellipse cx="70" cy="109.14" rx="20.04" ry="6.86" fill="url(#pinard-rim)" />
      <ellipse cx="70" cy="109.39" rx="17.24" ry="5.48" fill="url(#pinard-bore)" />
    </g>
  );

  if (variant === "mark") {
    return (
      <svg
        // The outermost arc peaks at y=4.6 and its 3.2 stroke reaches
        // 3.0, so a box starting at 6 cut the top wave in half — and the
        // listening pulse, which scales each arc 1.06 from its base,
        // pushed it further out still. Starts at 0 now.
        viewBox="36 0 68 120"
        width={40}
        height={67}
        className={`pinard-mark ${className}`.trim()}
        role="img"
        aria-label="Pinard"
      >
        {defs}
        {mark}
      </svg>
    );
  }

  if (variant === "compact") {
    return (
      <svg
        viewBox="30 0 305 122"
        width={90}
        height={36}
        className={`pinard-mark ${className}`.trim()}
        role="img"
        aria-label="Pinard"
      >
        {defs}
        {mark}
        <text
          x="138"
          y="96"
          fill="rgb(var(--c-ink-strong))"
          fontFamily="var(--font-sans), system-ui, sans-serif"
          fontSize="56"
          fontWeight="600"
          letterSpacing="-1.2"
        >
          Pinard
        </text>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 520 160"
      width={195}
      height={60}
      className={`pinard-mark ${className}`.trim()}
      role="img"
      aria-label="Pinard: intelligent MRCOG revision"
    >
      {defs}
      {mark}
      <text
        x="138"
        y="96"
        fill="rgb(var(--c-ink-strong))"
        fontFamily="var(--font-sans), system-ui, sans-serif"
        fontSize="56"
        fontWeight="600"
        letterSpacing="-1.2"
      >
        Pinard
      </text>
      <text
        x="141"
        y="124"
        fill="rgb(var(--c-good))"
        fontFamily="var(--font-mono), ui-monospace, monospace"
        fontSize="13"
        fontWeight="600"
        letterSpacing="3.2"
      >
        INTELLIGENT MRCOG REVISION
      </text>
    </svg>
  );
}
