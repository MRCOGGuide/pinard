"use client";

import { useRef, useState, type ReactNode } from "react";
import { GRADE_GRADIENT } from "@/components/GradeBar";
import { FREE_DIAGNOSTIC_MAX } from "@/lib/diagnostic";
import { FULL_PAPER, SECONDS_PER_EMQ, SECONDS_PER_SBA } from "@/lib/mock";
import { PASS_THRESHOLD, barFill } from "@/lib/performance";
import { weightedSessionAllocation, type PlanUnit } from "@/lib/studyPlan";
import { Words } from "./Words";
import {
  SETTLE,
  Spring,
  clamp01,
  pointerDrag,
  reducedMotion,
  rubberband,
  useIsoLayoutEffect,
  useScrub,
} from "./motion";

/**
 * "What Pinard does": the four steps a candidate goes through.
 *
 * On a laptop each step is held on screen for a stretch of scrolling
 * while its picture plays; on a phone the picture sits under the words.
 * Either way the picture has no timer. Its position in the story is
 * read from the scroll (--p, 0 to 1) and most of it is worked out in CSS
 * from that one number, so it can be paused by stopping, rewound by
 * scrolling back, and is never found blank part-way through a countdown.
 *
 * The figures are an example candidate and say so.
 */

const PIN = "(min-width: 1024px) and (min-height: 640px)";

/** A part of the 0 to 1 story, as its own 0 to 1. */
const seg = (p: number, from: number, to: number) => clamp01((p - from) / (to - from));

function pictureRange(el: HTMLElement, vh: number): number {
  const step = el.closest("[data-step]");
  if (step && window.matchMedia(PIN).matches) {
    const box = step.getBoundingClientRect();
    const held = box.height - vh;
    return (vh * 0.4 - box.top) / (vh * 0.4 + held * 0.92);
  }
  return (vh * 0.92 - el.getBoundingClientRect().top) / (vh * 0.62);
}

function usePicture(onFrame?: (p: number) => void) {
  return useScrub<HTMLDivElement>(pictureRange, (p, el) => {
    el.style.setProperty("--p", p.toFixed(4));
    onFrame?.(p);
  });
}

