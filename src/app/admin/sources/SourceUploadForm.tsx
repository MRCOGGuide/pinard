"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SectionOption } from "@/lib/sections";
import { TOG_CATEGORIES, TOG_ISSUE_MONTHS } from "@/lib/tog";
import { createDocument } from "./actions";

const field =
  "mt-1 w-full rounded-card border border-line bg-raised px-3 py-2 text-sm";

export function SourceUploadForm({
  options,
  sectionId,
  onSectionChange,
}: {
  options: SectionOption[];
  sectionId: number;
  onSectionChange: (id: number) => void;
}) {
  const [mode, setMode] = useState<"pdf" | "text">("pdf");
  const [title, setTitle] = useState("");
  const [reference, setReference] = useState("");
  const [year, setYear] = useState("");
  const [text, setText] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // TOG issue identity (optional).
  const [isTog, setIsTog] = useState(false);
  const [togYear, setTogYear] = useState("");
  const [togIssue, setTogIssue] = useState(1);
  const [togCategory, setTogCategory] = useState<string>(
    TOG_CATEGORIES[0].value
  );

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const file = fileInput.current?.files?.[0] ?? null;
    if (mode === "pdf" && !file) {
      setError("Choose a PDF file to upload");
      return;
    }
    if (mode === "text" && !text.trim()) {
      setError("Paste the source text first");
      return;
    }

    setBusy(true);
    const supabase = createClient();

    const path =
      mode === "pdf"
        ? `docs/${crypto.randomUUID()}.pdf`
        : `docs/${crypto.randomUUID()}.txt`;
    const payload =
      mode === "pdf"
        ? file!
        : new Blob([text], { type: "text/plain;charset=utf-8" });

    const { error: uploadError } = await supabase.storage
      .from("sources")
      .upload(path, payload, {
        contentType: mode === "pdf" ? "application/pdf" : "text/plain",
      });

    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`);
      setBusy(false);
      return;
    }

    startTransition(async () => {
      const result = await createDocument({
        sectionId,
        title,
        sourceReference: reference,
        sourceYear: year ? Number(year) : null,
        filePath: path,
        togYear: isTog && togYear ? Number(togYear) : null,
        togIssue: isTog ? togIssue : null,
        togCategory: isTog ? togCategory : null,
      });
      setBusy(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Kick off ingestion in the background — status is shown on the card.
      if (result.id) {
        fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: result.id }),
        }).catch(() => {});
      }
      setTitle("");
      setReference("");
      setYear("");
      setText("");
      if (fileInput.current) fileInput.current.value = "";
      setSaved(true);
    });
  }

  const modeTab = (value: "pdf" | "text", label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={`rounded-card border px-3 py-1.5 text-sm font-medium ${
        mode === value
          ? "border-brand bg-brand text-on-brand"
          : "border-line bg-surface text-ink/70 hover:text-ink-strong"
      }`}
    >
      {label}
    </button>
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <div className="flex gap-2">
        {modeTab("pdf", "Upload PDF")}
        {modeTab("text", "Paste text")}
      </div>

      <label className="mt-4 block text-sm font-medium">
        Section
        <select
          value={sectionId}
          onChange={(e) => onSectionChange(Number(e.target.value))}
          className={field}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
        <label className="block text-sm font-medium">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Prevention and management of postpartum haemorrhage"
            className={field}
          />
        </label>
        <label className="block text-sm font-medium sm:w-28">
          Year
          <input
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            maxLength={4}
            placeholder="2016"
            className={field}
          />
        </label>
      </div>

      <label className="mt-4 block text-sm font-medium">
        Source reference
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          required
          placeholder="RCOG GTG No. 52, 2016"
          className={field}
        />
      </label>

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={isTog}
          onChange={(e) => setIsTog(e.target.checked)}
          className="h-4 w-4 accent-brand"
        />
        This is a TOG item (journal issue content)
      </label>

      {isTog && (
        <div className="mt-3 grid gap-4 rounded-card border border-line bg-raised/60 p-4 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            TOG year
            <input
              value={togYear}
              onChange={(e) => setTogYear(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              maxLength={4}
              required
              placeholder="2026"
              className={field}
            />
          </label>
          <label className="block text-sm font-medium">
            Issue
            <select
              value={togIssue}
              onChange={(e) => setTogIssue(Number(e.target.value))}
              className={field}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  Issue {n} ({TOG_ISSUE_MONTHS[n]})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Category
            <select
              value={togCategory}
              onChange={(e) => setTogCategory(e.target.value)}
              className={field}
            >
              {TOG_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {mode === "pdf" ? (
        <label className="mt-4 block text-sm font-medium">
          PDF file
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="mt-1 block w-full text-sm text-ink/70 file:mr-3 file:rounded-card file:border file:border-line file:bg-raised file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink-strong"
          />
        </label>
      ) : (
        <label className="mt-4 block text-sm font-medium">
          Source text
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Paste the full text of the source here"
            className={field}
          />
        </label>
      )}

      {error && <p className="mt-3 text-sm text-accent-ink">{error}</p>}
      {saved && (
        <p className="mt-3 text-sm text-good">
          Saved — ingestion has started in the background. Refresh this page
          in a minute or two to see chunk and fact counts.
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save document"}
      </button>
    </form>
  );
}
