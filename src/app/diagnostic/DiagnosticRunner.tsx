"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { SessionQuestion } from "@/lib/session";
import { groupIntoItems, itemSize, type QuestionItem } from "@/lib/emq";
import { recordAnswer } from "@/app/session/actions";
import { completeDiagnostic } from "./actions";

/**
 * Screening-style runner: answers are recorded silently (no per-question
 * feedback), then the topic map is revealed at the end.
 *
 * EMQ sets are presented whole — lead-in, shared option list, then every
 * scenario — because a scenario shown on its own with ten options is an
 * SBA, not the format the exam uses.
 */
export function DiagnosticRunner({
  questions,
}: {
  questions: SessionQuestion[];
}) {
  const router = useRouter();
  const sessionId = useRef(crypto.randomUUID());
  const startedAt = useRef(Date.now());
  const items = useMemo(() => groupIntoItems(questions), [questions]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setIndex(index + 1);
      startedAt.current = Date.now();
    } else {
      setFinishing(true);
      await completeDiagnostic();
      router.push("/diagnostic/results");
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

  if (finishing) {
    return (
      <div className="rounded-card border border-hairline bg-porcelain p-6 text-center shadow-card">
        <p className="text-sm text-graphite/70">Mapping your topics…</p>
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
      <div className="mb-3">
        <div className="flex items-center justify-between text-sm text-graphite/60">
          <span className="font-mono">{counter}</span>
          <span className="text-xs">{sectionTitle}</span>
        </div>
        <div
          className="mt-2 h-1 overflow-hidden rounded-full bg-hairline"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-heartbeat transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <article className="rounded-card border border-hairline bg-porcelain p-5 shadow-card sm:p-6">
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

        {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}
        {item.kind === "single" && saving && (
          <p className="mt-3 text-xs text-graphite/50">Recording…</p>
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
        <p className="text-sm italic text-graphite/70">{question.lead_in}</p>
      )}
      <p className="mt-2 whitespace-pre-wrap font-display text-[17px] leading-relaxed text-graphite">
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
        <span className="rounded-full border border-hairline px-2 py-0.5 font-mono uppercase text-graphite/60">
          emq set
        </span>
        <span className="font-mono text-[11px] text-greentop">
          {item.scenarios.length} scenarios · one option list
        </span>
      </div>

      {item.leadIn && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-graphite/80">
          {item.leadIn}
        </p>
      )}

      {/* Above the scenarios: the lead-in says "from the list above". */}
      <ol className="mt-4 space-y-1 rounded-card border border-hairline bg-white/60 p-4">
        {item.options.map((o) => (
          <li key={o.key} className="flex gap-2.5 text-sm text-graphite/85">
            <span className="font-mono text-xs leading-5 text-graphite/55">
              {o.key}
            </span>
            <span>{o.text}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5 space-y-5">
        {item.scenarios.map((s, n) => (
          <div key={s.id} className="border-t border-hairline pt-4">
            <p className="font-mono text-[11px] uppercase tracking-wide text-greentop">
              Scenario {n + 1} of {item.scenarios.length}
            </p>
            <p className="mt-2 whitespace-pre-wrap font-display text-[17px] leading-relaxed text-graphite">
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
                ? "border-greentop bg-sage"
                : "border-hairline bg-white hover:border-greentop hover:bg-sage"
            }`}
          >
            <span className="font-mono text-xs leading-5 text-graphite/60">
              {o.key}
            </span>
            <span className="text-graphite">{o.text}</span>
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
      className="mt-5 rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-40"
    >
      {label}
    </button>
  );
}
