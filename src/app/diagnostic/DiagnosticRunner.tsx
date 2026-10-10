"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionQuestion } from "@/lib/session";
import { groupIntoItems, itemSize, type QuestionItem } from "@/lib/emq";
import { formatMinutes, timeEstimate } from "@/lib/diagnostic";
import { recordAnswer } from "@/app/session/actions";
import { completeDiagnostic, loadDiagnosticQuestions } from "./actions";
import { LeadIn } from "@/components/LeadIn";
import { GradeBar } from "@/components/GradeBar";
import { Confirm } from "@/components/ui/Confirm";

/**
 * Screening-style runner: answers are recorded silently (no per-question
 * feedback), then the topic map is revealed at the end.
 *
 * EMQ sets are presented whole — lead-in, shared option list, then every
 * scenario — because a scenario shown on its own with ten options is an
 * SBA, not the format the exam uses.
 *
 * Before the first question, a dialog says how long it should take: one
 * to two minutes a question (owner's request, 10 October 2026). The full
 * diagnostic runs to hours, so the place is saved on this device after
 * every item, and coming back offers to carry on. What is saved is the
 * question list and how far through it the candidate is, never answers:
 * those are already recorded on the server.
 */
type Saved = { sessionId: string; ids: number[]; index: number; savedAt: number };
const RESUME_DAYS = 14;
/** Answers before a free candidate may see their results so far. */
const RESULTS_SO_FAR_AFTER = 20;

function readSaved(key: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    const fresh = Date.now() - saved.savedAt < RESUME_DAYS * 86_400_000;
    const valid =
      Array.isArray(saved.ids) && saved.ids.length > 0 && saved.index > 0 && typeof saved.sessionId === "string";
    return fresh && valid ? saved : null;
  } catch {
    return null;
  }
}

function writeSaved(key: string, saved: Saved | null) {
  try {
    if (saved) window.localStorage.setItem(key, JSON.stringify(saved));
    else window.localStorage.removeItem(key);
  } catch {
    // Private windows and blocked storage: the sitting still works, it
    // just cannot be resumed.
  }
}

