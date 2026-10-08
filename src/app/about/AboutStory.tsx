"use client";

import type { ReactNode } from "react";
import {
  FADE,
  fadeStyle,
  useScrollPlay,
  useStages,
  type Phase,
} from "@/components/scroll";

/**
 * How it works, as three pictures with a sentence or two each.
 *
 * Deliberately not the landing page again. The landing page says what
 * a candidate does (diagnostic, plan, practise, mock, Ask Pinard); this
 * page says what stands behind the questions: where they come from, how
 * they are kept current, and how much of the syllabus they cover.
 *
 * Each section fades in as it is reached and out as it is left, and its
 * picture plays from the start each time (components/scroll). Finished
 * and still under reduced motion.
 */

const MOVE = "transition-[transform,opacity] duration-[250ms] ease-out motion-reduce:transition-none";

function Section({
  title,
  children,
  picture,
}: {
  title: string;
  children: ReactNode;
  picture: (phase: Phase) => ReactNode;
}) {
  const [ref, phase, side] = useScrollPlay<HTMLElement>();
  return (
    <section
      ref={ref}
      className={`grid items-center gap-8 border-t border-line py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-16 ${FADE}`}
      style={fadeStyle(phase, side)}
    >
      <div className="max-w-[30rem]">
        <h2 className="font-display text-[26px] font-semibold leading-snug text-ink-strong sm:text-[30px]">
          {title}
        </h2>
        <div className="mt-3 space-y-3 font-ui text-[17px] leading-relaxed text-ink/80">{children}</div>
      </div>
      {/* The picture repeats what the words beside it say. */}
      <div aria-hidden="true">{picture(phase)}</div>
    </section>
  );
}

