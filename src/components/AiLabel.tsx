import type { ReactNode } from "react";

/**
 * Marks text written by AI, wherever it appears: the plan briefing,
 * Ask Pinard's answers, and their pictures on the landing page.
 *
 * Said in words beside a small spark rather than by the spark alone,
 * so it reads to anyone, a screen reader included. Telling people when
 * they are reading machine-written text is a transparency duty as well
 * as a courtesy (EU AI Act, article 50).
 */
export function AiLabel({ children = "Written by AI", className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-ui text-[13px] font-semibold text-good ${className}`.trim()}>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
        <path d="M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z" fill="currentColor" />
      </svg>
      {children}
    </span>
  );
}
