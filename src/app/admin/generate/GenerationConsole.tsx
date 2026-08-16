"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SectionOption } from "@/lib/sections";
import type { QuestionFormat } from "@/lib/types";
import type { GenerationDoc } from "./page";

type Result = {
  created: number;
  emqScenarios?: number;
  flagged: number;
  insufficient: number;
  problems: string[];
};

const field =
  "mt-1 w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm";

export function GenerationConsole({
  options,
  docs,
  sectionParents,
  pendingCount,
}: {
  options: SectionOption[];
  docs: GenerationDoc[];
  sectionParents: Record<number, number | null>;
  pendingCount: number;
}) {
  const router = useRouter();
  const [sectionId, setSectionId] = useState<number>(options[0]?.id ?? 0);
  const [documentId, setDocumentId] = useState<number>(0); // 0 = whole section
  const [format, setFormat] = useState<QuestionFormat>("sba");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  if (options.length === 0) {
    return (
      <p className="rounded-card border border-hairline bg-porcelain p-4 text-sm text-graphite/60">
        Create a section and ingest a document for it first.
      </p>
    );
  }

  /**
   * One unit per request, looped here.
   *
   * A whole batch in a single request outlives the serverless time
   * limit — an EMQ set alone can take over a minute (a long generation
   * plus a grounding check per scenario). Looping keeps every request
   * short, shows progress, and means a failure late in a batch doesn't
   * discard the questions already stored.
   */
  async function generate() {
    setBusy(true);
    setError(null);
    setResult(null);

    const totals: Result = {
      created: 0,
      emqScenarios: 0,
      flagged: 0,
      insufficient: 0,
      problems: [],
    };
    const unit = format === "emq" ? "set" : "question";
    let consecutiveFailures = 0;

    for (let i = 0; i < count; i++) {
      setProgress(`Generating ${unit} ${i + 1} of ${count}…`);
      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionId,
            format,
            count: 1,
            documentId: documentId || undefined,
          }),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          consecutiveFailures++;
          const message =
            payload.error ??
            (response.status === 504
              ? "the request timed out"
              : `HTTP ${response.status}`);
          totals.problems.push(`${unit} ${i + 1}: ${message}`);
          // Two in a row means something systemic — stop burning credit.
          if (consecutiveFailures >= 2) {
            setError(
              `Stopped after repeated failures: ${message}. ${totals.created} ${unit}(s) were created before this.`
            );
            break;
          }
          continue;
        }

        consecutiveFailures = 0;
        totals.created += payload.created ?? 0;
        totals.emqScenarios = (totals.emqScenarios ?? 0) + (payload.emqScenarios ?? 0);
        totals.flagged += payload.flagged ?? 0;
        totals.insufficient += payload.insufficient ?? 0;
        if (Array.isArray(payload.problems)) {
          totals.problems.push(...payload.problems);
        }
        // Show progress as it accumulates, not only at the end.
        setResult({ ...totals, problems: totals.problems.slice(0, 5) });
      } catch {
        consecutiveFailures++;
        totals.problems.push(`${unit} ${i + 1}: request failed`);
        if (consecutiveFailures >= 2) {
          setError("Stopped after repeated request failures.");
          break;
        }
      }
    }

    setProgress(null);
    setResult({ ...totals, problems: totals.problems.slice(0, 5) });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-hairline bg-porcelain p-5 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Section
            <select
              value={sectionId}
              onChange={(e) => {
                setSectionId(Number(e.target.value));
                setDocumentId(0);
              }}
              className={field}
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium">
            Focus on a document (optional)
            <select
              value={documentId}
              onChange={(e) => setDocumentId(Number(e.target.value))}
              className={field}
            >
              <option value={0}>Whole section — balanced mix</option>
              {docs
                .filter(
                  (d) =>
                    d.section_id === sectionId ||
                    sectionParents[d.section_id] === sectionId
                )
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
            </select>
          </label>

          <label className="block text-sm font-medium">
            Format
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as QuestionFormat)}
              className={field}
            >
              <option value="sba">SBA — single best answer</option>
              <option value="emq">EMQ — extended matching</option>
            </select>
          </label>
        </div>

        <label className="mt-4 block text-sm font-medium">
          {format === "emq" ? "How many EMQ sets" : "How many questions"}
          <input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) =>
              setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))
            }
            className="mt-1 w-28 rounded-card border border-hairline bg-white px-3 py-2 text-sm"
          />
          <span className="ml-2 text-xs text-graphite/50">
            (1–20)
            {format === "emq" &&
              " — each set is one shared option list with 3–4 scenarios"}
          </span>
        </label>

        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="mt-5 rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-60"
        >
          {busy ? "Generating…" : `Generate ${count} question${count === 1 ? "" : "s"}`}
        </button>

        {busy && (
          <p className="mt-3 text-xs text-graphite/60">
            {progress ? <span className="font-medium">{progress} </span> : null}
            Each {format === "emq" ? "set" : "question"} is drafted, verified
            against its sources and regenerated up to twice if it fails
            {format === "emq" && ", and every scenario is fact-checked"}. Roughly{" "}
            {format === "emq" ? "a minute per set" : "20 seconds per question"} —
            leave this page open. Anything already created is saved even if a
            later one fails.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

        {result && (
          <div className="mt-4 rounded-card border border-hairline bg-white/60 p-4 text-sm">
            <p className="font-medium text-greentop">
              {result.created}{" "}
              {format === "emq"
                ? `EMQ set${result.created === 1 ? "" : "s"}${result.emqScenarios ? ` (${result.emqScenarios} scenarios)` : ""}`
                : "question(s)"}{" "}
              queued for review
            </p>
            {(result.flagged > 0 || result.insufficient > 0) && (
              <p className="mt-1 text-graphite/70">
                {result.flagged} flagged for review, {result.insufficient}{" "}
                skipped for insufficient source material.
              </p>
            )}
            {result.problems.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-graphite/60">
                {result.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
            <Link
              href="/admin/review"
              className="mt-3 inline-block rounded-card bg-theatre px-4 py-2 text-xs font-medium text-porcelain hover:bg-greentop"
            >
              Go to review queue
            </Link>
          </div>
        )}
      </div>

      <p className="text-sm text-graphite/60">
        {pendingCount} question{pendingCount === 1 ? "" : "s"} currently awaiting
        review.{" "}
        <Link href="/admin/review" className="font-medium text-greentop">
          Open the review queue →
        </Link>
      </p>
    </div>
  );
}
