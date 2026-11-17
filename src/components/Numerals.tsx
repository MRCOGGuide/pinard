import type { ReactNode } from "react";

/**
 * A line of text with its numbers set in the figures' face, Nunito
 * (owner, 17 November 2026, of the plan's weeks: "make sure the numbers
 * is in the new font"). The words keep the line's own face; each run of
 * digits ("17", "1,240", "2.5") takes .tabular-nums, which globals.css
 * sets in Nunito. Anything but a string is passed through as it is.
 */
export function Numerals({ children }: { children: ReactNode }) {
  if (typeof children !== "string") return <>{children}</>;
  const parts = children.split(/(\d+(?:[.,]\d+)*)/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="tabular-nums">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
