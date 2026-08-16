"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { SessionQuestion } from "@/lib/session";
import {
  getSimilarValues,
  recordAnswer,
  type SimilarValueGroup,
} from "@/app/session/actions";
import { PricingTable } from "@/components/PricingTable";
import type { TierPricing } from "@/lib/billing";

type Phase = "answering" | "revealed";

export function SessionRunner({
  questions,
  title,
  endCard = "default",
  prices,
}: {
  questions: SessionQuestion[];
  title: string;
  endCard?: "default" | "paywall";
  prices?: TierPricing[];
}) {
  const sessionId = useRef(crypto.randomUUID());
  const startedAt = useRef(Date.now());
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("answering");
  const [chosen, setChosen] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<SimilarValueGroup[] | null>(null);

  const q = questions[index];
  const finished = index >= questions.length;

  async function choose(key: string) {
    if (phase !== "answering" || saving) return;
    setChosen(key);
    setSaving(true);
    setError(null);
    const seconds = (Date.now() - startedAt.current) / 1000;
    const result = await recordAnswer({
      questionId: q.id,
      chosenKey: key,
      secondsTaken: seconds,
      sessionId: sessionId.current,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      setChosen(null);
      return;
    }
    if (result.is_correct) setCorrectCount((c) => c + 1);
    setPhase("revealed");
    // Similar Values: a key_facts lookup, fetched in the background.
    getSimilarValues(q.id)
      .then(setSimilar)
      .catch(() => setSimilar(null));
  }

  function next() {
    setIndex((i) => i + 1);
    setPhase("answering");
    setChosen(null);
    setSimilar(null);
    startedAt.current = Date.now();
  }

  if (finished && endCard === "paywall") {
    return (
      <div>
        <div className="rounded-card border border-hairline bg-porcelain p-6 text-center shadow-card">
          <p className="font-mono text-sm text-greentop">
            {correctCount} / {questions.length} on your free sample
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-theatre">
            Ready for the full syllabus?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-graphite/70">
            The full plan adapts to your weakest topics, tracks every section
            toward the 70% threshold, and rebuilds daily sessions around your
            exam date.
          </p>
        </div>
        <div className="mt-5">
          <PricingTable prices={prices} />
        </div>
      </div>
    );
  }

  if (finished) {
    const pct = questions.length
      ? Math.round((correctCount / questions.length) * 100)
      : 0;
    return (
      <div className="rounded-card border border-hairline bg-porcelain p-6 text-center shadow-card">
        <p className="font-mono text-sm text-greentop">Session complete</p>
        <p className="mt-2 font-display text-4xl font-semibold text-theatre">
          {correctCount} / {questions.length}
        </p>
        <p className="mt-1 font-mono text-sm text-graphite/60">{pct}% correct</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/progress"
            className="rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
          >
            See your progress
          </Link>
          <Link
            href="/"
            className="rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre"
          >
            Back to today
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm text-graphite/60">
        <span>{title}</span>
        <span className="font-mono">
          {index + 1} / {questions.length}
        </span>
      </div>

      <article className="rounded-card border border-hairline bg-porcelain p-5 shadow-card sm:p-6">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-hairline px-2 py-0.5 font-mono uppercase text-graphite/60">
            {q.format}
          </span>
          <span className="text-graphite/60">{q.section_title}</span>
        </div>

        {q.lead_in && (
          <p className="mt-3 text-sm italic text-graphite/70">{q.lead_in}</p>
        )}
        <p className="mt-3 whitespace-pre-wrap font-display text-[17px] leading-relaxed text-graphite">
          {q.stem}
        </p>

        <ul className="mt-5 space-y-2">
          {q.options.map((o) => {
            const isChosen = chosen === o.key;
            const isCorrect = o.key === q.correct_key;
            let cls =
              "border-hairline bg-white hover:border-greentop hover:bg-sage";
            if (phase === "revealed") {
              if (isCorrect) cls = "border-greentop bg-sage";
              else if (isChosen) cls = "border-heartbeat bg-heartbeat/10";
              else cls = "border-hairline bg-white opacity-70";
            }
            return (
              <li key={o.key}>
                <button
                  type="button"
                  disabled={phase === "revealed" || saving}
                  onClick={() => choose(o.key)}
                  className={`flex w-full gap-3 rounded-card border px-4 py-3 text-left text-sm transition-colors ${cls}`}
                >
                  <span className="font-mono text-xs leading-5 text-graphite/60">
                    {o.key}
                  </span>
                  <span className="text-graphite">{o.text}</span>
                  {phase === "revealed" && isCorrect && (
                    <span className="ml-auto text-greentop" aria-hidden>
                      ✓
                    </span>
                  )}
                  {phase === "revealed" && isChosen && !isCorrect && (
                    <span className="ml-auto text-heartbeat" aria-hidden>
                      ✗
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

        {phase === "revealed" && (
          <div className="mt-5 border-t border-hairline pt-4">
            <p className="text-sm font-medium text-theatre">
              {chosen === q.correct_key
                ? "Correct."
                : `The correct answer is ${q.correct_key}.`}
            </p>
            <div className="mt-3 space-y-2">
              {q.explanations.map((e) => (
                <div key={e.key} className="text-sm">
                  <span
                    className={`font-mono text-xs ${
                      e.verdict === "correct"
                        ? "text-greentop"
                        : "text-graphite/50"
                    }`}
                  >
                    {e.key} {e.verdict === "correct" ? "✓" : "✗"}
                  </span>{" "}
                  <span className="text-graphite/85">{e.text}</span>
                </div>
              ))}
            </div>

            {similar && similar.length > 0 && (
              <div className="mt-4 rounded-card border border-hairline bg-white/60 p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-greentop">
                  Similar values
                </p>
                <div className="mt-2 space-y-3">
                  {similar.map((group) => (
                    <div key={group.value}>
                      <p className="font-mono text-sm font-medium text-heartbeat">
                        {group.value}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {group.facts.map((fact, i) => (
                          <li key={i} className="text-sm text-graphite/85">
                            {fact.statement}
                            {fact.source_reference && (
                              <span className="ml-1 font-mono text-[11px] text-graphite/50">
                                ({fact.source_reference})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {q.sources.length > 0 && (
              <div className="mt-4 border-t border-hairline pt-3">
                <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/50">
                  {q.sources.length === 1 ? "Source" : "Sources"}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {q.sources.map((s, i) => (
                    <li key={i} className="text-xs leading-relaxed text-graphite/70">
                      <span className="font-medium text-graphite/85">
                        {s.title}
                      </span>
                      {s.togYear && s.togIssue ? (
                        <span className="text-graphite/60">
                          {" "}
                          · TOG {s.togYear}, Issue {s.togIssue}
                        </span>
                      ) : (
                        s.year && (
                          <span className="text-graphite/60"> · {s.year}</span>
                        )
                      )}
                      {s.reference && (
                        <span className="text-graphite/60"> · {s.reference}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={next}
              className="mt-5 rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
            >
              {index + 1 < questions.length ? "Next question" : "Finish session"}
            </button>
          </div>
        )}
      </article>
    </div>
  );
}
