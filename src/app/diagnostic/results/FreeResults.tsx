import Link from "next/link";
import { PASS_THRESHOLD, barFill } from "@/lib/performance";
import type { DiagnosticSummary } from "@/lib/diagnostic";

/**
 * What fifteen questions found, and what they could not look at.
 *
 * This is the screen that has to persuade, and the only thing it has to
 * persuade with is the truth: a score against the pass mark, which
 * module it came from, which sub-topics the marks were dropped in, and
 * how much of the syllabus fifteen questions never reached.
 *
 * It deliberately does not call a missed sub-topic weak. One question
 * cannot establish that, and a product that says so on a single wrong
 * answer is lying in its own favour — which is the one thing that
 * would make a candidate right not to trust the rest of it.
 */
export function FreeResults({
  summary,
  subTopicsTotal,
}: {
  summary: DiagnosticSummary;
  subTopicsTotal: number;
}) {
  const passing = summary.percent >= PASS_THRESHOLD;
  const tested = subTopicsTotal - summary.untested;

  return (
    <>
      {/* The number, and the line it is measured against. */}
      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <p className="font-ui text-[14px] font-semibold text-good">
          Your score
        </p>
        <p className="mt-2 flex items-baseline gap-3">
          <span className="font-mono text-4xl text-ink-strong">
            {summary.correct}
            <span className="text-ink/40">/{summary.asked}</span>
          </span>
          <span
            className={`font-mono text-sm ${
              passing ? "text-good" : "text-accent-ink"
            }`}
          >
            {summary.percent}%
          </span>
        </p>
        <p className="mt-3 font-ui text-[16px] leading-relaxed text-ink/80">
          {passing
            ? `Above the ${PASS_THRESHOLD}% pass mark on this sample. Fifteen questions cannot tell you that you are ready, but they can tell you that nothing here is obviously broken.`
            : `The pass mark is ${PASS_THRESHOLD}%. On this sample you are ${
                PASS_THRESHOLD - summary.percent
              } points below it, with ${
                summary.untested
              } sub-topics still unexamined.`}
        </p>
      </section>

      {/* Where the marks came from. Five questions a module is coarse,
          and it is the smallest unit this diagnostic can report
          honestly. */}
      {summary.modules.length > 0 && (
        <section className="mt-4 rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="font-ui text-[14px] font-semibold text-good">
            By module
          </p>
          <ul className="mt-3 space-y-3">
            {summary.modules.map((m) => {
              const pct = m.asked
                ? Math.round((m.correct / m.asked) * 100)
                : 0;
              return (
                <li key={m.moduleId}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink">{m.title}</span>
                    <span className="font-mono text-xs text-ink/60">
                      {m.correct}/{m.asked}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sunk">
                    <div
                      className={`bar-grow h-full rounded-full ${barFill(pct)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* The uncomfortable part, stated as what it is. */}
      {summary.missed.length > 0 && (
        <section className="mt-4 rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="font-ui text-[14px] font-semibold text-good">
            Where the marks went
          </p>
          <p className="mt-2 font-ui text-[16px] leading-relaxed text-ink/85">
            You dropped marks in{" "}
            <span className="font-medium text-ink-strong">
              {summary.missed.join(", ")}
            </span>
            .
          </p>
          <p className="mt-2 font-ui text-[16px] leading-relaxed text-ink/65">
            One question each, so this is where to look rather than a
            verdict on the topic. The full diagnostic asks five in every
            sub-topic, which is enough to tell a bad day from a gap.
          </p>
        </section>
      )}

      {/* The gap, which is the offer. */}
      <section className="mt-4 rounded-card border border-good/40 bg-sunk p-6">
        <p className="font-ui text-[14px] font-semibold text-good">
          What this did not look at
        </p>
        <p className="mt-2 font-ui text-[16px] leading-relaxed text-ink/85">
          Fifteen questions reached {tested} of {subTopicsTotal} sub-topics.
          The other {summary.untested} are unexamined: on this evidence you
          cannot say whether they are your strongest or your weakest.
        </p>
        <p className="mt-2 font-ui text-[16px] leading-relaxed text-ink/85">
          A subscription runs the full diagnostic across every sub-topic,
          draws your topic map against the {PASS_THRESHOLD}% line, and builds
          a plan from your exam date backwards that front-loads whatever it
          finds.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/pricing"
            className="inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good"
          >
            See what that costs
          </Link>
          <Link
            href="/practise"
            className="inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
          >
            Keep practising free
          </Link>
        </div>
        <p className="mt-3 font-mono text-xs text-ink/50">
          7-day full refund, no questions asked
        </p>
      </section>
    </>
  );
}
