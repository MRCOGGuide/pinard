import type { ReactNode } from "react";
import { Trace } from "@/components/Trace";
import { Explain } from "@/components/Explain";

/**
 * Section header with the trace underline, at the top of every screen.
 */
export function TraceHeader({
  title,
  eyebrow,
  lede,
  explain,
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
}) {
  return (
    <header className="mb-8">
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
      {lede && <p className="mt-3 max-w-[38rem] font-ui text-[17px] leading-relaxed text-ink/75">{lede}</p>}
    </header>
  );
}
