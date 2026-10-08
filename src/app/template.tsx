/**
 * Wraps every page and, unlike the layout, is made afresh on each
 * navigation, so each page arrives with the same short entrance: a
 * fifth of a second of fade and a 4px rise (.page-enter in globals.css).
 * Enough to say "this is a new page", never enough to wait for, and
 * nothing under reduced motion. Transform and opacity only, so nothing
 * around it moves.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
