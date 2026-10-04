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
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-good">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-3xl font-semibold text-ink-strong sm:text-4xl">
        {title}
        {explain && <Explain label={title}>{explain}</Explain>}
      </h1>
      <Trace className="mt-3 h-5 w-44" />
      {lede && <p className="mt-3 text-sm text-ink/70">{lede}</p>}
    </header>
  );
}