function Tick({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

const STAGES = [
  "Guidance in the library",
  "Question written from it",
  "Citation checked against the passage",
  "Approved by a Member of the RCOG",
  "In your session",
];

/** A question's way to the candidate: each stage lights in turn, the
 *  rail filling behind it. */
function PipelinePicture({ phase }: { phase: Phase }) {
  const lit = useStages(phase, [150, 550, 950, 1350, 1750]);
  const fill = Math.max(0, lit - 1) / (STAGES.length - 1);
  return (
    <div className="rounded-[14px] border border-line bg-surface p-6 shadow-card">
      <ol className="relative space-y-5">
        {/* The rail, and the green filling down it. */}
        <span className="absolute bottom-3 left-[13px] top-3 w-[2px] rounded-full bg-sunk" />
        <span
          className={`absolute bottom-3 left-[13px] top-3 w-[2px] origin-top rounded-full bg-good ${MOVE}`}
          style={{ transform: `scaleY(${fill})`, transitionDuration: "350ms" }}
        />
        {STAGES.map((s, i) => {
          const on = lit > i;
          const last = i === STAGES.length - 1;
          return (
            <li key={s} className="relative flex items-center gap-4">
              <span
                className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${MOVE} ${
                  on ? "border-good bg-good text-on-brand" : "border-line bg-surface text-transparent"
                }`}
                style={{ transform: on ? "scale(1)" : "scale(0.85)" }}
              >
                <Tick className="h-3.5 w-3.5" />
              </span>
              <span
                className={`font-ui text-[16px] ${MOVE} ${last ? "font-semibold text-ink-strong" : "text-ink"}`}
                style={{ opacity: on ? 1 : 0.35 }}
              >
                {s}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** How a supersession is handled, shown on a real pair of editions (the
 *  2016 Green-top Guideline on monochorionic twins and its 2024 partial
 *  update) and labelled as an example, since retiring an edition is the
 *  owner's call in Admin, not automatic. */
function RefreshPicture({ phase }: { phase: Phase }) {
  const stage = useStages(phase, [500, 1000, 1500]);
  return (
    <div className="rounded-[14px] border border-line bg-surface p-6 shadow-card">
      <p className="flex items-baseline justify-between gap-4 font-ui text-[14px]">
        <span className="font-semibold text-ink-strong">How a refresh works</span>
        <span className="text-ink/55">Example</span>
      </p>
      <div className="relative mt-4 h-[148px]">
        <div
          className={`absolute inset-x-0 top-0 rounded-control border border-line bg-sunk p-4 ${MOVE}`}
          style={{
            opacity: stage >= 2 ? 0 : 1,
            transform: stage >= 2 ? "translateX(-24px)" : "none",
            transitionDuration: "300ms",
          }}
        >
          <p className={`font-display text-[17px] font-semibold text-ink ${stage >= 1 ? "line-through decoration-accent decoration-2" : ""}`}>
            Management of Monochorionic Twin Pregnancy
          </p>
          <p className="mt-1 font-ui text-[14px] text-ink/65">RCOG Green-top Guideline No. 51, 2016</p>
          <p
            className={`mt-2 font-ui text-[14px] font-semibold text-accent-ink ${MOVE}`}
            style={{ opacity: stage >= 1 ? 1 : 0 }}
          >
            Superseded: retired, with the questions written from it
          </p>
        </div>
        <div
          className={`absolute inset-x-0 top-0 rounded-control border border-good/50 bg-good/5 p-4 ${MOVE}`}
          style={{
            opacity: stage >= 2 ? 1 : 0,
            transform: stage >= 2 ? "none" : "translateX(24px)",
            transitionDuration: "300ms",
          }}
        >
          <p className="font-display text-[17px] font-semibold text-ink-strong">
            Management of Monochorionic Twin Pregnancy
          </p>
          <p className="mt-1 font-ui text-[14px] text-ink/65">2024 partial update</p>
          <p
            className={`mt-2 inline-flex items-center gap-1.5 font-ui text-[14px] font-semibold text-good ${MOVE}`}
            style={{ opacity: stage >= 3 ? 1 : 0 }}
          >
            <Tick className="h-4 w-4" /> New questions written from the update
          </p>
        </div>
      </div>
    </div>
  );
}

const TOPICS = 35;

/** The syllabus as 35 tiles, filling in turn. */
function SyllabusPicture({ phase }: { phase: Phase }) {
  const on = useStages(phase, [100]) >= 1;
  return (
    <div className="rounded-[14px] border border-line bg-surface p-6 shadow-card">
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: TOPICS }, (_, i) => (
          <span
            key={i}
            className={`aspect-square rounded-[6px] bg-good ${MOVE}`}
            style={{
              opacity: on ? 0.35 + 0.65 * ((i * 7) % 11) / 10 : 0,
              transform: on ? "scale(1)" : "scale(0.6)",
              transitionDelay: on ? `${i * 28}ms` : "0ms",
            }}
          />
        ))}
      </div>
      <p className="mt-4 flex items-baseline justify-between font-ui text-[14px] text-ink/65">
        <span>Obstetrics, gynaecology and governance</span>
        <span className="font-display text-[22px] font-semibold tabular-nums text-ink-strong">35 topics</span>
      </p>
    </div>
  );
}

export function AboutStory() {
  return (
    <div className="mt-6">
      <Section title="From guideline to your screen" picture={(p) => <PipelinePicture phase={p} />}>
        <p>
          Every question starts from a passage in current guidance and carries
          that passage as its citation. If the citation does not support the
          answer, the question is discarded. Nothing reaches you until a Member
          of the RCOG has approved it.
        </p>
      </Section>
      <Section title="Kept current" picture={(p) => <RefreshPicture phase={p} />}>
        <p>
          Guidelines and TOG reviews change. Every quarter the library is
          refreshed: superseded guidance is retired along with the questions
          written from it, and new questions are written from what replaced it.
        </p>
      </Section>
      <Section title="The whole syllabus" picture={(p) => <SyllabusPicture phase={p} />}>
        <p>
          All 35 topics, clinical and non-clinical, in the exam&rsquo;s own
          format: single best answers and full extended-matching sets. Sources
          go beyond the RCOG to the specialist guidance the paper draws on,
          such as NICE, ESHRE, BSGE and BASHH.
        </p>
      </Section>
    </div>
  );
}
