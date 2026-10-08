"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AnswerDisclaimer } from "@/components/AnswerDisclaimer";

/**
 * "What Pinard does", told as the five things that happen to a
 * candidate, each beside a small picture of it happening.
 *
 * The pictures move once, as the candidate reaches them, because each
 * one shows a process: scores landing against the pass line, a plan
 * re-ordering itself around the weakest topics, an AI briefing and an
 * answer being written, a mock clock running. Motion here carries the
 * point rather than decorating it, which is the line the design brief
 * draws against fading every section in.
 *
 * Every transition is transform or opacity, 250ms ease-out, staged in
 * sequence rather than slowed down. Under prefers-reduced-motion, with
 * no IntersectionObserver, or before the script runs, each picture is
 * simply drawn in its finished state.
 *
 * The figures in the pictures are an example candidate and say so.
 *
 * On the AI claims, kept to what the code does: the plan's weighting is
 * a fixed rule (lib/studyPlan.ts), Claude writes the briefing over it
 * from the candidate's scores (lib/narrative.ts), and Ask Pinard is
 * Claude answering from retrieved guidance.
 */

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** still: drawn finished. waiting: drawn at the start, off screen.
 *  playing: reached, running through its stages. */
type Phase = "still" | "waiting" | "playing";

/** Plays a picture once, when it is a quarter of the way up the screen. */
function useScrollPlay<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [phase, setPhase] = useState<Phase>("still");

  useIsoLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already on screen when the page arrives: leave it finished, so
    // nothing the candidate is looking at blanks and redraws.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.85) return;

    setPhase("waiting");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setPhase("playing");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -25% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, phase] as const;
}

/** How many of the stages, at these offsets in ms, have been reached. */
function useStages(phase: Phase, at: number[]): number {
  const [reached, setReached] = useState(0);
  useEffect(() => {
    if (phase !== "playing") return;
    const timers = at.map((ms, i) => window.setTimeout(() => setReached(i + 1), ms));
    return () => timers.forEach(clearTimeout);
    // The offsets are constants at each call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  return phase === "still" ? at.length : phase === "waiting" ? 0 : reached;
}

/** Words shown so far of a passage being written, one every `every` ms
 *  once `go` is true. */
function useStream(phase: Phase, total: number, go: boolean, every = 38): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (phase !== "playing" || !go) return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= total) clearInterval(id);
    }, every);
    return () => clearInterval(id);
  }, [phase, go, total, every]);
  return phase === "still" ? total : shown;
}

const MOVE = "transition-[transform,opacity] duration-[250ms] ease-out motion-reduce:transition-none";