export function DiagnosticRunner({
  questions: initial,
  mode,
  userId,
}: {
  questions: SessionQuestion[];
  mode: "free" | "full";
  userId: string;
}) {
  const router = useRouter();
  const storageKey = `pinard-diagnostic:${userId}:${mode}`;
  const sessionId = useRef(crypto.randomUUID());
  const startedAt = useRef(Date.now());
  const [questions, setQuestions] = useState(initial);
  const items = useMemo(() => groupIntoItems(questions), [questions]);
  const [index, setIndex] = useState(0);
  /* Nothing is asked until the candidate has seen how long it takes, or
     chosen to carry on from a saved place. */
  const [stage, setStage] = useState<"loading" | "intro" | "resume" | "running">("loading");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [resuming, setResuming] = useState(false);
  const estimate = useMemo(() => timeEstimate(initial), [initial]);

  useEffect(() => {
    const found = readSaved(storageKey);
    setSaved(found);
    setStage(found ? "resume" : "intro");
  }, [storageKey]);

  async function carryOn() {
    if (!saved) return;
    setResuming(true);
    const sameList =
      saved.ids.length === initial.length && saved.ids.every((id, n) => initial[n]?.id === id);
    const list = sameList ? initial : await loadDiagnosticQuestions(saved.ids);
    setResuming(false);
    // The saved place counts items, so it holds only if the list came back whole.
    const place = groupIntoItems(list).length;
    if (list.length !== saved.ids.length || saved.index >= place) {
      startAgain();
      return;
    }
    setQuestions(list);
    sessionId.current = saved.sessionId;
    setIndex(saved.index);
    startedAt.current = Date.now();
    setStage("running");
  }

  function startAgain() {
    writeSaved(storageKey, null);
    setSaved(null);
    setStage("intro");
  }
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Leaving is one tap away so a diagnostic started by mistake is not a
     trap, and one question away from happening by accident. */
  const [leaving, setLeaving] = useState(false);

  const item = items[index];
  const answeredBefore = items
    .slice(0, index)
    .reduce((n, it) => n + itemSize(it), 0);
  const progress = Math.round((answeredBefore / questions.length) * 100);

  /** Record one item's answers, then move on (or finish). */
  async function record(picks: { question: SessionQuestion; key: string }[]) {
    if (saving || finishing) return;
    setSaving(true);
    setError(null);
    const seconds = (Date.now() - startedAt.current) / 1000 / picks.length;

    const results = await Promise.all(
      picks.map((p) =>
        recordAnswer({
          questionId: p.question.id,
          chosenKey: p.key,
          secondsTaken: seconds,
          sessionId: sessionId.current,
        })
      )
    );
    setSaving(false);

    const failed = results.find((r) => r.error);
    if (failed) {
      setError(failed.error ?? "Could not save your answer");
      return;
    }

    if (index + 1 < items.length) {
      writeSaved(storageKey, {
        sessionId: sessionId.current,
        ids: questions.map((q) => q.id),
        index: index + 1,
        savedAt: Date.now(),
      });
      setIndex(index + 1);
      startedAt.current = Date.now();
    } else {
      setFinishing(true);
      writeSaved(storageKey, null);
      await completeDiagnostic();
      /*
        The results screen is about THIS sitting, not about everything
        the account has ever answered, so it is told which one. Without
        it a free diagnostic would be summarised from rolling topic
        performance, which is the same few answers smeared across a
        measure built for hundreds.
      */
      router.push(`/diagnostic/results?s=${sessionId.current}`);
      router.refresh();
    }
  }

  /**
   * A single question advances on the tap, as it always has — adding a
   * confirm step to every SBA would slow a 50-question diagnostic down.
   * A set collects its answers and waits for "Submit set".
   */
  function pick(question: SessionQuestion, key: string) {
    if (item.kind === "single") {
      void record([{ question, key }]);
      return;
    }
    setAnswers((a) => ({ ...a, [question.id]: key }));
  }

  if (stage !== "running") {
    const answered = saved
      ? groupIntoItems(initial.length === saved.ids.length ? initial : questions)
          .slice(0, saved.index)
          .reduce((n, it) => n + itemSize(it), 0)
      : 0;
    return (
      <>
        <div className="rounded-card border border-line bg-surface p-6 shadow-card" aria-busy={stage === "loading"}>
          <p className="font-ui text-[16px] leading-relaxed text-ink/80">
            {estimate.questions} questions, about {formatMinutes(estimate.minMinutes)} to{" "}
            {formatMinutes(estimate.maxMinutes)}.
          </p>
        </div>
        <Confirm
          open={stage === "intro"}
          title="Before you start"
          confirmLabel="Start the diagnostic"
          cancelLabel="Not now"
          onConfirm={() => {
            startedAt.current = Date.now();
            setStage("running");
          }}
          onCancel={() => router.push("/")}
        >
          <p>
            {estimate.questions} questions: {estimate.sbas} single best answer
            {estimate.sbas === 1 ? "" : "s"}
            {estimate.emqSets > 0 &&
              (estimate.emqSets === estimate.emqScenarios
                ? ` and ${estimate.emqScenarios} extended matching question${estimate.emqScenarios === 1 ? "" : "s"}`
                : ` and ${estimate.emqScenarios} EMQ scenarios in ${estimate.emqSets} set${estimate.emqSets === 1 ? "" : "s"}`)}
            .
          </p>
          <p className="mt-2">
            Allow about {formatMinutes(estimate.minMinutes)} to {formatMinutes(estimate.maxMinutes)}: one to two
            minutes a question. There is no feedback until the end.
          </p>
          <p className="mt-2">
            Your place is saved on this device after every answer, so you can stop and carry on later.
          </p>
        </Confirm>
        <Confirm
          open={stage === "resume"}
          title="Carry on where you left off?"
          confirmLabel="Carry on"
          cancelLabel="Start again"
          busy={resuming}
          onConfirm={() => void carryOn()}
          onCancel={startAgain}
        >
          You have answered {answered} of {saved?.ids.length ?? estimate.questions} questions in this
          diagnostic, and those answers are saved.
        </Confirm>
      </>
    );
  }

  if (finishing) {
    return (
      <div className="rounded-card border border-line bg-surface p-6 text-center shadow-card">
        <p className="text-sm text-ink/70">Mapping your topics…</p>
      </div>
    );
  }

  const size = itemSize(item);
  const counter =
    size === 1
      ? `${answeredBefore + 1} / ${questions.length}`
      : `${answeredBefore + 1}–${answeredBefore + size} / ${questions.length}`;
  const sectionTitle =
    item.kind === "single"
      ? item.question.section_title
      : item.scenarios[0].section_title;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setLeaving(true)}
          className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-full px-3 font-ui text-[15px] font-medium text-ink/70 hover:bg-sunk hover:text-ink-strong"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Leave the diagnostic
        </button>
        {/* The free sample's results, early: the plan preview is where a
            free candidate decides, and not everyone stays to the last
            question. The place stays saved, so they can come back and
            finish (owner's decision, 10 October 2026). */}
        {mode === "free" && answeredBefore >= RESULTS_SO_FAR_AFTER && (
          <button
            type="button"
            onClick={() => router.push(`/diagnostic/results?s=${sessionId.current}`)}
            className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
          >
            See my results so far
          </button>
        )}
      </div>
      <Confirm
        open={leaving}
        title="Leave the diagnostic?"
        confirmLabel="Leave"
        cancelLabel="Keep going"
        destructive
        onConfirm={() => router.push("/")}
        onCancel={() => setLeaving(false)}
      >
        Your answers so far are saved, and so is your place on this device:
        open the diagnostic again from Today to carry on. It is marked when
        you finish it.
      </Confirm>
      <div className="mb-3">
        <div className="flex items-center justify-between font-ui text-[15px] text-ink/65">
          <span className="tabular-nums">{counter}</span>
          <span className="text-[14px]">{sectionTitle}</span>
        </div>
        <GradeBar percent={progress} follow className="mt-2 h-1" label="Progress through the diagnostic" />
      </div>

      <article className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        {item.kind === "single" ? (
          <SingleBody
            question={item.question}
            chosen={answers[item.question.id] ?? null}
            saving={saving}
            onChoose={(key) => pick(item.question, key)}
          />
        ) : (
          <SetBody
            item={item}
            answers={answers}
            saving={saving}
            onChoose={pick}
          />
        )}

        {error && <p className="mt-3 font-ui text-[15px] text-accent-ink">{error}</p>}
        {item.kind === "single" && saving && (
          <p className="mt-3 font-ui text-[14px] text-ink/65">Recording…</p>
        )}

        {item.kind === "emq_set" && (
          <SubmitBar
            scenarios={item.scenarios}
            answers={answers}
            saving={saving}
            isLast={index + 1 >= items.length}
            onSubmit={record}
          />
        )}
      </article>
    </div>
  );
}

