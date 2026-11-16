"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ExamAvailability } from "@/lib/examAvailability";
import { EXAM_LABELS, type ExamPart } from "@/lib/types";
import { saveOnboarding } from "./actions";
import { browserTimezone } from "@/lib/timezone";
import { FIELD_CLASS, buttonClass } from "@/components/ui";
import { WEEKLY_HOURS } from "@/lib/confidence";

const PART_NOTES: Record<ExamPart, string> = {
  part1: "Basic sciences SBAs",
  part2: "Clinical SBAs and EMQs",
  part3: "Clinical assessment preparation",
};

export function OnboardingForm({
  initialExam,
  initialDate,
  initialHours,
  availability,
  isAdmin,
}: {
  initialExam: ExamPart | null;
  initialDate: string | null;
  initialHours: number | null;
  availability: ExamAvailability;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [exam, setExam] = useState<ExamPart | null>(initialExam);
  const [examDate, setExamDate] = useState(initialDate ?? "");
  const [hours, setHours] = useState<number | null>(initialHours);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const minDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  // Candidates only see live parts; admins see everything, badged.
  const parts = (Object.keys(EXAM_LABELS) as ExamPart[]).filter(
    (part) => isAdmin || availability[part]
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!exam) {
      setError("Choose an exam part");
      return;
    }
    startTransition(async () => {
      const result = await saveOnboarding(exam, examDate, browserTimezone(), hours);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Then the topics they feel confident in, as the survey pop-up on Today (owner, 16 November 2026).
      router.push("/?rate=1");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-line bg-surface p-6 shadow-card"
    >
      <fieldset>
        <legend className="text-sm font-medium">Which exam are you sitting?</legend>
        <div className="mt-2 space-y-2">
          {parts.map((part) => (
            <label
              key={part}
              className={`flex cursor-pointer items-start gap-3 rounded-card border p-3 ${
                exam === part
                  ? "border-good bg-sunk"
                  : "border-line hover:border-good/50"
              }`}
            >
              <input
                type="radio"
                name="exam"
                checked={exam === part}
                onChange={() => setExam(part)}
                className="mt-1 accent-good"
              />
              <span>
                <span className="block text-sm font-medium text-ink-strong">
                  MRCOG {EXAM_LABELS[part]}
                  {isAdmin && !availability[part] && (
                    <span className="ml-2 rounded-full border border-line px-2 py-0.5 font-mono text-micro font-normal text-ink/65">
                      hidden from candidates
                    </span>
                  )}
                </span>
                <span className="block text-xs text-ink/65">
                  {PART_NOTES[part]}
                </span>
              </span>
            </label>
          ))}
        </div>
        {parts.length === 1 && (
          <p className="mt-2 font-ui text-[14px] text-ink/65">
            More exam parts are coming soon.
          </p>
        )}
      </fieldset>

      <label className="mt-5 block font-ui text-[15px] font-semibold text-ink-strong">
        When is your exam?
        <input
          type="date"
          required
          min={minDate}
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
          className={`mt-1.5 ${FIELD_CLASS}`}
        />
      </label>

      <fieldset className="mt-5">
        <legend className="font-ui text-[15px] font-semibold text-ink-strong">
          How much time can you give it each week?
        </legend>
        <p className="mt-1 font-ui text-[14px] text-ink/65">
          This sets how many questions a day your plan asks of you.
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {WEEKLY_HOURS.map((w) => (
            <label
              key={w.hours}
              className={`flex cursor-pointer items-center gap-3 rounded-card border p-3 ${
                hours === w.hours ? "border-good bg-sunk" : "border-line hover:border-good/50"
              }`}
            >
              <input
                type="radio"
                name="hours"
                value={w.hours}
                checked={hours === w.hours}
                onChange={() => setHours(w.hours)}
                className="accent-good"
              />
              <span className="font-ui text-[15px] text-ink-strong">
                {w.label}
                <span className="block text-xs text-ink/65">About {w.daily} questions a day</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p className="mt-3 font-ui text-[15px] text-accent-ink">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className={buttonClass("primary", "md", "mt-6 w-full")}
      >
        {pending ? "Saving…" : "Next: your topics"}
      </button>
    </form>
  );
}
