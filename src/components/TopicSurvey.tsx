"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button, CardTitle } from "@/components/ui";
import { CONFIDENCE_LABELS, CONFIDENCE_ORDER, type Confidence } from "@/lib/confidence";
import { loadTopicSurvey, saveConfidence, type TopicGroup } from "@/app/onboarding/topics/actions";

/**
 * How confident the candidate feels in each topic, as a survey in a
 * pop-up (owner, 16 November 2026): opened from a button under the
 * initial diagnostic test on Today, and on arrival from onboarding. One
 * topic a card; choosing moves to the next card on its own; the count
 * "X/36" at the top; once every topic is answered it opens as a list,
 * where any rating can be changed. Each answer is saved as it is given,
 * so closing part-way loses nothing.
 *
 * In the style of the site's other pop-ups (ui/Confirm): the frosted
 * panel over a blurred backdrop. Escape and the backdrop close it.
 */

type Topic = { id: number; title: string; heading: string };

/** Three choices on one track, the chosen one in the brand green; choosing it again clears it. */
function ConfidenceChoice({
  value,
  onChoose,
  labelledBy,
}: {
  value: Confidence | null;
  onChoose: (c: Confidence) => void;
  labelledBy: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex shrink-0 rounded-full border border-line bg-sunk p-0.5">
      {CONFIDENCE_ORDER.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          onClick={() => onChoose(c)}
          className={`h-8 flex-1 whitespace-nowrap rounded-full px-2.5 font-ui text-[13px] font-medium transition-colors duration-fast ${
            value === c ? "bg-brand text-on-brand shadow-card" : "text-ink/70 hover:text-ink-strong"
          }`}
        >
          {CONFIDENCE_LABELS[c]}
        </button>
      ))}
    </div>
  );
}

type Loaded = { groups: TopicGroup[]; ratings: Record<number, Confidence> };

