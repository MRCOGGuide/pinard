import { Trace } from "@/components/Trace";

/**
 * Section header with the trace underline — used at the top of every screen.
 */
export function TraceHeader({
  title,
  eyebrow,
  lede,
}: {
  title: string;
  eyebrow?: string;
  lede?: string;
}) {
  return (
    <header className="mb-8">
      {eyebrow && (
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-greentop">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-3xl font-semibold text-theatre sm:text-4xl">
        {title}
      </h1>
      <Trace className="mt-3 h-5 w-44" />
      {lede && <p className="mt-3 text-sm text-graphite/70">{lede}</p>}
    </header>
  );
}
