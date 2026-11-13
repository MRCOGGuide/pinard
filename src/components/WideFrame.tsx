import type { ReactNode } from "react";

/**
 * The public pages' frame: the width of the top bar, so a page's title
 * starts under the logo, as Pricing, How it works and the FAQ do.
 *
 * Try the questions sat in the narrow column the signed-in screens use,
 * centred, so on a wide screen its title stood some 180px to the right
 * of its neighbours' in the top bar, and moving between them carried the
 * title sideways and stretched the band (owner, 13 November 2026: "Try
 * the questions page sit on the middle and transition don't seem to
 * follow the rest"). `column` keeps a page of reading or of questions to
 * a readable width, set under the title rather than centred apart from
 * it.
 */
export function WideFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bleed">
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-8">{children}</div>
    </div>
  );
}

/** A readable column inside the wide frame, aligned with its title. */
export const COLUMN = "w-full max-w-[43rem]";
