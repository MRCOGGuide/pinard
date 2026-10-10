"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { AnswerDisclaimer } from "@/components/AnswerDisclaimer";
import { barFill, PASS_THRESHOLD } from "@/lib/performance";
import { FULL_PAPER, SECONDS_PER_EMQ, SECONDS_PER_SBA } from "@/lib/mock";
import { FREE_DIAGNOSTIC_MAX } from "@/lib/diagnostic";
import { GradeBar } from "@/components/GradeBar";
import {
  FADE,
  fadeStyle,
  useIsoLayoutEffect,
  useScrollPlay,
  useStages,
  useTyping,
  type Phase,
} from "@/components/scroll";

/**
 * "What Pinard does", as the four steps a candidate goes through, each
 * beside a picture of it happening; and Ask Pinard, the AI assistant,
 * as a section of its own after them (AskPinardFeature).
 *
 * Each step fades in as it reaches the middle of the screen and out as
 * it leaves, and its picture plays from the start every time it comes
 * back (see components/scroll). Score bars grade smoothly from red to
 * blue (GradeBar); the plan's time bars take their topic's band (barFill):
 * red in the first third, amber to 70%, green from there.
 *
 * The figures are an example candidate and say so. The question card in
 * step 3 is a real approved question from the bank (id 4), chosen
 * because it cites two sources.
 *
 * On the AI claims, kept to what the code does: the plan's weighting is
 * a fixed rule (lib/studyPlan.ts), Claude writes the briefing over it
 * from the candidate's scores (lib/narrative.ts), and Ask Pinard is
 * Claude answering from retrieved guidance.
 */

const MOVE = "transition-[transform,opacity] duration-[550ms] ease-out motion-reduce:transition-none";

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
 * Text typed letter by letter without moving anything: every letter is
 * laid out from the start and only its opacity changes, so the box is
 * its final size before the first letter shows. With `caret`, a "|"
 * sits after the last letter typed until the line is finished.
 */
function Typed({ text, typed, caret = false }: { text: string; typed: number; caret?: boolean }) {
  const chars = Array.from(text);
  const typing = caret && typed < chars.length;
  return (
    <>
      {chars.map((c, i) => (
        <Fragment key={i}>
          {typing && i === typed && <Caret />}
          <span style={{ opacity: i < typed ? 1 : 0 }}>{c}</span>
        </Fragment>
      ))}
    </>
  );
}

/** Takes no width, so the letters around it never move. */
function Caret() {
  return (
    <span className="relative inline-block w-0">
      <span className="caret-blink absolute -left-[0.2em] bottom-0 font-light">|</span>
    </span>
  );
}

