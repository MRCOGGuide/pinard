"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ExamAvailability } from "@/lib/examAvailability";
import { EXAM_LABELS, type ExamPart } from "@/lib/types";
import { saveOnboarding } from "@/app/onboarding/actions";

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
      const result = await saveOnboarding(selectedExam, date);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setEditing(false);
      router.refresh();
    });
  }

  const prettyDate = examDate
    ? new Date(`${examDate}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "not set";

  return (
    <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-theatre">
            Your exam
          </h2>
          {!editing && (
            <p className="mt-1 text-sm text-graphite/80">
              MRCOG {EXAM_LABELS[exam]} · {prettyDate}
            </p>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setSaved(false);
            }}
            className="rounded px-2 py-1 text-sm font-medium text-greentop hover:text-theatre"
          >
            Change
          </button>
        )}
      </div>

      {saved && !editing && (
        <p className="mt-2 text-xs text-greentop">
          Updated — your plan has been rebuilt around the new date.
        </p>
      )}

      {editing && (
        <div className="mt-4">
          {parts.length > 1 && (
            <fieldset className="mb-4">
              <legend className="text-sm font-medium">Exam part</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {parts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedExam(p)}
                    className={`rounded-card border px-3 py-1.5 text-sm font-medium ${
                      selectedExam === p
                        ? "border-greentop bg-sage text-theatre"
                        : "border-hairline bg-white text-graphite/70 hover:text-theatre"
                    }`}
                  >
                    {EXAM_LABELS[p]}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <label className="block text-sm font-medium">
            Exam date
            <input
              type="date"
              min={minDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm"
            />
          </label>

          {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-card bg-theatre px-5 py-2 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-60"
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
              className="rounded-card border border-hairline bg-porcelain px-4 py-2 text-sm font-medium text-graphite/70 hover:text-theatre"
            >
              Cancel
            </button>
          </div>

          {selectedExam !== exam && (
            <p className="mt-3 text-xs text-graphite/55">
              Switching exam part changes your whole syllabus; your progress on
              the current part won&rsquo;t carry over.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
