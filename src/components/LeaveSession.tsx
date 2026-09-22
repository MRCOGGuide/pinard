import Link from "next/link";

/**
 * The way out of a run.
 *
 * A session filled the screen with no exit on it: the only way back to
 * the topic list was the browser's own back button, which is not
 * somewhere a candidate should have to look for a control the product
 * ought to provide. Leaving costs nothing — every answer is recorded as
 * it is given, so a half-finished run is just a run with fewer answers
 * in it, and the topic can be picked up again later.
 *
 * Quiet on purpose. It sits above the card rather than beside the
 * answer buttons, where it would compete with the thing the screen is
 * for.
 */
export function LeaveSession({
  href,
  label,
}: {
  href: string;
  /** Where it goes, named — "topics", "Today" — not just "Back". */
  label: string;
}) {
  return (
    <Link
      href={href}
      className="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-ink/55 hover:text-ink-strong"
    >
      <span aria-hidden>←</span>
      {label}
    </Link>
  );
}
