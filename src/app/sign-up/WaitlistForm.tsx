"use client";

import { useState, useTransition } from "react";
import { Button, Field, FIELD_CLASS, Toast } from "@/components/ui";
import { EXAM_LABELS, type ExamPart } from "@/lib/types";
import { joinTheList } from "./actions";

/**
 * For the person who has no code, and for the person whose exam is in
 * March.
 *
 * The closed door used to say "check back soon", which asks someone
 * who found this site once to remember to find it again. Most MRCOG
 * candidates are months out from their diet when they start looking:
 * the useful thing is not to sell to them today but to be able to tell
 * them when it opens, and to know which paper to tell them about.
 */
export function WaitlistForm({ parts }: { parts: ExamPart[] }) {
  const [email, setEmail] = useState("");
  /* Only the parts the owner has opened are offered; with one open
     there is nothing to choose, so it is sent without asking. */
  const only = parts.length === 1 ? parts[0] : "";
  const [exam, setExam] = useState<string>(only);
  const [examDate, setExamDate] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="pop-in mt-6 rounded-card border border-good/40 bg-good/5 p-6">
        <p className="font-display text-[21px] font-semibold text-ink-strong">You are on the list</p>
        <p className="mt-1 font-ui text-[16px] leading-relaxed text-ink/85">
          You will hear from us once, when it opens for your diet, and not
          otherwise.
        </p>
      </div>
    );
  }

  return (
    <form
      className="mt-6 space-y-4 rounded-card border border-dashed border-line p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await joinTheList({ email, exam, examDate });
          if (result.error) setError(result.error);
          else setDone(true);
        });
      }}
    >
      <div>
        <p className="font-display text-[21px] font-semibold leading-snug text-ink-strong">
          No code yet? Join the waitlist
        </p>
        <p className="mt-1 font-ui text-[15px] leading-relaxed text-ink/70">
          One email, for your diet, when there is a place for you. Nothing else.
        </p>
      </div>

      <Field label="Email">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`mt-1 ${FIELD_CLASS}`}
        />
      </Field>

      <div className={`grid gap-4 ${parts.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {parts.length > 1 && (
          <Field label="Which paper" hint="Optional">
            <select
              value={exam}
              onChange={(e) => setExam(e.target.value)}
              className={`mt-1 ${FIELD_CLASS}`}
            >
              <option value="">Not sure yet</option>
              {parts.map((value) => (
                <option key={value} value={value}>
                  MRCOG {EXAM_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={only ? `MRCOG ${EXAM_LABELS[only]} exam date` : "Exam date"} hint="Optional">
          <input
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            className={`mt-1 ${FIELD_CLASS}`}
          />
        </Field>
      </div>

      {error && (
        <Toast tone="bad" className="mt-3">
          {error}
        </Toast>
      )}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Adding…" : "Join the waitlist"}
      </Button>
    </form>
  );
}
