/**
 * Pinard brand mark, inlined from pinard-logo.svg so the wordmark
 * renders in the page's loaded webfonts (Newsreader / Albert Sans).
 * The original asset also lives at /public/pinard-logo.svg.
 *
 * variant "full"    — mark + wordmark + tagline (marketing surfaces)
 * variant "compact" — mark + wordmark only (app header)
 *
 * The horn is lit rather than merely drawn: a real Pinard stethoscope is
 * a turned cone of wood or aluminium, so it takes a light from the upper
 * left, keeps a highlight down its near edge, and its bell opens into a
 * bore that darkens toward the centre. Three stops per gradient, no
 * finer detail — the mark has to survive being 36px tall in the header.
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
  variant?: "full" | "compact";
  className?: string;
  /** The pulse. Off where a moving logo would distract — print, email. */
  animated?: boolean;
}) {
  const defs = (
    <defs>
      {/* The cone, lit from the upper left. */}
      <linearGradient id="pinard-horn" x1="0" y1="0" x2="1" y2="0.15">
        <stop offset="0%" stopColor="#2A5F51" />
        <stop offset="38%" stopColor="#0F3D33" />
        <stop offset="100%" stopColor="#07231D" />
      </linearGradient>
      {/* The rim catches the most light, being nearest the viewer. */}
      <linearGradient id="pinard-rim" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#356B5C" />
        <stop offset="45%" stopColor="#0F3D33" />
        <stop offset="100%" stopColor="#061F1A" />
      </linearGradient>
      {/* The bore: an opening, so it darkens inward rather than filling. */}
      <radialGradient id="pinard-bore" cx="0.42" cy="0.3" r="0.9">
        <stop offset="0%" stopColor="#17453A" />
        <stop offset="55%" stopColor="#0B2A23" />
        <stop offset="100%" stopColor="#061C17" />
      </radialGradient>
      <linearGradient id="pinard-ear" x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stopColor="#357061" />
        <stop offset="100%" stopColor="#0C332B" />
      </linearGradient>
    </defs>
  );

  const pulse = animated ? "logo-arc" : "";

  const mark = (
    <g id="mark">
      {/* Listening arcs — the sound arriving. */}
      <g fill="none" stroke="#D64562" strokeWidth="3.2" strokeLinecap="round">
        <path
          className={pulse}
          style={{ animationDelay: "0ms", "--arc-o": 1 } as React.CSSProperties}
          d="M56 36 A 20 20 0 0 1 84 36"
        />
        <path
          className={pulse}
          style={{ animationDelay: "160ms", "--arc-o": 0.72 } as React.CSSProperties}
          opacity="0.72"
          d="M49 26 A 30 30 0 0 1 91 26"
        />
        <path
          className={pulse}
          style={{ animationDelay: "320ms", "--arc-o": 0.44 } as React.CSSProperties}
          opacity="0.44"
          d="M42 16 A 40 40 0 0 1 98 16"
        />
      </g>

      {/* Contact shadow, so the bell sits on the page rather than floating. */}
      <ellipse cx="70" cy="112.5" rx="25" ry="3.6" fill="#0F3D33" opacity="0.13" />

      {/* Horn body */}
      <path
        d="M63.5 54 C63 74 48 90 44 108 L96 108 C92 90 77 74 76.5 54 Z"
        fill="url(#pinard-horn)"
      />
      {/* Specular highlight down the near edge of the cone. */}
      <path
        d="M64.8 55 C64.3 74.5 51.5 90 48.2 106.5 L54.6 106.5 C57.4 90 68.2 74.5 68.6 55 Z"
        fill="#EDF3EE"
        opacity="0.17"
      />

      {/* Bell rim, then the bore it opens into. */}
      <ellipse cx="70" cy="108" rx="27" ry="7.5" fill="url(#pinard-rim)" />
      <ellipse cx="70" cy="108.4" rx="18" ry="4.4" fill="url(#pinard-bore)" />
      {/* A thin lit edge along the top of the rim. */}
      <path
        d="M45.5 105.6 A 27 7.5 0 0 1 94.5 105.6"
        fill="none"
        stroke="#4E8A78"
        strokeWidth="1.1"
        opacity="0.55"
      />

      {/* Earpiece */}
      <ellipse cx="70" cy="50" rx="16" ry="6" fill="url(#pinard-ear)" />
      <ellipse cx="70" cy="49.4" rx="4.2" ry="1.7" fill="#051713" />
      <path
        d="M56.5 47.6 A 16 6 0 0 1 83.5 47.6"
        fill="none"
        stroke="#5A9483"
        strokeWidth="1"
        opacity="0.5"
      />
    </g>
  );

  if (variant === "compact") {
    return (
      <svg
        viewBox="30 0 305 122"
        width={90}
        height={36}
        className={className}
        role="img"
        aria-label="Pinard"
      >
        {defs}
        {mark}
        <text
          x="138"
          y="96"
          fill="#0F3D33"
          fontFamily="var(--font-newsreader), Georgia, serif"
          fontSize="58"
          fontWeight="600"
          letterSpacing="0.5"
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
      className={className}
      role="img"
      aria-label="Pinard — intelligent MRCOG revision"
    >
      {defs}
      {mark}
      <text
        x="138"
        y="96"
        fill="#0F3D33"
        fontFamily="var(--font-newsreader), Georgia, serif"
        fontSize="58"
        fontWeight="600"
        letterSpacing="0.5"
      >
        Pinard
      </text>
      <text
        x="141"
        y="124"
        fill="#2F6D5B"
        fontFamily="var(--font-albert-sans), 'Helvetica Neue', Arial, sans-serif"
        fontSize="13"
        fontWeight="600"
        letterSpacing="3.2"
      >
        INTELLIGENT MRCOG REVISION
      </text>
    </svg>
  );
}
