/** Shared building blocks for the legal / policy pages. */

export function LastUpdated({ date }: { date: string }) {
  return (
    <p className="mb-6 font-mono text-xs text-ink/50">Last updated: {date}</p>
  );
}

export function Section({
  n,
  title,
  children,
}: {
  n?: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="font-display text-lg font-semibold text-ink-strong">
        {n !== undefined && <span className="text-ink/50">{n}. </span>}
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink/85">
        {children}
      </div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="ml-5 list-disc space-y-1">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
