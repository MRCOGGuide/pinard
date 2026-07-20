"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ExamAvailability } from "@/lib/examAvailability";
import { EXAM_LABELS, type ExamPart } from "@/lib/types";
import { saveOnboarding } from "./actions";

const PART_NOTES: Record<ExamPart, string> = {
  part1: "Basic sciences SBAs",
  part2: "Clinical SBAs and EMQs",
  part3: "Clinical assessment preparation",
};

export function OnboardingForm({
  initialExam,
  initialDate,
  availability,
  isAdmin,
}: {
  initialExam: ExamPart | null;
  initialDate: string | null;
  availability: ExamAvailability;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [exam, setExam] = useState<ExamPart | null>(initialExam);
  const [examDate, setExamDate] = useState(initialDate ?? "");
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
      const result = await saveOnboarding(exam, examDate);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-hairline bg-porcelain p-6 shadow-card"
    >
      <fieldset>
        <legend className="text-sm font-medium">Which exam are you sitting?</legend>
        <div className="mt-2 space-y-2">
          {parts.map((part) => (
            <label
              key={part}
              className={`flex cursor-pointer items-start gap-3 rounded-card border p-3 ${
                exam === part
                  ? "border-greentop bg-sage"
                  : "border-hairline hover:border-greentop/50"
              }`}
            >
              <input
                type="radio"
                name="exam"
                checked={exam === part}
                onChange={() => setExam(part)}
                className="mt-1 accent-greentop"
              />
              <span>
                <span className="block text-sm font-medium text-theatre">
                  MRCOG {EXAM_LABELS[part]}
                  {isAdmin && !availability[part] && (
                    <span className="ml-2 rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] font-normal text-graphite/50">
                      hidden from candidates
                    </span>
                  )}
                </span>
                <span className="block text-xs text-graphite/60">
                  {PART_NOTES[part]}
                </span>
              </span>
            </label>
          ))}
        </div>
        {parts.length === 1 && (
          <p className="mt-2 text-xs text-graphite/55">
            More exam parts are coming soon.
          </p>
        )}
      </fieldset>

      <label className="mt-5 block text-sm font-medium">
        When is your exam?
        <input
          type="date"
          required
          min={minDate}
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
          className="mt-1 w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm"
        />
      </label>

      {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-card bg-theatre px-4 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-60"
      >
        {pending ? "Saving…" : "Start my plan"}
      </button>
    </form>
  );
}
