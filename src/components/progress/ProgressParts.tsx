import Link from "next/link";
import type { ReactNode } from "react";
import { Explain } from "@/components/Explain";
import { CoverageBar } from "@/components/CoverageBar";
import { Tally } from "@/components/Tally";
import { NONE } from "@/components/ui";
import { PASS_THRESHOLD, readinessBand, type ReadinessBand } from "@/lib/performance";

/**
 * The pieces of the Progress page (app/progress/page.tsx).
 *
 * The page is built on the site's own motif: a strip of CTG paper at
 * the top, with the 70% pass mark ruled across it and the candidate's
 * accuracy drawn along it like a trace. That is the one memorable thing
 * on the page; everything under it is quiet: a row of plain figures,
 * the three topics to look at next, then each module as a list.
 *
 * Colour follows the site's one rule everywhere: red in the first
 * third, amber to 70%, green from there.
 */

const INK: Record<ReadinessBand, string> = {
  red: "text-accent-ink",
  amber: "text-warn",
  green: "text-good",
};
const FILL: Record<ReadinessBand, string> = {
  red: "bg-accent",
  amber: "bg-warn",
  green: "bg-good",
};

/* ------------------------------------------------------------------ */

const W = 600;
const H = 150;
const PAD = 6;
const yFor = (v: number) => H - PAD - (v / 100) * (H - PAD * 2);

/**
 * The strip at the top: readiness as a figure, and accuracy across
 * recent answers drawn on CTG paper against the pass line.
 *
 * Readiness and the line are different measures and say so. Readiness
 * counts every topic, unopened ones as zero; the line is accuracy over
 * the last thirty answers, plotted answer by answer, which is what
 * moves day to day.
 */
