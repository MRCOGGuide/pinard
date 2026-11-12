import type { ReactNode } from "react";
import { Trace } from "@/components/Trace";
import { Explain } from "@/components/Explain";

/**
 * The head of every screen: its title on a dark band that runs up under
 * the top bar, so the bar and the band read as one surface, the way the
 * landing page's stage does. It is what ties a signed-in screen to the
 * front door: the same dark green, the same light display type, the
 * same rose trace, and then the page itself on paper beneath.
 *
 * The band is the stage's palette restated (.masthead in globals.css),
 * so everything put inside it follows: `children` is for the few
 * figures a screen opens on, as Today does with where the candidate
 * stands.
 *
 * In Admin, which has its own bar of links above the title, it stays
 * the plain heading on paper it always was (.plain-mastheads).
 */
export function TraceHeader({
  title,
  eyebrow,
  lede,
  explain,
  children,
}: {
  title: string;
  eyebrow?: string;
  lede?: string;
  /**
   * What the page is, behind an (i) on the title instead of in a line
   * under it. A lede explaining a screen is read once and sits there
   * every visit afterwards; most of these were a sentence telling a
   * candidate what they could already see.
   */
  explain?: ReactNode;
  /** Set on the band, under the title: the figures a screen opens on. */
  children?: ReactNode;
}) {
  return (
    <header className="masthead">
      {eyebrow && (
        <p className="mb-2 font-ui text-[14px] font-semibold text-good">
          {eyebrow}
        </p>
      )}
      <h1 className="type-title text-ink-strong">
        {title}
        {/* The (i) is sized from the text it sits in, and a title this
            large would make it a second heading; it is given a size of
            its own, the same as beside a card's heading. */}
        {explain && (
          <Explain label={title} className="!-top-[0.95em] text-[1.625rem]">
            {explain}
          </Explain>
        )}
      </h1>
      <Trace className="mt-3 h-5 w-44" />
      {lede && <p className="mt-3 max-w-[38rem] font-ui text-[17px] leading-relaxed text-ink/80">{lede}</p>}
      {children && <div className="masthead-figures">{children}</div>}
    </header>
  );
}