/** Shown once `on`, rising 6px into place. */
function Arrive({
  on,
  children,
  className = "",
  delay = 0,
}: {
  on: boolean;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`${MOVE} ${className}`}
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "none" : "translateY(6px)",
        transitionDelay: on ? `${delay}ms` : "0ms",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Text that appears word by word without moving anything: every word is
 * laid out from the start and only its opacity changes, so the box is
 * its final height before the first word shows.
 */
function Streamed({ text, shown, className = "" }: { text: string; shown: number; className?: string }) {
  const words = text.split(" ");
  return (
    <p className={className}>
      {words.map((w, i) => (
        <span
          key={i}
          className="transition-opacity duration-150 ease-out motion-reduce:transition-none"
          style={{ opacity: i < shown ? 1 : 0 }}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}

/** The frame a picture sits in, captioned. */
function Panel({ caption, note, children }: { caption: string; note?: string; children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-6">
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 font-ui text-[14px]">
        <span className="font-semibold text-ink-strong">{caption}</span>
        {note && <span className="text-ink/55">{note}</span>}
      </p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** A small mark for the parts of a picture written by AI. */
function AiMark({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-ui text-[13px] font-semibold text-good">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          d="M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z"
          fill="currentColor"
        />
      </svg>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */

/** Five questions per module, so the scores move in fifths. */
const MODULES = [
  { name: "Obstetrics", score: 80 },
  { name: "Gynaecology", score: 60 },
  { name: "Governance", score: 40 },
];

function DiagnosticPicture({ phase }: { phase: Phase }) {
  const stage = useStages(phase, [100, 650]);
  return (
    <Panel caption="Diagnostic result" note="Example candidate">
      <ul className="space-y-4">
        {MODULES.map((m, i) => {
          const below = m.score < 70;
          return (
            <li key={m.name} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.75rem] items-center gap-3 font-ui text-[15px]">
              <span className="text-ink">{m.name}</span>
              <span className="relative block h-3 rounded-full bg-sunk">
                <span
                  className={`absolute inset-y-0 left-0 w-full origin-left rounded-full ${MOVE} ${below ? "bg-accent" : "bg-good"}`}
                  style={{
                    transform: `scaleX(${stage >= 1 ? m.score / 100 : 0})`,
                    transitionDelay: stage >= 1 ? `${i * 120}ms` : "0ms",
                  }}
                />
                {/* The pass line, drawn over the track. */}
                <span className="absolute -inset-y-1.5 left-[70%] w-px bg-ink-strong/70" />
              </span>
              <span
                className={`text-right font-semibold tabular-nums ${MOVE} ${below ? "text-accent-ink" : "text-good"}`}
                style={{ opacity: stage >= 1 ? 1 : 0, transitionDelay: stage >= 1 ? `${i * 120 + 150}ms` : "0ms" }}
              >
                {m.score}%
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)_2.75rem] gap-3 font-ui text-[13px] text-ink/55">
        <span className="relative col-start-2 h-4">
          <span className="absolute left-[70%] -translate-x-1/2 whitespace-nowrap">Pass line 70%</span>
        </span>
      </p>
      <Arrive on={stage >= 2} className="mt-5 border-t border-line pt-4">
        <p className="font-ui text-[14px] text-ink/60">Missed, so the plan starts here</p>
        <p className="mt-2 flex flex-wrap gap-2">
          {["Preterm birth", "Ovarian masses", "Consent", "Clinical audit"].map((t) => (
            <span key={t} className="rounded-full bg-accent/10 px-3 py-1 font-ui text-[14px] text-accent-ink">
              {t}
            </span>
          ))}
        </p>
      </Arrive>
    </Panel>
  );
}

/** A week of the example plan. `minutes` is the time it gets; secure
 *  topics are there for spaced review. */
const TOPICS = [
  { name: "Antenatal care", score: 82, minutes: 20 },
  { name: "Clinical audit", score: 45, minutes: 70 },
  { name: "Consent", score: 55, minutes: 55 },
  { name: "Labour", score: 78, minutes: 25 },
  { name: "Preterm birth", score: 38, minutes: 90 },
];
/** The same topics, most ground to make up first. */
const BY_NEED = [...TOPICS].sort((a, b) => a.score - b.score).map((t) => t.name);
const ROW = 44;

const BRIEFING =
  "68 days to go. Your first weeks front-load preterm birth, clinical audit and consent, where you have the most ground to make up. Antenatal care and labour come back for review about once a week, and the last fortnight turns into mixed papers under exam conditions.";

function PlanPicture({ phase }: { phase: Phase }) {
  const stage = useStages(phase, [350, 800, 1300]);
  const shown = useStream(phase, BRIEFING.split(" ").length, stage >= 3);
  return (
    <Panel caption="This week's plan" note="Example candidate">
      <ol className="relative" style={{ height: TOPICS.length * ROW }}>
        {TOPICS.map((t) => {
          const at = stage >= 1 ? BY_NEED.indexOf(t.name) : TOPICS.indexOf(t);
          const weak = t.score < 70;
          return (
            <li
              key={t.name}
              className={`absolute inset-x-0 top-0 grid h-11 grid-cols-[7.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 font-ui text-[15px] ${MOVE}`}
              style={{ transform: `translateY(${at * ROW}px)` }}
            >
              <span className="truncate text-ink">{t.name}</span>
              <span className="relative block h-2.5 rounded-full bg-sunk">
                <span
                  className={`absolute inset-y-0 left-0 w-full origin-left rounded-full ${MOVE} ${weak ? "bg-accent" : "bg-good/70"}`}
                  style={{ transform: `scaleX(${stage >= 2 ? t.minutes / 100 : 0.3})` }}
                />
              </span>
              <span className="text-right tabular-nums text-ink/70">
                <span className={MOVE} style={{ opacity: stage >= 2 ? 1 : 0 }}>
                  {weak ? `${t.minutes}m` : "Review"}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 border-t border-line pt-4">
        <Arrive on={stage >= 3}>
          <AiMark>Your briefing, written by AI</AiMark>
        </Arrive>
        <Streamed text={BRIEFING} shown={shown} className="reading mt-2 !text-[16px] text-ink/90" />
      </div>
    </Panel>
  );
}

const PASSAGE_BEFORE = "Advise pregnant women with type 1 or type 2 diabetes and no other complications to have ";
const PASSAGE_MARK = "an elective birth by induction of labour, or by elective caesarean section if indicated, between 37+0 weeks and 38+6 weeks";
const PASSAGE_AFTER = " of pregnancy.";

function GuidancePicture({ phase }: { phase: Phase }) {
  const stage = useStages(phase, [150, 600, 1000]);
  return (
    <Panel caption="From the guideline to the question">
      <p className="font-ui text-[13px] text-ink/60">NICE NG3, Diabetes in pregnancy</p>
      <p className="mt-1 font-serif text-[16px] leading-relaxed text-ink/85">
        {PASSAGE_BEFORE}
        <span className="relative">
          <span
            aria-hidden="true"
            className={`absolute -inset-x-0.5 inset-y-0 origin-left rounded-[3px] bg-good/15 ${MOVE}`}
            style={{ transform: `scaleX(${stage >= 1 ? 1 : 0})`, transitionDuration: "250ms" }}
          />
          <span className="relative">{PASSAGE_MARK}</span>
        </span>
        {PASSAGE_AFTER}
      </p>
      <Arrive on={stage >= 2} className="mt-4 rounded-[10px] bg-sunk p-4">
        <p className="font-ui text-[13px] text-ink/60">The question it became</p>
        <p className="mt-1 font-ui text-[15px] leading-snug text-ink">
          A 34-year-old with type 1 diabetes at 36 weeks asks about timing of
          birth. <span className="font-semibold text-good">Answer A: 37+0 to 38+6 weeks.</span>
        </p>
      </Arrive>
      <Arrive on={stage >= 3} className="mt-3 flex items-center gap-2 font-ui text-[14px] text-good">
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Citation checked against the passage
      </Arrive>
    </Panel>
  );
}

const ANSWER =
  "Overall success for planned VBAC is 72 to 75%. With at least one previous vaginal birth it rises to 85 to 90%, and a previous vaginal birth, particularly a previous VBAC, is the single best predictor.";

function TutorPicture({ phase }: { phase: Phase }) {
  const stage = useStages(phase, [100, 600]);
  const total = ANSWER.split(" ").length;
  const shown = useStream(phase, total, stage >= 2);
  const done = shown >= total;
  return (
    <Panel caption="Ask Pinard">
      <Arrive on={stage >= 1} className="ml-auto w-fit max-w-[85%] rounded-[12px] rounded-br-[4px] bg-brand px-4 py-2.5 font-ui text-[15px] text-on-brand">
        Success rate of VBAC?
      </Arrive>
      <div className="mt-4">
        <Arrive on={stage >= 2}>
          <AiMark>Pinard, answering from the guidance</AiMark>
        </Arrive>
        <Streamed text={ANSWER} shown={shown} className="reading mt-2 !text-[16px] text-ink/90" />
        <Arrive on={done} className="mt-3 font-ui text-[13px] text-ink/60">
          <span className="font-semibold text-ink/80">Source.</span> Birth after
          Previous Caesarean Birth. RCOG Green-top Guideline No. 45, 2015
        </Arrive>
      </div>
    </Panel>
  );
}

/** Seventy minutes for the SBA paper, run down in a couple of seconds. */
const SBA_SECONDS = 70 * 60;

function MockPicture({ phase }: { phase: Phase }) {
  const stage = useStages(phase, [100, 1900, 2300]);
  const [left, setLeft] = useState(SBA_SECONDS);
  useEffect(() => {
    if (phase !== "playing" || stage < 1) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1700);
      // Eases out, as the hand does: most of the paper goes early.
      setLeft(Math.round(SBA_SECONDS * (1 - (1 - (1 - p) ** 2) * 0.86)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, stage]);

  const remaining = phase === "still" ? Math.round(SBA_SECONDS * 0.14) : left;
  const used = 1 - remaining / SBA_SECONDS;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <Panel caption="Mock paper" note="Example candidate">
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" aria-hidden="true">
          <circle cx="32" cy="32" r="29" fill="none" stroke="rgb(var(--c-line))" strokeWidth="2" />
          {Array.from({ length: 12 }, (_, i) => (
            <line
              key={i}
              x1="32"
              y1="5"
              x2="32"
              y2={i % 3 === 0 ? 10 : 8}
              stroke="rgb(var(--c-ink) / 0.4)"
              strokeWidth="1.5"
              transform={`rotate(${i * 30} 32 32)`}
            />
          ))}
          <line
            x1="32"
            y1="32"
            x2="32"
            y2="11"
            stroke="rgb(var(--c-accent))"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ transform: `rotate(${used * 360}deg)`, transformOrigin: "32px 32px" }}
          />
          <circle cx="32" cy="32" r="2.5" fill="rgb(var(--c-ink-strong))" />
        </svg>
        <div className="font-ui">
          <p className="text-[14px] text-ink/60">Single best answers, 50 questions</p>
          <p className="font-serif text-[30px] font-semibold tabular-nums leading-tight text-ink-strong">
            {mm}:{ss}
          </p>
          <p className="text-[14px] text-ink/60">left of 70 minutes</p>
        </div>
      </div>
      <Arrive on={stage >= 2} className="mt-5 border-t border-line pt-4 font-ui text-[15px]">
        <p className="text-ink/60">Handed in. Marked as the paper is</p>
        <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
          <dt className="text-ink">Single best answers, 40% of the mark</dt>
          <dd className="text-right tabular-nums text-ink">68%</dd>
          <dt className="text-ink">Extended matching, 60% of the mark</dt>
          <dd className="text-right tabular-nums text-ink">74%</dd>
        </dl>
      </Arrive>
      <Arrive on={stage >= 3} className="mt-3 flex items-baseline justify-between gap-4 font-ui">
        <span className="font-semibold text-ink-strong">Overall</span>
        <span className="font-serif text-[22px] font-semibold tabular-nums text-good">
          71.6%, above the line
        </span>
      </Arrive>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function Step({
  title,
  children,
  picture,
}: {
  title: string;
  children: ReactNode;
  picture: (phase: Phase) => ReactNode;
}) {
  const [ref, phase] = useScrollPlay<HTMLLIElement>();
  return (
    <li
      ref={ref}
      className="grid items-center gap-6 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16"
    >
      <div className="max-w-[34rem]">
        <h3 className="font-serif text-[23px] font-semibold leading-snug text-ink-strong sm:text-[26px]">
          {title}
        </h3>
        <div className="mt-3 space-y-3 font-ui text-[17px] leading-relaxed text-ink/80">{children}</div>
      </div>
      {/* The picture repeats what the words beside it say. */}
      <div aria-hidden="true" style={{ contain: "layout paint" } as CSSProperties}>
        {picture(phase)}
      </div>
    </li>
  );
}

export function HowItWorks() {
  return (
    <ol className="divide-y divide-line border-y border-line">
      <Step title="Fifteen questions find your weak spots" picture={(p) => <DiagnosticPicture phase={p} />}>
        <p>
          A free diagnostic asks five questions from each module of the
          syllabus and places you against the 70% pass line. The topics you
          miss are where your plan begins.
        </p>
      </Step>

      <Step
        title="A personal plan, built around them and explained by AI"
        picture={(p) => <PlanPicture phase={p} />}
      >
        <p>
          Topics below 70% get more time the further below they sit. Secure
          topics come back on a spaced schedule, and the final fortnight turns
          into mixed papers.
        </p>
        <p>
          Pinard&rsquo;s AI reads your scores and writes your briefing: where
          to start, and why. Every answer you give moves the plan, so it
          follows you as you improve.
        </p>
      </Step>

      <Step title="Questions from the guidance itself" picture={(p) => <GuidancePicture phase={p} />}>
        <p>
          Every SBA and EMQ is written from a named Green-top Guideline, NICE
          guideline or TOG review. Its explanation cites the passage it relies
          on, and a question whose citation does not check out is discarded
          before anyone sees it.
        </p>
      </Step>

      <Step title="An AI tutor that cites or declines" picture={(p) => <TutorPicture phase={p} />}>
        <p>
          Ask a follow-up and Ask Pinard answers from the same guidance, naming
          its source, or tells you plainly that the sources do not cover it.
        </p>
        <AnswerDisclaimer />
      </Step>

      <Step title="A mock under exam conditions" picture={(p) => <MockPicture phase={p} />}>
        <p>
          Fifty SBAs and fifty EMQs, timed at seventy and a hundred and ten
          minutes as the RCOG recommends, and marked 40% and 60% as the paper
          is. Nothing is revealed until you hand it in, then every answer comes
          back with its reasoning and its guideline.
        </p>
      </Step>
    </ol>
  );
}
