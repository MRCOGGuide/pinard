"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GLOBAL_SECTION_ID,
  GLOBAL_SECTION_LABEL,
  type SectionOption,
} from "@/lib/sections";

const field =
  "mt-1 w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm";

type ImportResult = {
  sba: number;
  emqGroups: number;
  emqScenarios: number;
  skipped: string[];
};

/**
 * Import a PDF of exam-style questions (e.g. a TOG CPD set): the model
 * parses every SBA and EMQ set into structured exemplars. Answers not
 * given in the document are AI-inferred and flagged for verification.
 */
export function ImportPanel({ options }: { options: SectionOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sectionId, setSectionId] = useState<number>(GLOBAL_SECTION_ID);
  const [sourceNote, setSourceNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function importFile(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError("Choose a PDF file first");
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("sectionId", String(sectionId));
      body.append("sourceNote", sourceNote);
      const response = await fetch("/api/examples/import", {
        method: "POST",
        body,
      });
      // The route streams progress bytes; the final line is the result.
      const bodyText = await response.text();
      const lastLine = bodyText.trim().split("\n").pop() ?? "";
      let payload: { error?: string } & Partial<ImportResult> = {};
      try {
        payload = JSON.parse(lastLine);
      } catch {
        payload = {};
      }
      if (!response.ok || payload.error || payload.sba === undefined) {
        setError(
          payload.error ??
            (response.status === 413
              ? "The file is too large to upload (~4.5 MB limit) — try a smaller PDF."
              : response.status === 504
                ? "The import timed out before parsing finished — try a shorter PDF, or split the set."
                : `Import failed (HTTP ${response.status}) — try again, and tell me this code if it persists.`)
        );
      } else {
        setResult({
          sba: payload.sba ?? 0,
          emqGroups: payload.emqGroups ?? 0,
          emqScenarios: payload.emqScenarios ?? 0,
          skipped: payload.skipped ?? [],
        });
        if (fileInput.current) fileInput.current.value = "";
        router.refresh();
      }
    } catch {
      setError("Import request failed — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 rounded-card border border-hairline bg-porcelain shadow-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="font-display text-base font-semibold text-theatre">
          Import questions from a PDF
        </span>
        <span className="font-mono text-xs text-greentop">
          {open ? "− close" : "+ open"}
        </span>
      </button>

      {open && (
        <form onSubmit={importFile} className="border-t border-hairline p-5">
          <p className="text-xs leading-relaxed text-graphite/60">
            Upload a PDF of exam-style questions — a TOG CPD set, for
            example. Every SBA and EMQ set is extracted automatically. If
            the document has no answer key, the AI marks its best answer
            and flags it{" "}
            <span className="font-mono">
              [AI-inferred answer — verify]
            </span>{" "}
            in the rationale so you can check it below. Examples teach the
            generator style only — generated questions always take their
            facts from ingested sources.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Section
              <select
                value={sectionId}
                onChange={(e) => setSectionId(Number(e.target.value))}
                className={field}
              >
                <option value={GLOBAL_SECTION_ID}>
                  {GLOBAL_SECTION_LABEL}
                </option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Source note
              <input
                value={sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
                placeholder="TOG 2026 · Issue 3 · CPD"
                className={field}
              />
            </label>
          </div>

          <label className="mt-4 block text-sm font-medium">
            PDF file
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf,text/plain,.txt"
              className="mt-1 block w-full text-sm text-graphite/70 file:mr-3 file:rounded-card file:border file:border-hairline file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-theatre"
            />
          </label>

          {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}
          {result && (
            <div className="mt-3 rounded-card border border-greentop/40 bg-white/60 p-3 text-sm">
              <p className="font-medium text-greentop">
                Imported {result.sba} SBA{result.sba === 1 ? "" : "s"}
                {result.emqScenarios > 0 &&
                  ` and ${result.emqGroups} EMQ set${result.emqGroups === 1 ? "" : "s"} (${result.emqScenarios} scenarios)`}{" "}
                — they appear in the list below.
              </p>
              {result.skipped.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-graphite/60">
                  {result.skipped.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-60"
          >
            {busy ? "Reading and parsing…" : "Import questions"}
          </button>
          {busy && (
            <p className="mt-2 text-xs text-graphite/60">
              Extracting the text and parsing every question — this can take
              a minute for a long set. Leave this page open.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