/** The frame a picture sits in, captioned. */
function Panel({ caption, note, children }: { caption: string; note?: string; children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-6">
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 font-ui text-[14px]">
        <span className="font-semibold text-ink-strong">{caption}</span>
        {note && <span className="text-ink/65">{note}</span>}
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
        <path d="M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z" fill="currentColor" />
      </svg>
      {children}
    </span>
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
/* Step 1: the diagnostic                                              */

/** Five questions per module, so the scores move in fifths. */
const MODULES = [
  { name: "Obstetrics", score: 80 },
  { name: "Gynaecology", score: 60 },
  { name: "Governance", score: 20 },
];

function DiagnosticPicture({ phase }: { phase: Phase }) {
  const stage = useStages(phase, [160, 1040]);
  return (
    <Panel caption="Diagnostic result" note="Example candidate">
      <ul className="space-y-4">
        {MODULES.map((m, i) => {
          const tone = m.score >= 70 ? "text-good" : m.score >= 100 / 3 ? "text-warn" : "text-accent-ink";
          return (
            <li key={m.name} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.75rem] items-center gap-3 font-ui text-[15px]">
              <span className="text-ink">{m.name}</span>
              <span className="relative block">
                <GradeBar percent={stage >= 1 ? m.score : 0} follow delayMs={stage >= 1 ? i * 200 : 0} className="h-3" />
                {/* The pass line, drawn over the track. */}
                <span className="absolute -inset-y-1.5 left-[70%] w-px bg-ink-strong/70" />
              </span>
              <span
                className={`text-right font-semibold tabular-nums ${MOVE} ${tone}`}
                style={{ opacity: stage >= 1 ? 1 : 0, transitionDelay: stage >= 1 ? `${i * 200 + 250}ms` : "0ms" }}
              >
                {m.score}%
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)_2.75rem] gap-3 font-ui text-[13px] text-ink/65">
        <span className="relative col-start-2 h-4">
          <span className="absolute left-[70%] -translate-x-1/2 whitespace-nowrap">Pass line 70%</span>
        </span>
      </p>
      <Arrive on={stage >= 2} className="mt-5 border-t border-line pt-4">
        <p className="font-ui text-[14px] text-ink/65">Missed, so the plan starts here</p>
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

/* ------------------------------------------------------------------ */
/* Step 2: the study plan                                              */

/** A week of the example plan. `minutes` is the time it gets; secure
 *  topics are there for spaced review. */
const TOPICS = [
  { name: "Antenatal care", score: 82, minutes: 20 },
  { name: "Clinical audit", score: 30, minutes: 80 },
  { name: "Consent", score: 55, minutes: 55 },
  { name: "Labour", score: 76, minutes: 25 },
  { name: "Preterm birth", score: 20, minutes: 90 },
];
/** The same topics, most ground to make up first. */
const BY_NEED = [...TOPICS].sort((a, b) => a.score - b.score).map((t) => t.name);
const ROW = 44;

const BRIEFING =
  "68 days to go. Your first weeks front-load preterm birth, clinical audit and consent, where you have the most ground to make up. Antenatal care and labour come back for review about once a week, and the last fortnight turns into mixed papers under exam conditions.";

function PlanPicture({ phase }: { phase: Phase }) {
  const stage = useStages(phase, [560, 1280, 2080]);
  const words = BRIEFING.split(" ");
  const shown = useTyping(phase, words.length, stage >= 3, 70);
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
                  className={`absolute inset-y-0 left-0 w-full origin-left rounded-full ${MOVE} ${barFill(t.score)}`}
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
        <p className="reading mt-2 !text-[16px] text-ink/90">
          {words.map((w, i) => (
            <span
              key={i}
              className="transition-opacity duration-300 ease-out motion-reduce:transition-none"
              style={{ opacity: i < shown ? 1 : 0 }}
            >
              {w}
              {i < words.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3: practise                                                    */

/** Approved question 4, as it stands in the bank. */
const CARD = {
  stem: "A 34-year-old woman with pre-existing type 1 diabetes mellitus attends her booking appointment at 9 weeks of gestation. She did not receive preconception care. Which of the following should be offered at this appointment in addition to routine antenatal care?",
  options: [
    { key: "A", text: "Referral to a joint diabetes and antenatal clinic by 16 weeks of gestation" },
    { key: "B", text: "Review of medicines and clinical history to establish the extent of diabetes-related complications" },
    { key: "C", text: "Routine fetal umbilical artery Doppler recording from 28 weeks" },
    { key: "D", text: "Ultrasound monitoring of fetal growth and amniotic fluid volume every 4 weeks from 20 weeks" },
    { key: "E", text: "Ultrasound scan at 16 weeks to detect fetal structural abnormalities" },
  ],
  correct: "B",
  explanation:
    "At the booking appointment, if a woman with pre-existing diabetes has not received preconception care, the additional steps are to give information, education and advice; take a clinical history to establish the extent of diabetes-related complications, specifically including neuropathy and vascular disease; and review medicines for diabetes and its complications.",
  sources: [
    "Diabetes in pregnancy, management from preconception to the postnatal period. NICE guideline NG3, 2020",
    "Diabetes in pregnancy. NICE quality standard QS109, 2023",
  ],
};


/**
 * The whole card, shrunk to fit its frame, then a move in to full size
 * on the two sources at its foot: the claim of the step is that every question
 * names where it came from, and that is where it says so.
 */
function BankCardPicture({ phase }: { phase: Phase }) {
  const stage = useStages(phase, [2080]);
  const frame = useRef<HTMLDivElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ W: number; H: number; h: number } | null>(null);

  useIsoLayoutEffect(() => {
    const f = frame.current;
    const c = card.current;
    if (!f || !c) return;
    const measure = () => setSize({ W: f.clientWidth, H: f.clientHeight, h: c.offsetHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(f);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  const zoomed = stage >= 1;
  let transform = "none";
  if (size) {
    const { W, H, h } = size;
    const fit = Math.min(1, H / h);
    transform = zoomed
      ? `translate(0px, ${Math.min(0, H - h)}px) scale(1)`
      : `translate(${(W - W * fit) / 2}px, 0px) scale(${fit})`;
  }

  return (
    <Panel caption="A question from the bank" note="Two sources, both cited">
      <div ref={frame} className="relative h-[400px] overflow-hidden rounded-[10px] border border-line bg-ground sm:h-[440px]">
        <div
          ref={card}
          className="absolute left-0 top-0 w-full origin-top-left bg-surface p-5 will-change-transform transition-transform duration-[1200ms] ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none"
          style={{ transform }}
        >
          <p className="flex justify-between gap-3 font-ui text-[13px] text-ink/65">
            <span className="font-semibold text-ink-strong">Single best answer</span>
            <span>Diabetes in pregnancy</span>
          </p>
          <p className="reading mt-3 !text-[16px] text-ink">{CARD.stem}</p>
          <ul className="mt-4 space-y-2">
            {CARD.options.map((o) => {
              const right = o.key === CARD.correct;
              return (
                <li
                  key={o.key}
                  className={`flex items-start gap-3 rounded-[10px] border px-3 py-2.5 font-ui text-[14px] leading-snug ${
                    right ? "border-good bg-good/10" : "border-line opacity-70"
                  }`}
                >
                  <span
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold ${
                      right ? "border-good bg-good text-on-brand" : "border-line text-ink/65"
                    }`}
                  >
                    {o.key}
                  </span>
                  <span className="flex-1 pt-px text-ink">{o.text}</span>
                  {right && <Tick className="mt-0.5 h-4 w-4 shrink-0 text-good" />}
                </li>
              );
            })}
          </ul>
          <p className="mt-5 font-serif text-[20px] font-semibold text-good">Correct.</p>
          <p className="mt-3 font-ui text-[14px] font-semibold text-ink-strong">Explanation</p>
          <p className="reading mt-1 !text-[15px] text-ink/90">{CARD.explanation}</p>
          <div className="mt-5 border-t border-line pt-4">
            <p className="flex items-center gap-2 font-ui text-[14px] font-semibold text-ink-strong">
              Sources
              <span className={`inline-flex items-center gap-1 font-normal text-good ${MOVE}`} style={{ opacity: zoomed ? 1 : 0 }}>
                <Tick className="h-3.5 w-3.5" /> both checked
              </span>
            </p>
            <ol className="mt-1.5 space-y-1.5 font-ui text-[14px] leading-snug text-ink/80">
              {CARD.sources.map((s) => (
                <li key={s} className="border-l-2 border-good/60 pl-3">
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </Panel>
  );
}

const QUESTION = "Previous caesarean, now 36 weeks. What are her chances of a successful VBAC?";
const ANSWER =
  "Overall success for planned VBAC is 72 to 75%. With at least one previous vaginal birth it rises to 85 to 90%, and a previous vaginal birth, particularly a previous VBAC, is the single best predictor.";

/** Asked, then answered, both typed out; only the asking has a caret. */
function TutorPicture({ phase }: { phase: Phase }) {
  const asked = useTyping(phase, QUESTION.length, true, 95);
  const askedAll = asked >= QUESTION.length;
  const stage = useStages(phase, [QUESTION.length * 95 + 700]);
  const answering = askedAll && stage >= 1;
  const answered = useTyping(phase, ANSWER.length, answering, 28);
  return (
    <Panel caption="Ask Pinard">
      <p className="ml-auto w-fit max-w-[85%] rounded-[12px] rounded-br-[4px] bg-brand px-4 py-2.5 font-ui text-[15px] text-on-brand">
        <Typed text={QUESTION} typed={asked} caret />
      </p>
      <div className="mt-4">
        <Arrive on={answering}>
          <AiMark>Pinard, answering from the guidance</AiMark>
        </Arrive>
        <p className="reading mt-2 !text-[16px] text-ink/90">
          <Typed text={ANSWER} typed={answered} />
        </p>
        <Arrive on={answered >= ANSWER.length} className="mt-3 font-ui text-[13px] text-ink/65">
          <span className="font-semibold text-ink/80">Source.</span> Birth after
          Previous Caesarean Birth. RCOG Green-top Guideline No. 45, 2015
        </Arrive>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4: the mock                                                    */

/** Seventy minutes for the SBA paper. */
const SBA_SECONDS = 70 * 60;
/** Where the run-down on arrival stops: ten minutes left. */
const SETTLES_AT = 10 * 60;

function MockPicture({ phase }: { phase: Phase }) {
  const stage = useStages(phase, [160, 3040, 3680]);
  const [left, setLeft] = useState(SETTLES_AT);
  const [hover, setHover] = useState(false);

  // On arrival: seventy minutes run down to ten in under two seconds.
  useEffect(() => {
    if (phase === "still") return setLeft(SETTLES_AT);
    if (phase === "waiting") return setLeft(SBA_SECONDS);
    if (stage < 1) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 2600);
      const eased = 1 - (1 - p) ** 2;
      setLeft(Math.round(SBA_SECONDS - (SBA_SECONDS - SETTLES_AT) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, stage]);

  // Pointed at: the clock runs, a minute every half second, until the
  // pointer leaves or the paper is out of time.
  useEffect(() => {
    if (!hover || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const step = ((now - last) / 1000) * 120;
      if (step >= 1) {
        last = now;
        setLeft((l) => Math.max(0, l - Math.floor(step)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hover]);

  const used = 1 - left / SBA_SECONDS;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <Panel caption="Mock paper" note="Example candidate">
      <div
        className="flex items-center gap-5"
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
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
          <p className="text-[14px] text-ink/65">SBA paper, 50 questions</p>
          <p className="font-serif text-[30px] font-semibold tabular-nums leading-tight text-ink-strong">
            {mm}:{ss}
          </p>
          <p className="text-[14px] text-ink/65">left of 70 minutes</p>
        </div>
      </div>
      <Arrive on={stage >= 2} className="mt-5 border-t border-line pt-4 font-ui text-[15px]">
        <p className="text-ink/65">Handed in. Marked as the paper is</p>
        <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
          <dt className="text-ink">SBAs, 40% of the mark</dt>
          <dd className="text-right tabular-nums text-ink">68%</dd>
          <dt className="text-ink">EMQs, 60% of the mark</dt>
          <dd className="text-right tabular-nums text-ink">74%</dd>
        </dl>
      </Arrive>
      <Arrive on={stage >= 3} className="mt-3 flex items-baseline justify-between gap-4 font-ui">
        <span className="font-semibold text-ink-strong">Overall 71.6%</span>
        <span className="rounded-[6px] bg-good px-3 py-0.5 font-ui text-[18px] font-bold tracking-[0.04em] text-on-brand">
          PASS
        </span>
      </Arrive>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function Step({
  n,
  title,
  children,
  picture,
}: {
  n: number;
  title: string;
  children: ReactNode;
  picture: (phase: Phase) => ReactNode;
}) {
  const [ref, phase, side] = useScrollPlay<HTMLLIElement>();
  return (
    <li
      ref={ref}
      className={`grid items-center gap-6 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16 ${FADE}`}
      style={fadeStyle(phase, side)}
    >
      <div className="max-w-[34rem]">
        <p className="font-ui text-[15px] font-semibold text-good">Step {n}</p>
        <h3 className="mt-1 font-serif text-[26px] font-semibold leading-snug text-ink-strong sm:text-[30px]">
          {title}
        </h3>
        <div className="mt-3 space-y-3 font-ui text-[17px] leading-relaxed text-ink/80">{children}</div>
      </div>
      {/* The pictures repeat what the words beside them say. */}
      <div aria-hidden="true" className="space-y-6">
        {picture(phase)}
      </div>
    </li>
  );
}

/* The mock as the code sets it, so the words cannot drift from the
   paper a candidate actually sits. */
const SBA_MINUTES = Math.round((FULL_PAPER.sba * SECONDS_PER_SBA) / 60);
const EMQ_MINUTES = Math.round((FULL_PAPER.emq * SECONDS_PER_EMQ) / 60);

export function HowItWorks({ sections }: { sections: number }) {
  return (
    <ol className="divide-y divide-line border-t border-line">
      <Step n={1} title="Diagnostic" picture={(p) => <DiagnosticPicture phase={p} />}>
        <p>
          The free sample diagnostic asks {FREE_DIAGNOSTIC_MAX} questions from across
          Pinard&rsquo;s {sections} revision sections, no more than one from any, and places you against a{" "}
          {PASS_THRESHOLD}% pass line. The topics you miss are where your plan begins, and subscribers
          sit the full diagnostic: two single best answers and an EMQ set from every section.
        </p>
      </Step>

      <Step n={2} title="Prepare your study plan" picture={(p) => <PlanPicture phase={p} />}>
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

      <Step n={3} title="Practise" picture={(p) => <BankCardPicture phase={p} />}>
        <p>
          Every SBA and EMQ is written from a named Green-top Guideline, NICE
          guideline or review article, and its explanation cites the passages it
          relies on. A question whose citation does not check out is discarded
          before anyone sees it.
        </p>
      </Step>

      <Step n={4} title="Mock" picture={(p) => <MockPicture phase={p} />}>
        <p>
          {FULL_PAPER.sba} SBAs and {FULL_PAPER.emq} EMQs, timed at{" "}
          {SBA_MINUTES} and {EMQ_MINUTES} minutes as the RCOG recommends, and
          marked 40% and 60% as the paper is. Nothing is revealed until you hand it in, then every answer comes
          back with its reasoning and its guideline.
        </p>
      </Step>
    </ol>
  );
}

/**
 * Ask Pinard, apart from the four steps: it is not a stage of revision
 * but something a candidate can use at any point, with or without a
 * question in front of them (the Ask box on Today, AskLibrary).
 *
 * The claims are the ones the product can stand behind. It is not
 * "trained on" the guidance; it answers from passages retrieved from
 * the library and is held to citing them or declining. It is not
 * promised never to be wrong, which no AI can promise; it is promised
 * to say so when the sources do not cover a question rather than guess.
 */
export function AskPinardFeature() {
  const [ref, phase, side] = useScrollPlay<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16 ${FADE}`}
      style={fadeStyle(phase, side)}
    >
      <div className="max-w-[34rem]">
        <AiMark>AI assistant</AiMark>
        <h2 className="mt-2 font-serif text-[28px] font-semibold leading-tight text-ink-strong sm:text-[34px]">
          Ask Pinard
        </h2>
        <p className="mt-3 font-ui text-[18px] leading-relaxed text-ink/80">
          Ask about any topic or clinical scenario on the syllabus and get a
          short, sourced answer, whether or not you are practising questions
          at the time.
        </p>
        <ul className="mt-5 space-y-3 font-ui text-[17px] leading-snug text-ink/85">
          {[
            "Answers only from trusted sources: the guidelines and review articles in Pinard's library",
            "Names the guideline behind every answer, so you can check it",
            "Tells you plainly when the sources do not cover your question, rather than guessing",
          ].map((t) => (
            <li key={t} className="flex gap-3">
              <Tick className="mt-1 h-4 w-4 shrink-0 text-good" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <AnswerDisclaimer className="mt-5" />
      </div>
      <div aria-hidden="true">
        <TutorPicture phase={phase} />
      </div>
    </div>
  );
}
