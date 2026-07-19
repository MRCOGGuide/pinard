/**
 * Pinard brand mark, inlined from pinard-logo.svg so the wordmark
 * renders in the page's loaded webfonts (Newsreader / Albert Sans).
 * The original asset also lives at /public/pinard-logo.svg.
 *
 * variant "full"    — mark + wordmark + tagline (marketing surfaces)
 * variant "compact" — mark + wordmark only (app header)
 */
export function Logo({
  variant = "compact",
  className = "h-10 w-auto",
}: {
  variant?: "full" | "compact";
  className?: string;
}) {
  const mark = (
    <g id="mark">
      {/* listening arcs */}
      <g
        fill="none"
        stroke="#D64562"
        strokeWidth="3.2"
        strokeLinecap="round"
      >
        <path d="M56 36 A 20 20 0 0 1 84 36" />
        <path d="M49 26 A 30 30 0 0 1 91 26" opacity="0.72" />
        <path d="M42 16 A 40 40 0 0 1 98 16" opacity="0.44" />
      </g>
      {/* horn body */}
      <path
        d="M63.5 54 C63 74 48 90 44 108 L96 108 C92 90 77 74 76.5 54 Z"
        fill="#0F3D33"
      />
      {/* bell rim and opening */}
      <ellipse cx="70" cy="108" rx="27" ry="7.5" fill="#0F3D33" />
      <ellipse cx="70" cy="108" rx="18" ry="4.4" fill="#EDF3EE" />
      {/* earpiece */}
      <ellipse cx="70" cy="50" rx="16" ry="6" fill="#0F3D33" />
      <ellipse cx="70" cy="49.4" rx="4.2" ry="1.7" fill="#EDF3EE" />
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
