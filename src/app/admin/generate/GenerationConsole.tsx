"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SectionOption } from "@/lib/sections";
import type { QuestionFormat } from "@/lib/types";

type Result = {
  created: number;
  flagged: number;
  insufficient: number;
  problems: string[];
};

const field =
  "mt-1 w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm";

export function GenerationConsole({
  options,
  pendingCount,
}: {
  options: SectionOption[];
  pendingCount: number;
}) {
  const router = useRouter();
  const [sectionId, setSectionId] = useState<number>(options[0]?.id ?? 0);
  const [format, setFormat] = useState<QuestionFormat>("sba");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  if (options.length === 0) {
    return (
      <p className="rounded-card border border-hairline bg-porcelain p-4 text-sm text-graphite/60">
        Create a section and ingest a document for it first.
      </p>
    );
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, format, count }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Generation failed");
      } else {
        setResult(payload as Result);
        router.refresh();
      }
    } catch {
      setError("Request failed — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-hairline bg-porcelain p-5 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Section
            <select
              value={sectionId}
              onChange={(e) => setSectionId(Number(e.target.value))}
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
          How many
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
          <span className="ml-2 text-xs text-graphite/50">(1–20)</span>
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
            Each question is drafted, verified against its sources, and
            regenerated up to twice if it fails. This can take a minute or two —
            leave this page open.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

        {result && (
          <div className="mt-4 rounded-card border border-hairline bg-white/60 p-4 text-sm">
            <p className="font-medium text-greentop">
              {result.created} approved into the review queue
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
