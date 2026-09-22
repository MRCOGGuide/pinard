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
 * Built as a button, in the same secondary style as "Skip question",
 * because as a quiet text link it was not read as a control at all —
 * the candidate still reached for the browser's back button. It keeps
 * its place above the card rather than joining the answer row, so that
 * leaving stays one deliberate step away from answering.
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
      className="mb-3 inline-flex items-center gap-2 rounded-card border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink/70 shadow-card hover:border-good hover:text-ink-strong"
    >
      <span aria-hidden>←</span>
      {label}
    </Link>
  );
}
