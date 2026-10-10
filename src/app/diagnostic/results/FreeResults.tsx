import Link from "next/link";
import { PASS_THRESHOLD } from "@/lib/performance";
import type { DiagnosticSummary, PlanPreview } from "@/lib/diagnostic";
import { GradeBar } from "@/components/GradeBar";

/**
 * What the sample diagnostic found, and a preview of the plan it points
 * to.
 *
 * This is the screen that has to persuade, and the only thing it has to
 * persuade with is the truth: a score against the pass mark, which
 * module it came from, which sections the marks were dropped in, and
 * the first fortnight of the plan those answers lead to.
 *
 * It deliberately does not call a missed section weak. One question
 * cannot establish that, and a product that says so on a single wrong
 * answer is lying in its own favour.
 *
 * The plan preview is worked out by fixed rules, not written by AI, so
 * a free account costs nothing to serve and the same answers always give
 * the same preview (owner's decision, 10 October 2026). The rest of the
 * plan is shown under frosted glass: it is real, it is theirs, and it is
 * what a subscription opens.
 */
export function FreeResults({
  summary,
  preview,
  examWeeks,
}: {
  summary: DiagnosticSummary;
  preview: PlanPreview;
  /** Whole weeks to the exam, when the date is set. */
  examWeeks: number | null;
}) {
  const passing = summary.percent >= PASS_THRESHOLD;

  /* The blurred weeks: two sections a fortnight from week 3, then the
     final fortnight of mixed papers, as the real plan runs. */
  const weeks = examWeeks ?? 12;
  const fortnights: { label: string; items: string[] }[] = [];
  for (let start = 3, i = 0; start + 1 <= weeks - 2 && i < preview.later.length; start += 2, i += 2) {
    fortnights.push({ label: `Weeks ${start} and ${start + 1}`, items: preview.later.slice(i, i + 2) });
  }
  fortnights.push({ label: "Final fortnight", items: ["Mixed papers under exam conditions"] });

  return (
    <>
      {/* The number, and the line it is measured against. */}
      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <p className="font-ui text-[14px] font-semibold text-good">Your score</p>
        <p className="mt-2 flex items-baseline gap-3">
          <span className="font-mono text-4xl text-ink-strong">
            {summary.correct}
            <span className="text-ink/65">/{summary.asked}</span>
          </span>
          <span className={`font-mono text-sm ${passing ? "text-good" : "text-accent-ink"}`}>
            {summary.percent}%
          </span>
        </p>
        <p className="mt-3 font-ui text-[16px] leading-relaxed text-ink/80">
          {passing
            ? `Above the ${PASS_THRESHOLD}% pass mark on this sample. One question or set a section cannot tell you that you are ready, but it can tell you that nothing here is obviously broken.`
            : `The pass mark is ${PASS_THRESHOLD}%. On this sample you are ${PASS_THRESHOLD - summary.percent} points below it.`}
        </p>
      </section>

      {/* Where the marks came from. */}
      {summary.modules.length > 0 && (
        <section className="mt-4 rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="font-ui text-[14px] font-semibold text-good">By module</p>
          <ul className="mt-3 space-y-3">
            {summary.modules.map((m) => {
              const pct = m.asked ? Math.round((m.correct / m.asked) * 100) : 0;
              return (
                <li key={m.moduleId}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink">{m.title}</span>
                    <span className="font-mono text-xs text-ink/65">
                      {m.correct}/{m.asked}
                    </span>
                  </div>
                  <GradeBar percent={pct} className="mt-1.5 h-1.5" />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* The uncomfortable part, stated as what it is. */}
      {summary.missed.length > 0 && (
        <section className="mt-4 rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="font-ui text-[14px] font-semibold text-good">Where the marks went</p>
          <p className="mt-2 font-ui text-[16px] leading-relaxed text-ink/85">
            You dropped marks in{" "}
            <span className="font-medium text-ink-strong">{summary.missed.join(", ")}</span>.
          </p>
          <p className="mt-2 font-ui text-[16px] leading-relaxed text-ink/65">
            One question or set a section, so this is where to look rather than a verdict on the topic. The full
            diagnostic asks two single best answers and an EMQ set in every section, which is enough to tell a bad
            day from a gap.
          </p>
        </section>
      )}

      {/* The plan preview: the first fortnight in the open, the rest under glass. */}
      <section className="mt-4 rounded-card border border-good/40 bg-sunk p-6">
        <p className="font-ui text-[14px] font-semibold text-good">Your plan preview</p>
        <p className="mt-2 font-ui text-[16px] leading-relaxed text-ink/85">
          {preview.allCorrect ? (
            "You dropped no marks on this sample. Your plan would begin with the full diagnostic, to test every section in more depth than one question can."
          ) : (
            <>
              Your plan would focus on{" "}
              <span className="font-medium text-ink-strong">{listOf(preview.firstFortnight)}</span> in the first two
              weeks.
            </>
          )}
        </p>
        {!preview.allCorrect && (
          <p className="mt-2 font-ui text-[15px] leading-relaxed text-ink/65">
            Easier questions missed in obstetrics and gynaecology come first, because they are the clearest sign of a
            gap; governance and the high-impact papers follow.
          </p>
        )}

        {/* Tall enough for the card over it, however few weeks are left. */}
        <div className="relative mt-5 min-h-[18rem] overflow-hidden rounded-card border border-line bg-surface">
          <ol aria-hidden="true" className="select-none divide-y divide-line blur-[5px]">
            {fortnights.map((f) => (
              <li key={f.label} className="flex items-baseline justify-between gap-4 px-4 py-3">
                <span className="font-ui text-[14px] font-semibold text-ink/70">{f.label}</span>
                <span className="text-right font-ui text-[15px] text-ink">{f.items.join(", ")}</span>
              </li>
            ))}
          </ol>
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="max-w-sm rounded-card border border-line/70 bg-surface/75 p-5 text-center shadow-raised backdrop-blur-md backdrop-saturate-150">
              <p className="font-ui text-[16px] font-semibold text-ink-strong">The rest of your plan</p>
              <p className="mt-1.5 font-ui text-[15px] leading-relaxed text-ink/80">
                Week by week to your exam, built from your answers and moved by every question you answer after. Part
                of every paid plan.
              </p>
              <Link
                href="/pricing"
                className="btn-motion mt-4 inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good"
              >
                See the plans
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-4 font-ui text-[14px] leading-relaxed text-ink/70">
          Free accounts get this limited plan preview. Subscribe for your full personalised plan.
        </p>
        <p className="mt-3 font-ui text-[14px] text-ink/70">
          Or{" "}
          <Link href="/practise/free" className="underline underline-offset-2 hover:text-ink-strong">
            try the 15 free sample questions
          </Link>
          .
        </p>
        <p className="mt-3 font-mono text-xs text-ink/65">14-day full refund, no questions asked</p>
      </section>
    </>
  );
}

/** "A", "A and B", "A, B and C". */
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
