"use client";

import { useState } from "react";
import { AnswerText } from "@/components/AnswerText";
import { stripCitations } from "@/lib/chat";
import { buttonClass, FIELD_CLASS } from "@/components/ui";
import { askForReview, rateReview, type AskReview } from "./actions";

const RATINGS: { value: NonNullable<AskReview["rating"]>; label: string }[] = [
  { value: "good", label: "Good" },
  { value: "needs_work", label: "Needs work" },
  { value: "wrong", label: "Wrong" },
];

/** The ask box, then every test so far, newest first, each ratable. */
export function AskBench({ initial }: { initial: AskReview[] }) {
  const [reviews, setReviews] = useState(initial);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await askForReview(question);
    setBusy(false);
    if (result.error || !result.review) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    setReviews((r) => [result.review as AskReview, ...r]);
    setQuestion("");
  }

  return (
    <div>
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <label htmlFor="bench-q" className="font-ui text-[15px] font-semibold text-ink-strong">
          Ask a question or scenario
        </label>
        <textarea
          id="bench-q"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask();
          }}
          className={`${FIELD_CLASS} mt-2 w-full`}
          placeholder="e.g. A woman at 30 weeks with a twin pregnancy and reduced fetal movements: what next?"
        />
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={() => void ask()} disabled={busy} className={buttonClass("primary")}>
            {busy ? "Asking…" : "Ask"}
          </button>
          <span className="font-ui text-[13px] text-ink/60">Ctrl+Enter also asks. About 4 cents a question.</span>
        </div>
        {error && <p className="mt-3 font-ui text-[15px] text-accent-ink">{error}</p>}
      </div>

      <ol className="mt-6 space-y-4">
        {reviews.map((r) => (
          <li key={r.id}>
            <ReviewCard review={r} onRated={(next) => setReviews((all) => all.map((x) => (x.id === next.id ? next : x)))} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReviewCard({ review, onRated }: { review: AskReview; onRated: (r: AskReview) => void }) {
  const [rating, setRating] = useState(review.rating);
  const [note, setNote] = useState(review.note ?? "");
  const [expected, setExpected] = useState(review.expected ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(review.rating));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!rating) return;
    setSaving(true);
    setError(null);
    const result = await rateReview({ id: review.id, rating, note, expected });
    setSaving(false);
    if (result.error) return setError(result.error);
    setSaved(true);
    onRated({ ...review, rating, note, expected });
  }

  const retries = Math.max(0, (review.attempts ?? 1) - 1);
  return (
    <article className="rounded-card border border-line bg-surface p-5 shadow-card">
      <p className="font-ui text-[16px] font-semibold text-ink-strong">{review.question}</p>
      <p className="mt-1 font-ui text-[13px] tabular-nums text-ink/60">
        {review.total_ms ? `${(review.total_ms / 1000).toFixed(1)} s` : "–"}
        {review.retrieval_ms ? `, search ${(review.retrieval_ms / 1000).toFixed(1)} s` : ""}
        {retries > 0 ? `, ${retries} draft${retries === 1 ? "" : "s"} sent back by the checks` : ""}
        {" · "}
        {new Date(review.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </p>

      <div className="mt-4">
        {review.ok && review.reply ? (
          <AnswerText text={stripCitations(review.reply)} />
        ) : (
          <p className="font-ui text-[15px] text-accent-ink">No answer: {review.failure}</p>
        )}
      </div>

      {review.sources.length > 0 && (
        <p className="mt-3 font-ui text-[13px] text-ink/65">
          Cited: {review.sources.map((s) => s.title).join("; ")}
        </p>
      )}

      <details className="mt-3 font-ui text-[13px] text-ink/70">
        <summary className="cursor-pointer text-ink/65 hover:text-ink-strong">
          What the search found ({review.passages.length} passages)
          {review.problems.length > 0 ? " and what the checks sent back" : ""}
        </summary>
        <ol className="mt-2 list-decimal space-y-0.5 pl-5">
          {review.passages.map((p) => (
            <li key={p.chunk_id}>
              {p.title} <span className="tabular-nums text-ink/50">({p.similarity})</span>
            </li>
          ))}
        </ol>
        {review.problems.map((list, i) => (
          <p key={i} className="mt-2 text-accent-ink">
            Draft {i + 1} sent back: {list.join("; ")}
          </p>
        ))}
      </details>

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Rating">
          {RATINGS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={rating === o.value}
              onClick={() => {
                setRating(o.value);
                setSaved(false);
              }}
              className={`rounded-full border px-4 py-1.5 font-ui text-[14px] font-semibold ${
                rating === o.value ? "border-good bg-good text-on-brand" : "border-line bg-surface text-ink/75 hover:border-good/60"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {rating && rating !== "good" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="font-ui text-[13px] text-ink/70">
              What was wrong
              <textarea rows={3} value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }} className={`${FIELD_CLASS} mt-1 w-full`} />
            </label>
            <label className="font-ui text-[13px] text-ink/70">
              What it should have said (and the guideline, if you know it)
              <textarea rows={3} value={expected} onChange={(e) => { setExpected(e.target.value); setSaved(false); }} className={`${FIELD_CLASS} mt-1 w-full`} />
            </label>
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={() => void save()} disabled={!rating || saving || saved} className={buttonClass("secondary", "sm")}>
            {saving ? "Saving…" : saved ? "Saved" : "Save rating"}
          </button>
          {error && <span className="font-ui text-[14px] text-accent-ink">{error}</span>}
        </div>
      </div>
    </article>
  );
}
