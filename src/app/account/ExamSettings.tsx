"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ExamAvailability } from "@/lib/examAvailability";
import { EXAM_LABELS, type ExamPart } from "@/lib/types";
import { saveOnboarding } from "@/app/onboarding/actions";
import { browserTimezone } from "@/lib/timezone";
import { Tally } from "@/components/Tally";

/**
 * Lets a subscriber change their exam date (and part) after onboarding —
 * e.g. when their sitting is rescheduled. Saving re-triggers the plan,
 * which regenerates around the new date automatically.
 */
export function ExamSettings({
  exam,
  examDate,
  availability,
  isAdmin,
}: {
  exam: ExamPart;
  examDate: string | null;
  availability: ExamAvailability;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [selectedExam, setSelectedExam] = useState<ExamPart>(exam);
  const [date, setDate] = useState(examDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const minDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const parts = (Object.keys(EXAM_LABELS) as ExamPart[]).filter(
    (p) => isAdmin || availability[p]
  );

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveOnboarding(selectedExam, date, browserTimezone());
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setEditing(false);
      router.refresh();
    });
  }

  /* Whole days from today to the exam, for the countdown beside it. */
  const daysLeft = examDate
    ? Math.max(
        0,
        Math.ceil(
          (Date.parse(`${examDate}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) /
            86_400_000
        )
      )
    : null;

  const prettyDate = examDate
    ? new Date(`${examDate}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "not set";

  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-ui text-[14px] font-semibold text-ink/70">Your exam</h2>
          {!editing && (
            <>
              <p className="mt-1 font-display text-[30px] font-semibold leading-none text-ink-strong">
                MRCOG {EXAM_LABELS[exam]}
              </p>
              <p className="mt-2 font-ui text-[16px] text-ink/80">{prettyDate}</p>
            </>
          )}
        </div>
        {!editing && daysLeft !== null && (
          <div className="text-right">
            <p className="font-display text-[40px] leading-none tabular-nums text-good">
              <Tally to={daysLeft} />
            </p>
            <p className="mt-1 font-ui text-[14px] text-ink/65">{daysLeft === 1 ? "day to go" : "days to go"}</p>
          </div>
        )}
      </div>

      {!editing && (
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setSaved(false);
          }}
          className="btn-motion mt-4 inline-flex h-10 items-center rounded-control border border-line bg-surface px-4 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
        >
          Change exam or date
        </button>
      )}

      {saved && !editing && (
        <p className="ed-reveal mt-3 font-ui text-[14px] text-good">
          Updated: your plan has been rebuilt around the new date.
        </p>
      )}

      {editing && (
        <div className="ed-reveal mt-4">
          {parts.length > 1 && (
            <fieldset className="mb-4">
              <legend className="font-ui text-[15px] font-semibold text-ink-strong">Exam part</legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {parts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedExam(p)}
                    aria-pressed={selectedExam === p}
                    className={`inline-flex h-10 items-center rounded-full border px-4 font-ui text-[15px] font-medium ${
                      selectedExam === p
                        ? "border-brand bg-brand text-on-brand"
                        : "border-line bg-surface text-ink/75 hover:text-ink-strong"
                    }`}
                  >
                    {EXAM_LABELS[p]}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <label className="block font-ui text-[15px] font-semibold text-ink-strong">
            Exam date
            <input
              type="date"
              min={minDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-control border border-line bg-raised px-3 py-2 font-ui text-[16px] text-ink focus:border-good focus:outline-none focus:ring-2 focus:ring-good/30"
            />
          </label>

          {error && <p className="mt-3 font-ui text-[15px] text-accent-ink">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="btn-motion inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setSelectedExam(exam);
                setDate(examDate ?? "");
                setError(null);
              }}
              className="btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
            >
              Cancel
            </button>
          </div>

          {selectedExam !== exam && (
            <p className="mt-3 font-ui text-[14px] text-ink/65">
              Switching exam part changes your whole syllabus; your progress on
              the current part won&rsquo;t carry over.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