export function ReadinessStrip({
  percent,
  started,
  series,
}: {
  percent: number;
  started: boolean;
  /** Rolling accuracy, 0 to 100, oldest first. */
  series: number[];
}) {
  const band = readinessBand(percent);
  const pts = series.length >= 2 ? series : series.length === 1 ? [series[0], series[0]] : [];
  const step = pts.length > 1 ? (W - PAD * 2) / (pts.length - 1) : 0;
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${PAD + i * step} ${yFor(v)}`).join(" ");
  const pass = yFor(PASS_THRESHOLD);
  const latest = series.length ? series[series.length - 1] : null;

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-5 pt-5 sm:px-6">
        <div>
          <p className="font-ui text-[14px] text-ink/70">
            Readiness
            <Explain label="readiness">
              Your average score across every topic, counting one you have not
              opened as zero. A topic counts in full after five of its questions.
              {` ${PASS_THRESHOLD}`}% is the mark you need.
            </Explain>
          </p>
          <p
            className={`font-display text-[56px] font-normal leading-none tabular-nums [font-variation-settings:'opsz'_72] sm:text-[64px] ${
              started ? INK[band] : "text-ink/65"
            }`}
          >
            {started ? (
              <>
                <Tally to={percent} />
                <span className="text-[0.5em]">%</span>
              </>
            ) : (
              NONE
            )}
          </p>
        </div>
        <p className="pb-1 font-ui text-[14px] leading-snug text-ink/65">
          {latest !== null ? (
            <>
              Last 30 answers: <span className={`font-semibold ${INK[readinessBand(latest)]}`}>{latest}%</span>
            </>
          ) : (
            "Your trace starts with your first answer"
          )}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-3 block h-[140px] w-full sm:h-[170px]"
        role="img"
        aria-label={
          latest !== null
            ? `Accuracy over your last 30 answers, now ${latest}%, against the ${PASS_THRESHOLD}% pass mark`
            : "No answers yet"
        }
      >
        <defs>
          {/* CTG paper: a fine grid every 10, heavier every 50. */}
          <pattern id="ctg-fine" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke="rgb(var(--c-accent) / 0.07)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </pattern>
          <pattern id="ctg-major" width="50" height="50" patternUnits="userSpaceOnUse">
            <rect width="50" height="50" fill="url(#ctg-fine)" />
            <path d="M50 0H0V50" fill="none" stroke="rgb(var(--c-accent) / 0.14)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#ctg-major)" />
        {/* Above the pass mark, the faintest green wash. */}
        <rect x="0" y="0" width={W} height={pass} fill="rgb(var(--c-good) / 0.05)" />
        <line
          x1="0"
          x2={W}
          y1={pass}
          y2={pass}
          stroke="rgb(var(--c-good))"
          strokeWidth="1.5"
          strokeDasharray="6 5"
          vectorEffect="non-scaling-stroke"
        />
        {d && (
          <path
            className="trace-path"
            pathLength={300}
            d={d}
            fill="none"
            stroke="rgb(var(--c-accent))"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <p className="flex justify-between border-t border-line px-5 py-2 font-ui text-[13px] text-ink/65 sm:px-6">
        <span>Earlier answers</span>
        <span className="text-good">Dashed: the {PASS_THRESHOLD}% pass mark</span>
        <span>Latest</span>
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */

/** The plain figures under the strip, divided by rules rather than
 *  boxed: they support the strip, they do not compete with it. */
export function FactsRow({ children }: { children: ReactNode }) {
  return (
    <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-card border border-line bg-surface">
      {children}
    </dl>
  );
}

export function Fact({
  label,
  value,
  of,
  suffix,
  band,
}: {
  label: string;
  value: number;
  of?: number;
  suffix?: string;
  band?: ReadinessBand;
}) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <dt className="font-ui text-[13px] text-ink/65 sm:text-[14px]">{label}</dt>
      <dd className={`mt-1 font-display text-[24px] font-normal leading-none tabular-nums sm:text-[28px] ${band ? INK[band] : "text-ink-strong"}`}>
        <Tally to={value} />
        {suffix}
        {of !== undefined && <span className="font-ui text-[14px] text-ink/65">/{of.toLocaleString("en-GB")}</span>}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** The three topics most worth practising next, each a link into it. */
export function NextTopics({
  topics,
}: {
  topics: { id: number; title: string; accuracy: number; attempts: number }[];
}) {
  if (topics.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="font-display text-[22px] font-semibold text-ink-strong">Where to look next</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {topics.map((t) => {
          const band = readinessBand(t.accuracy);
          return (
            <li key={t.id}>
              <Link
                href={`/practise/${t.id}`}
                className="btn-motion flex h-full flex-col justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-card hover:border-good/60"
              >
                <span className="font-ui text-[15px] font-semibold leading-snug text-ink-strong">{t.title}</span>
                <span className="flex items-baseline justify-between">
                  <span className={`font-display text-[22px] tabular-nums ${t.attempts > 0 ? INK[band] : "text-ink/65"}`}>
                    {t.attempts > 0 ? `${t.accuracy}%` : "Not started"}
                  </span>
                  <span className="font-ui text-[14px] font-semibold text-good">Practise</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */

/** One topic: its name and how much of it you have seen, a small trace
 *  of your accuracy in it, and the figure. */
export function TopicRow({
  id,
  title,
  series,
  accuracy,
  attempts,
  seen,
  available,
}: {
  id: number;
  title: string;
  series: number[];
  accuracy: number;
  attempts: number;
  seen: number;
  available: number;
}) {
  const band = readinessBand(accuracy);
  const w = 120;
  const h = 32;
  const y = (v: number) => h - 3 - (v / 100) * (h - 6);
  const pts = series.length >= 2 ? series : attempts > 0 ? [accuracy, accuracy] : [];
  const step = pts.length > 1 ? w / (pts.length - 1) : 0;
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${y(v)}`).join(" ");
  return (
    <li>
      <Link
        href={`/practise/${id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3.5 transition-colors duration-fast hover:bg-sunk sm:grid-cols-[minmax(0,1fr)_120px_64px] sm:px-5"
      >
        <span className="min-w-0">
          <span className="block font-ui text-[15px] font-semibold leading-snug text-ink-strong">{title}</span>
          <CoverageBar done={seen} total={available} />
        </span>
        <svg viewBox={`0 0 ${w} ${h}`} className="hidden h-8 w-[120px] sm:block" aria-hidden="true">
          <line x1="0" x2={w} y1={y(PASS_THRESHOLD)} y2={y(PASS_THRESHOLD)} stroke="rgb(var(--c-good) / 0.6)" strokeDasharray="3 3" strokeWidth="1" />
          {d && (
            <path className="trace-path" pathLength={300} d={d} fill="none" stroke="rgb(var(--c-accent))" strokeWidth="1.5" strokeLinejoin="round" />
          )}
        </svg>
        <span className={`text-right font-display text-[22px] tabular-nums ${attempts > 0 ? INK[band] : "text-ink/65"}`}>
          {attempts > 0 ? `${accuracy}%` : NONE}
        </span>
      </Link>
    </li>
  );
}

export { FILL as BAND_FILL };