function Caption({ title, note }: { title: string; note?: string }) {
  return (
    <p className="flex flex-wrap items-baseline justify-between gap-x-4 font-ui text-[0.875rem]">
      <span className="font-semibold text-ink-strong">{title}</span>
      {note && <span className="text-ink/65">{note}</span>}
    </p>
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

const MODULES = [
  { name: "Obstetrics", score: 80 },
  { name: "Gynaecology", score: 60 },
  { name: "Governance", score: 20 },
];

function DiagnosticPicture() {
  const figures = useRef<(HTMLSpanElement | null)[]>([]);
  const ref = usePicture((p) => {
    MODULES.forEach((m, i) => {
      const el = figures.current[i];
      if (el) el.textContent = `${Math.round(m.score * seg(p, 0.06 + i * 0.07, 0.46 + i * 0.07))}%`;
    });
  });
  return (
    <div ref={ref} className="pl-panel pl-pic">
      <Caption title="Diagnostic result" note="Example candidate" />
      <ul className="mt-5 space-y-4">
        {MODULES.map((m, i) => {
          const tone = m.score >= 70 ? "text-good" : m.score >= 100 / 3 ? "text-warn" : "text-accent-ink";
          return (
            <li key={m.name} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.75rem] items-center gap-3 font-ui text-[0.9375rem]">
              <span className="text-ink">{m.name}</span>
              <span className="relative block">
                <span className="pl-bar" style={{ ["--s" as string]: m.score, ["--i" as string]: i }}>
                  <span className="absolute inset-0" style={{ backgroundImage: GRADE_GRADIENT }} />
                  <span className="pl-bar-cover" />
                </span>
                <span className="absolute -inset-y-1.5 left-[70%] w-px bg-ink-strong/70" />
              </span>
              <span
                ref={(el) => {
                  figures.current[i] = el;
                }}
                className={`text-right font-semibold tabular-nums ${tone}`}
              >
                {m.score}%
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)_2.75rem] gap-3 font-ui text-[0.8125rem] text-ink/65">
        <span className="relative col-start-2 h-4">
          <span className="absolute left-[70%] -translate-x-1/2 whitespace-nowrap">Pass line 70%</span>
        </span>
      </p>
      <div className="pl-arrive mt-5 border-t border-line pt-4" style={{ ["--from" as string]: 0.62 }}>
        <p className="font-ui text-[0.875rem] text-ink/65">Missed, so the plan starts here</p>
        <p className="mt-2 flex flex-wrap gap-2">
          {["Preterm birth", "Ovarian masses", "Consent", "Clinical audit"].map((t) => (
            <span key={t} className="rounded-full bg-accent/10 px-3 py-1 font-ui text-[0.875rem] text-accent-ink">
              {t}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2: the plan, which can be handled                              */

const TOPICS = [
  { name: "Antenatal care", score: 82 },
  { name: "Clinical audit", score: 30 },
  { name: "Consent", score: 55 },
  { name: "Labour", score: 76 },
  { name: "Preterm birth", score: 20 },
];
const START = TOPICS.map((t) => t.score);

/** The size of a daily session (DAILY_SIZE, lib/session). */
const SESSION = 10;

/** The rule the app itself uses to divide a session, not a copy of it. */
function share(scores: number[]): number[] {
  const units = TOPICS.map(
    (t, i): PlanUnit => ({ section_id: i, title: t.name, band: "weak", accuracy: scores[i], priority: 1 })
  );
  const out = weightedSessionAllocation(units, SESSION);
  return TOPICS.map((_, i) => out.find((a) => a.section_id === i)?.count ?? 0);
}

/** Each topic's row, most ground to make up first. */
function slotsByNeed(scores: number[]): number[] {
  const order = TOPICS.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  return TOPICS.map((_, i) => order.indexOf(i));
}

const FIRST_SLOTS = slotsByNeed(START);

const BRIEFING =
  "68 days to go. Your first weeks front-load preterm birth, clinical audit and consent, where you have the most ground to make up. Antenatal care and labour come back for review about once a week, and the last fortnight turns into mixed papers under exam conditions.";

function PlanPicture() {
  const [scores, setScores] = useState(START);
  /** The same scores, for handlers that run between renders. */
  const live = useRef(START);
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const springs = useRef<Spring[]>([]);
  const sorted = useRef(true);
  const first = useRef(true);

  useIsoLayoutEffect(() => {
    springs.current = TOPICS.map(
      (_, i) =>
        new Spring(FIRST_SLOTS[i], SETTLE, (y) => {
          rows.current[i]?.style.setProperty("--y", y.toFixed(3));
        })
    );
    return () => springs.current.forEach((s) => s.stop());
  }, []);

  /** Rows head for their places from wherever they are, so a change
   *  made while they are still moving simply turns them. */
  function place(instant = false) {
    const slots = sorted.current ? slotsByNeed(live.current) : TOPICS.map((_, i) => i);
    slots.forEach((slot, i) => {
      const s = springs.current[i];
      if (!s) return;
      if (instant || reducedMotion()) {
        s.set(slot);
        rows.current[i]?.style.setProperty("--y", String(slot));
      } else {
        s.to(slot);
      }
    });
  }

  const ref = usePicture((p) => {
    const want = p >= 0.34;
    if (want === sorted.current && !first.current) return;
    sorted.current = want;
    place(first.current);
    first.current = false;
  });

  function setScore(i: number, value: number) {
    const next = [...live.current];
    next[i] = value;
    live.current = next;
    setScores(next);
  }

  function grab(e: React.PointerEvent<HTMLDivElement>, i: number) {
    const box = e.currentTarget.getBoundingClientRect();
    const row = rows.current[i];
    if (!row) return;
    e.preventDefault();
    row.dataset.held = "true";

    // On the thumb it keeps the offset it was grabbed at; elsewhere on
    // the line it comes to the finger.
    const now = live.current[i];
    const onThumb = Math.abs(e.clientX - (box.left + (box.width * now) / 100)) < 28;
    const start = onThumb ? now : clamp01((e.clientX - box.left) / box.width) * 100;
    setScore(i, Math.round(start));

    let over = 0;
    pointerDrag(e, {
      onMove: (dx) => {
        const raw = start + (dx / box.width) * 100;
        const held = Math.max(0, Math.min(100, raw));
        over = rubberband(((raw - held) / 100) * box.width, 48);
        row.style.setProperty("--o", `${over.toFixed(1)}px`);
        setScore(i, Math.round(held));
      },
      onEnd: () => {
        delete row.dataset.held;
        // Rows stay put under the finger and take their new places on
        // release: a row that jumped away mid-drag would break the hold.
        place();
        if (over === 0 || reducedMotion()) {
          row.style.setProperty("--o", "0px");
          return;
        }
        new Spring(over, SETTLE, (v) => row.style.setProperty("--o", `${v.toFixed(1)}px`)).to(0);
      },
    });
  }

  function keys(e: React.KeyboardEvent, i: number) {
    const now = live.current[i];
    const to =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? now + 5
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? now - 5
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? 100
              : null;
    if (to === null) return;
    e.preventDefault();
    setScore(i, Math.max(0, Math.min(100, to)));
    place();
  }

  function reset() {
    live.current = START;
    setScores(START);
    place();
  }

  const counts = share(scores);
  const changed = scores.some((s, i) => s !== START[i]);

  return (
    <div ref={ref} className="pl-panel pl-pic pl-plan">
      <Caption title={`A ${SESSION}-question session`} note="Example candidate" />
      <ol className="pl-plan-rows mt-4" style={{ ["--rows" as string]: TOPICS.length }}>
        {TOPICS.map((t, i) => {
          const score = scores[i];
          return (
            <li
              key={t.name}
              ref={(el) => {
                rows.current[i] = el;
              }}
              className="pl-plan-row"
              style={{ ["--y" as string]: FIRST_SLOTS[i] }}
            >
              <p className="flex items-baseline justify-between gap-3 font-ui text-[0.9375rem]">
                <span className="truncate text-ink">
                  {t.name} <span className="tabular-nums text-ink/60">{score}%</span>
                </span>
                <span className="pl-plan-count tabular-nums text-ink/70">
                  {score >= PASS_THRESHOLD ? "Review" : `${counts[i]} of ${SESSION}`}
                </span>
              </p>
              <div
                className="pl-plan-track"
                style={{ ["--score" as string]: score }}
                role="slider"
                tabIndex={0}
                aria-label={`${t.name} score`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={score}
                aria-valuetext={`${score}%, ${counts[i]} of ${SESSION} questions`}
                onPointerDown={(e) => grab(e, i)}
                onKeyDown={(e) => keys(e, i)}
              >
                <span className="pl-plan-rail">
                  <span className={`pl-plan-fill ${barFill(score)}`} />
                </span>
                <span className="pl-plan-pass" />
                <span className="pl-plan-thumb" />
              </div>
            </li>
          );
        })}
      </ol>
      <p className="pl-arrive mt-1 font-ui text-[0.8125rem] text-ink/65" style={{ ["--from" as string]: 0.84 }}>
        Drag a score to see the session change.
      </p>
      <div className="pl-swap mt-3 border-t border-line pt-4">
        <div data-on={!changed || undefined}>
          <p className="inline-flex items-center gap-1.5 font-ui text-[0.8125rem] font-semibold text-good">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z" fill="currentColor" />
            </svg>
            Your briefing, written by AI
          </p>
          <p className="reading mt-2 !text-[1rem] !leading-[1.55] text-ink/90">
            <Words text={BRIEFING} over="--b" />
          </p>
        </div>
        <div data-on={changed || undefined}>
          <p className="font-ui text-[1rem] leading-[1.5] text-ink/90">
            The further a topic sits below {PASS_THRESHOLD}%, the more of the session it gets. Topics
            at {PASS_THRESHOLD}% or above stay in for review. This is the rule Pinard uses, and in
            Pinard your own answers move the scores.
          </p>
          <button
            type="button"
            onClick={reset}
            tabIndex={changed ? 0 : -1}
            className="mt-3 font-ui text-[0.9375rem] font-semibold text-good underline decoration-good/40 underline-offset-4 hover:decoration-good"
          >
            Put the example back
          </button>
        </div>
      </div>
    </div>
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

/** The whole card shrunk to fit, then a move in on the two sources at
 *  its foot, as far as the reader has scrolled. */
function BankPicture() {
  const frame = useRef<HTMLDivElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const size = useRef({ W: 0, H: 0, h: 0 });
  const last = useRef(1);

  function paint(p: number) {
    const el = card.current;
    const { W, H, h } = size.current;
    if (!el || !h) return;
    const z = seg(p, 0.28, 0.82);
    const fit = Math.min(1, H / h);
    const scale = fit + (1 - fit) * z;
    const x = ((W - W * fit) / 2) * (1 - z);
    const y = Math.min(0, H - h) * z;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(4)})`;
    el.style.setProperty("--z", z.toFixed(3));
  }

  const ref = usePicture((p) => {
    last.current = p;
    paint(p);
  });

  useIsoLayoutEffect(() => {
    const f = frame.current;
    const c = card.current;
    if (!f || !c) return;
    const measure = () => {
      size.current = { W: f.clientWidth, H: f.clientHeight, h: c.offsetHeight };
      paint(last.current);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(f);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="pl-panel pl-pic">
      <Caption title="A question from the bank" note="Two sources, both cited" />
      <div ref={frame} className="relative mt-4 h-[25rem] overflow-hidden rounded-[0.75rem] border border-line bg-ground sm:h-[27.5rem]">
        <div ref={card} className="absolute left-0 top-0 w-full origin-top-left bg-surface p-5 will-change-transform">
          <p className="flex justify-between gap-3 font-ui text-[0.8125rem] text-ink/65">
            <span className="font-semibold text-ink-strong">Single best answer</span>
            <span>Diabetes in pregnancy</span>
          </p>
          <p className="reading mt-3 !text-[1rem] text-ink">{CARD.stem}</p>
          <ul className="mt-4 space-y-2">
            {CARD.options.map((o) => {
              const right = o.key === CARD.correct;
              return (
                <li
                  key={o.key}
                  className={`flex items-start gap-3 rounded-[0.75rem] border px-3 py-2.5 font-ui text-[0.875rem] leading-snug ${
                    right ? "border-good bg-good/10" : "border-line opacity-70"
                  }`}
                >
                  <span
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-[0.75rem] font-semibold ${
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
          <p className="mt-5 font-serif text-[1.25rem] font-semibold text-good">Correct.</p>
          <p className="mt-3 font-ui text-[0.875rem] font-semibold text-ink-strong">Explanation</p>
          <p className="reading mt-1 !text-[0.9375rem] text-ink/90">{CARD.explanation}</p>
          <div className="mt-5 border-t border-line pt-4">
            <p className="flex items-center gap-2 font-ui text-[0.875rem] font-semibold text-ink-strong">
              Sources
              <span className="pl-checked inline-flex items-center gap-1 font-normal text-good">
                <Tick className="h-3.5 w-3.5" /> both checked
              </span>
            </p>
            <ol className="mt-1.5 space-y-1.5 font-ui text-[0.875rem] leading-snug text-ink/80">
              {CARD.sources.map((s) => (
                <li key={s} className="border-l-2 border-good/60 pl-3">
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4: the mock                                                    */

const SBA_MINUTES = Math.round((FULL_PAPER.sba * SECONDS_PER_SBA) / 60);
const EMQ_MINUTES = Math.round((FULL_PAPER.emq * SECONDS_PER_EMQ) / 60);
const SBA_SECONDS = SBA_MINUTES * 60;
const SETTLES_AT = 10 * 60;

function MockPicture() {
  const clock = useRef<HTMLParagraphElement | null>(null);
  const hand = useRef<SVGLineElement | null>(null);

  const ref = usePicture((p) => {
    const left = Math.round(SBA_SECONDS - (SBA_SECONDS - SETTLES_AT) * seg(p, 0.04, 0.6));
    if (clock.current) {
      clock.current.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    }
    if (hand.current) hand.current.style.transform = `rotate(${(1 - left / SBA_SECONDS) * 360}deg)`;
  });

  return (
    <div ref={ref} className="pl-panel pl-pic">
      <Caption title="Mock paper" note="Example candidate" />
      <div className="mt-4 flex items-center gap-5">
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
            ref={hand}
            x1="32"
            y1="32"
            x2="32"
            y2="11"
            stroke="rgb(var(--c-accent))"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ transform: `rotate(${(1 - SETTLES_AT / SBA_SECONDS) * 360}deg)`, transformOrigin: "32px 32px" }}
          />
          <circle cx="32" cy="32" r="2.5" fill="rgb(var(--c-ink-strong))" />
        </svg>
        <div className="font-ui">
          <p className="text-[0.875rem] text-ink/65">SBA paper, {FULL_PAPER.sba} questions</p>
          <p ref={clock} className="font-serif text-[1.875rem] font-semibold tabular-nums leading-tight text-ink-strong">
            10:00
          </p>
          <p className="text-[0.875rem] text-ink/65">left of {SBA_MINUTES} minutes</p>
        </div>
      </div>
      <div className="pl-arrive mt-5 border-t border-line pt-4 font-ui text-[0.9375rem]" style={{ ["--from" as string]: 0.64 }}>
        <p className="text-ink/65">Handed in. Marked as the paper is</p>
        <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
          <dt className="text-ink">SBAs, 40% of the mark</dt>
          <dd className="text-right tabular-nums text-ink">68%</dd>
          <dt className="text-ink">EMQs, 60% of the mark</dt>
          <dd className="text-right tabular-nums text-ink">74%</dd>
        </dl>
      </div>
      <div className="pl-arrive mt-3 flex items-baseline justify-between gap-4 font-ui" style={{ ["--from" as string]: 0.8 }}>
        <span className="font-semibold text-ink-strong">Overall 71.6%</span>
        <span className="rounded-[6px] bg-good px-3 py-0.5 font-ui text-[1.125rem] font-bold tracking-[0.04em] text-on-brand">
          PASS
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Step({
  n,
  title,
  children,
  picture,
  handled = false,
}: {
  n: number;
  title: string;
  children: ReactNode;
  picture: ReactNode;
  /** The picture can be operated, so it is not hidden from a screen reader. */
  handled?: boolean;
}) {
  return (
    <li data-step="" className="pl-step">
      <div className="pl-step-hold">
        <div className="pl-step-grid">
          <div className="max-w-[34rem]">
            <p className="pl-eyebrow">Step {n}</p>
            <h3 className="pl-subheading mt-1.5">{title}</h3>
            <div className="pl-body mt-4 space-y-3">{children}</div>
          </div>
          {/* The other pictures repeat what the words beside them say. */}
          <div aria-hidden={handled ? undefined : true}>{picture}</div>
        </div>
      </div>
    </li>
  );
}

export function Steps({ sections }: { sections: number }) {
  return (
    <ol className="pl-steps">
      <Step n={1} title="Diagnostic" picture={<DiagnosticPicture />}>
        <p>
          The free sample diagnostic asks {FREE_DIAGNOSTIC_MAX} questions from across Pinard&rsquo;s{" "}
          {sections} revision sections, a single best answer or a pair of EMQ scenarios from each
          it covers, and places you against a {PASS_THRESHOLD}% pass line. The topics you miss are where your plan begins, and
          subscribers sit the full diagnostic: two single best answers and an EMQ set from every
          section.
        </p>
      </Step>

      <Step n={2} title="Prepare your study plan" picture={<PlanPicture />} handled>
        <p>
          Topics below 70% get more time the further below they sit. Secure topics come back on a
          spaced schedule, and the final fortnight turns into mixed papers.
        </p>
        <p>
          Pinard&rsquo;s AI reads your scores and writes your briefing: where to start, and why.
          Every answer you give moves the plan, so it follows you as you improve.
        </p>
      </Step>

      <Step n={3} title="Practise" picture={<BankPicture />}>
        <p>
          Every SBA and EMQ is written from a named Green-top Guideline, NICE guideline or review
          article, and its explanation cites the passages it relies on. A question whose citation
          does not check out is discarded before anyone sees it.
        </p>
      </Step>

      <Step n={4} title="Mock" picture={<MockPicture />}>
        <p>
          {FULL_PAPER.sba} SBAs and {FULL_PAPER.emq} EMQs, timed at {SBA_MINUTES} and {EMQ_MINUTES}{" "}
          minutes as the RCOG recommends, and marked 40% and 60% as the paper is. Nothing is
          revealed until you hand it in, then every answer comes back with its reasoning and its
          guideline.
        </p>
      </Step>
    </ol>
  );
}
