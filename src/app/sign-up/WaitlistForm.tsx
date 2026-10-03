"use client";

import { useState, useTransition } from "react";
import { Button, Field, FIELD_CLASS, Toast } from "@/components/ui";
import { EXAM_LABELS } from "@/lib/types";
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
export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [exam, setExam] = useState("");
  const [examDate, setExamDate] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="mt-4 rounded-card border border-good/40 bg-sunk p-5">
        <p className="text-sm leading-relaxed text-ink/85">
          You are on the list. You will hear from me once, when it opens
          for your diet, and not otherwise.
        </p>
      </div>
    );
  }

  return (
    <form
      className="mt-4 rounded-card border border-line bg-surface p-5 shadow-card"
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
      <p className="text-sm font-medium text-ink-strong">
        No code? Be told when it opens.
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink/65">
        One email, for your diet, when there is something to open. Nothing
        else.
      </p>

      <Field label="Email" className="mt-3">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`mt-1 ${FIELD_CLASS}`}
        />
      </Field>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Which paper" hint="Optional">
          <select
            value={exam}
            onChange={(e) => setExam(e.target.value)}
            className={`mt-1 ${FIELD_CLASS}`}
          >
            <option value="">Not sure yet</option>
            {Object.entries(EXAM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                MRCOG {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Exam date" hint="Optional">
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

      <Button type="submit" size="sm" variant="secondary" className="mt-4" disabled={pending}>
        {pending ? "Adding…" : "Tell me when it opens"}
      </Button>
    </form>
  );
}