function SingleBody({
  question,
  chosen,
  saving,
  onChoose,
}: {
  question: SessionQuestion;
  chosen: string | null;
  saving: boolean;
  onChoose: (key: string) => void;
}) {
  return (
    <>
      {question.lead_in && (
        <LeadIn text={question.lead_in} className="text-sm italic text-ink/70" />
      )}
      <p className="mt-2 whitespace-pre-wrap font-display text-reading leading-relaxed text-ink">
        {question.stem}
      </p>
      <Options
        options={question.options}
        chosen={chosen}
        saving={saving}
        onChoose={onChoose}
      />
    </>
  );
}

function SetBody({
  item,
  answers,
  saving,
  onChoose,
}: {
  item: Extract<QuestionItem<SessionQuestion>, { kind: "emq_set" }>;
  answers: Record<number, string>;
  saving: boolean;
  onChoose: (question: SessionQuestion, key: string) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-line px-2 py-0.5 font-ui text-label font-medium text-ink/65">
          EMQ set
        </span>
        <span className="font-mono text-label text-good">
          {item.scenarios.length} scenarios sharing one option list
        </span>
      </div>

      {item.leadIn && (
        <LeadIn
          text={item.leadIn}
          className="mt-3 whitespace-pre-wrap font-ui text-[16px] leading-relaxed text-ink/80"
        />
      )}

      {/* Laid out as the paper is: one option list, then the scenarios
          under it. The lead-in no longer names a direction, because a
          practice session shows one scenario with its options beneath. */}
      <ol className="mt-4 space-y-1 rounded-card border border-line bg-raised/60 p-4">
        {item.options.map((o) => (
          <li key={o.key} className="flex gap-2.5 text-sm text-ink/85">
            <span className="font-mono text-xs leading-5 text-ink/65">
              {o.key}
            </span>
            <span>{o.text}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5 space-y-5">
        {item.scenarios.map((s, n) => (
          <div key={s.id} className="border-t border-line pt-4">
            <p className="font-ui text-[14px] font-semibold text-good">
              Scenario {n + 1} of {item.scenarios.length}
            </p>
            <p className="mt-2 whitespace-pre-wrap font-display text-reading leading-relaxed text-ink">
              {s.stem}
            </p>
            <Options
              options={s.options}
              chosen={answers[s.id] ?? null}
              saving={saving}
              compact
              onChoose={(key) => onChoose(s, key)}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function Options({
  options,
  chosen,
  saving,
  compact = false,
  onChoose,
}: {
  options: SessionQuestion["options"];
  chosen: string | null;
  saving: boolean;
  compact?: boolean;
  onChoose: (key: string) => void;
}) {
  return (
    <ul className={compact ? "mt-3 space-y-1.5" : "mt-5 space-y-2"}>
      {options.map((o) => (
        <li key={o.key}>
          <button
            type="button"
            disabled={saving}
            onClick={() => onChoose(o.key)}
            className={`flex w-full gap-3 rounded-card border px-4 py-3 text-left text-sm transition-colors disabled:opacity-60 ${
              chosen === o.key
                ? "border-good bg-sunk"
                : "border-line bg-raised hover:border-good hover:bg-sunk"
            }`}
          >
            <span className="font-mono text-xs leading-5 text-ink/65">
              {o.key}
            </span>
            <span className="text-ink">{o.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SubmitBar({
  scenarios,
  answers,
  saving,
  isLast,
  onSubmit,
}: {
  scenarios: SessionQuestion[];
  answers: Record<number, string>;
  saving: boolean;
  isLast: boolean;
  onSubmit: (picks: { question: SessionQuestion; key: string }[]) => void;
}) {
  const answeredAll = scenarios.every((s) => answers[s.id]);
  const label = saving
    ? "Recording…"
    : !answeredAll
      ? `Answer all ${scenarios.length} scenarios`
      : isLast
        ? "Finish diagnostic"
        : "Submit set";

  return (
    <button
      type="button"
      onClick={() =>
        onSubmit(scenarios.map((s) => ({ question: s, key: answers[s.id] })))
      }
      disabled={!answeredAll || saving}
      className="mt-5 btn-motion inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good disabled:opacity-40"
    >
      {label}
    </button>
  );
}