function Survey({ onClose, preloaded }: { onClose: () => void; preloaded?: Loaded }) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [ratings, setRatings] = useState<Record<number, Confidence | null>>({});
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<"cards" | "list">("cards");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const advance = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    (preloaded ? Promise.resolve(preloaded) : loadTopicSurvey()).then((result) => {
      if (!live) return;
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const list = result.groups.flatMap((g: TopicGroup) => g.topics.map((t) => ({ ...t, heading: g.heading })));
      setTopics(list);
      setRatings(result.ratings);
      const firstOpen = list.findIndex((t) => !result.ratings[t.id]);
      // All rated already: open on the list, to review and change.
      if (firstOpen === -1) setView("list");
      else setIndex(firstOpen);
    });
    return () => {
      live = false;
      if (advance.current) window.clearTimeout(advance.current);
    };
  }, [preloaded]);

  const total = topics?.length ?? 0;
  const answered = topics ? topics.filter((t) => ratings[t.id]).length : 0;

  const save = useCallback((id: number, confidence: Confidence | null) => {
    setError(null);
    startSaving(async () => {
      const result = await saveConfidence([{ section_id: id, confidence }]);
      if (result.error) setError("That answer was not saved. Check your connection and choose again.");
    });
  }, []);

  function choose(topic: Topic, c: Confidence) {
    const value = ratings[topic.id] === c && view === "list" ? null : c;
    const next = { ...ratings, [topic.id]: value };
    setRatings(next);
    save(topic.id, value);
    if (view !== "cards" || !topics) return;
    // On to the next topic not yet answered, after a beat so the choice is seen.
    if (advance.current) window.clearTimeout(advance.current);
    advance.current = window.setTimeout(() => {
      const after = [...topics.slice(index + 1), ...topics.slice(0, index)].find((t) => !next[t.id]);
      if (!after) setView("list");
      else setIndex(topics.indexOf(after));
    }, 280);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (view === "cards" && topics && ["1", "2", "3"].includes(e.key)) choose(topics[index], CONFIDENCE_ORDER[Number(e.key) - 1]);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const topic = topics?.[index];
  const headings = topics ? Array.from(new Set(topics.map((t) => t.heading))) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="survey-title">
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="fade-in absolute inset-0 cursor-default bg-scrim/30 backdrop-blur-md"
      />
      <div className="pop-in glass-strong relative flex max-h-[90vh] w-full max-w-md flex-col rounded-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>
              <span id="survey-title">How sure do you feel?</span>
            </CardTitle>
            <p className="mt-1 font-ui text-[14px] text-ink/65">
              Your plan starts with the topics you are least sure of, and checks the ones you are confident in.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink/65 hover:bg-sunk hover:text-ink-strong"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {topics && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between font-ui text-[14px] tabular-nums">
              <span className="font-semibold text-ink-strong">
                {answered}/{total}
              </span>
              <span className="text-ink/65">{saving ? "Saving…" : answered === total ? "All answered" : "questions answered"}</span>
            </div>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-sunk" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-brand transition-[width] duration-300"
                style={{ width: `${total ? (answered / total) * 100 : 0}%` }}
              />
            </span>
          </div>
        )}

        {!topics && !error && <p className="mt-6 font-ui text-[15px] text-ink/65">Loading your topics…</p>}

        {topics && view === "cards" && topic && (
          <div key={topic.id} className="pop-in mt-5">
            <p className="font-ui text-[14px] text-ink/65">{topic.heading}</p>
            <h3 id={`survey-topic-${topic.id}`} className="mt-1 font-display text-[28px] font-normal leading-tight text-ink-strong">
              {topic.title}
            </h3>
            <div role="radiogroup" aria-labelledby={`survey-topic-${topic.id}`} className="mt-5 grid gap-2">
              {CONFIDENCE_ORDER.map((c) => {
                const chosen = ratings[topic.id] === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    onClick={() => choose(topic, c)}
                    className={`btn-motion flex min-h-12 items-center rounded-card border px-4 font-ui text-[16px] font-semibold transition-colors duration-fast ${
                      chosen ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink-strong hover:border-good/70"
                    }`}
                  >
                    {CONFIDENCE_LABELS[c]}
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex items-center justify-between gap-2">
              <Button variant="quiet" size="sm" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
                Back
              </Button>
              <div className="flex gap-1">
                <Button variant="quiet" size="sm" onClick={() => setView("list")}>
                  See all
                </Button>
                <Button variant="quiet" size="sm" onClick={() => (index + 1 < total ? setIndex(index + 1) : setView("list"))}>
                  Skip
                </Button>
              </div>
            </div>
          </div>
        )}

        {topics && view === "list" && (
          <>
            <div className="-mx-2 mt-4 min-h-0 flex-1 overflow-y-auto px-2">
              {headings.map((h) => (
                <section key={h} className="mb-4">
                  <h3 className="mb-1.5 font-ui text-[14px] font-semibold text-ink/70">{h}</h3>
                  <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                    {topics
                      .filter((t) => t.heading === h)
                      .map((t) => (
                        <li key={t.id} className="flex flex-col gap-2 px-3 py-2.5">
                          <span id={`survey-row-${t.id}`} className="font-ui text-[15px] font-semibold text-ink-strong">
                            {t.title}
                          </span>
                          <ConfidenceChoice value={ratings[t.id] ?? null} onChoose={(c) => choose(t, c)} labelledBy={`survey-row-${t.id}`} />
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              {answered < total ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const firstOpen = topics.findIndex((t) => !ratings[t.id]);
                    setIndex(Math.max(0, firstOpen));
                    setView("cards");
                  }}
                >
                  Rate the rest
                </Button>
              ) : (
                <span className="font-ui text-[14px] text-ink/65">Choose again to change a rating.</span>
              )}
              <Button size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        )}

        {error && <p className="mt-3 font-ui text-[14px] text-accent-ink">{error}</p>}
      </div>
    </div>
  );
}

/**
 * The button that opens the survey, and the survey. `autoOpen` opens it
 * on arrival (from onboarding, Account or the plan page, by "?rate=1"),
 * and the address is tidied when it closes. `button` false mounts the
 * survey without a button, for when the card that holds it is not shown.
 */
export function RateTopics({
  autoOpen = false,
  button = true,
  preloaded,
}: {
  autoOpen?: boolean;
  button?: boolean;
  /** Topics and ratings already in hand, so the survey need not ask for them. */
  preloaded?: Loaded;
}) {
  const [open, setOpen] = useState(autoOpen);
  const router = useRouter();
  const pathname = usePathname();
  const close = useCallback(() => {
    setOpen(false);
    if (autoOpen) router.replace(pathname);
    router.refresh();
  }, [autoOpen, pathname, router]);
  return (
    <>
      {button && (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Rate your topics
        </Button>
      )}
      {open && <Survey onClose={close} preloaded={preloaded} />}
    </>
  );
}
