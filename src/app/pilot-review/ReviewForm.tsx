"use client";

import { useState, useTransition } from "react";
import { Button, Card, FIELD_CLASS, Field, Toast } from "@/components/ui";
import {
  LIMITS,
  REVIEW_AREAS,
  type PilotReview,
  type ReviewAreaKey,
} from "@/lib/pilotReviewShared";
import { submitPilotReview } from "./actions";

const EMPTY: PilotReview = {
  scores: Object.fromEntries(REVIEW_AREAS.map((a) => [a.key, null])) as Record<ReviewAreaKey, number | null>,
  publicComment: "",
  privateComment: "",
  displayName: "",
  displayDetail: "",
  consent: false,
};

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * One row of ten buttons per part of the site, a "did not use it" for
 * every part but Overall, then the two comments.
 *
 * Buttons rather than a slider: a score out of ten is ten choices, and
 * a slider on a phone lands somewhere near the one meant. The public
 * comment and the consent sit together, so nobody agrees to publication
 * of something they cannot see.
 */
export function ReviewForm({ initial }: { initial: PilotReview | null }) {
  const [review, setReview] = useState<PilotReview>(initial ?? EMPTY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function score(key: ReviewAreaKey, value: number | null) {
    setReview((r) => ({ ...r, scores: { ...r.scores, [key]: value } }));
  }
  function text<K extends "publicComment" | "privateComment" | "displayName" | "displayDetail">(key: K, value: string) {
    setReview((r) => ({ ...r, [key]: value }));
  }

  function send() {
    setMsg(null);
    startTransition(async () => {
      const result = await submitPilotReview(review);
      setMsg(
        result.error
          ? { ok: false, text: result.error }
          : { ok: true, text: "Thank you. Your review has been sent, and you can change it here until the review closes." }
      );
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-display text-lg font-semibold text-ink-strong">Scores</h2>
        <p className="mt-1 text-sm text-ink/65">
          1 is poor and 10 is excellent. Mark &ldquo;Did not use&rdquo; for anything you did not try.
        </p>
        <div className="mt-4 space-y-5">
          {REVIEW_AREAS.map((area) => {
            const current = review.scores[area.key];
            return (
              <fieldset key={area.key}>
                <legend className="text-sm font-medium text-ink-strong">
                  {area.label}
                  {area.key === "overall" && <span className="text-accent-ink"> *</span>}
                </legend>
                <p className="text-xs text-ink/55">{area.hint}</p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${area.label}, out of ten`}>
                  {SCALE.map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={current === n}
                      onClick={() => score(area.key, n)}
                      className={`h-9 w-9 rounded-card border text-sm font-medium ${
                        current === n
                          ? "border-good bg-good text-on-brand"
                          : "border-line bg-raised text-ink/80 hover:border-good"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  {area.key !== "overall" && (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={current === null}
                      onClick={() => score(area.key, null)}
                      className={`h-9 rounded-card border px-3 text-xs ${
                        current === null
                          ? "border-ink/40 bg-sunk text-ink-strong"
                          : "border-line bg-raised text-ink/60 hover:border-ink/40"
                      }`}
                    >
                      Did not use
                    </button>
                  )}
                </div>
              </fieldset>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink-strong">What should we change?</h2>
        <p className="mt-1 text-sm text-ink/65">For us only. Anything that was wrong, missing, confusing or slow.</p>
        <textarea
          rows={5}
          maxLength={LIMITS.privateComment}
          value={review.privateComment}
          onChange={(e) => text("privateComment", e.target.value)}
          className={`mt-3 ${FIELD_CLASS}`}
          placeholder="A question you thought was wrong, a page that confused you, something you looked for and could not find."
        />
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink-strong">A comment for the website</h2>
        <p className="mt-1 text-sm text-ink/65">
          Optional. If you write one and agree below, it may appear on the Pinard website with your name, role and overall score.
        </p>
        <textarea
          rows={3}
          maxLength={LIMITS.publicComment}
          value={review.publicComment}
          onChange={(e) => text("publicComment", e.target.value)}
          className={`mt-3 ${FIELD_CLASS}`}
          placeholder="In your own words, what Pinard was like to revise with."
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name to show" hint="Your name, or initials">
            <input
              type="text"
              maxLength={LIMITS.displayName}
              value={review.displayName}
              onChange={(e) => text("displayName", e.target.value)}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </Field>
          <Field label="Role" hint="For example: ST5, Leeds">
            <input
              type="text"
              maxLength={LIMITS.displayDetail}
              value={review.displayDetail}
              onChange={(e) => text("displayDetail", e.target.value)}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </Field>
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm text-ink/80">
          <input
            type="checkbox"
            checked={review.consent}
            onChange={(e) => setReview((r) => ({ ...r, consent: e.target.checked }))}
            className="mt-0.5"
          />
          <span>
            I agree that Pinard may publish this comment, with the name, role and overall score above, on its website and
            may shorten it for length without changing its meaning. I can ask for it to be removed at any time.
          </span>
        </label>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={send} disabled={pending}>
          {pending ? "Sending" : initial ? "Update my review" : "Send my review"}
        </Button>
        {msg && <Toast tone={msg.ok ? "good" : "bad"}>{msg.text}</Toast>}
      </div>
    </div>
  );
}
