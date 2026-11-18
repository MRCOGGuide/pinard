import { safeLink } from "@/lib/officialLink";

/**
 * A source's title, linked to its official page where one is known
 * (L7.3), so a candidate can read the guidance an answer came from.
 * Opens in a new tab: the candidate keeps their place in the session.
 */
export function SourceTitle({ title, url, className = "" }: { title: string; url?: string | null; className?: string }) {
  const href = safeLink(url);
  if (!href) return <span className={className}>{title}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} underline decoration-ink/30 underline-offset-2 hover:text-ink-strong hover:decoration-ink/60`.trim()}
    >
      {title}
      <span className="sr-only"> (official page, opens in a new tab)</span>
    </a>
  );
}
