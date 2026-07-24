"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SectionOption } from "@/lib/sections";
import type { DocumentWithSection, IngestStats } from "./page";
import { deleteDocument, updateDocument } from "./actions";

const statusStyles: Record<string, string> = {
  uploaded: "text-graphite/60 border-hairline",
  processing: "text-greentop border-greentop/40",
  ingested: "text-greentop border-greentop",
  failed: "text-heartbeat border-heartbeat/50",
};

const smallBtn =
  "rounded px-2 py-1 text-xs font-medium text-graphite/60 hover:text-theatre disabled:opacity-40";

const field =
  "mt-1 w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm";

export function DocumentCard({
  doc,
  stats,
  options,
  selected,
  onSelect,
}: {
  doc: DocumentWithSection;
  stats: IngestStats | null;
  options: SectionOption[];
  selected: boolean;
  onSelect: (checked: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editSectionId, setEditSectionId] = useState(doc.section_id);
  const [editTitle, setEditTitle] = useState(doc.title);
  const [editReference, setEditReference] = useState(doc.source_reference);
  const [editYear, setEditYear] = useState(
    doc.source_year ? String(doc.source_year) : ""
  );
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setEditSectionId(doc.section_id);
    setEditTitle(doc.title);
    setEditReference(doc.source_reference);
    setEditYear(doc.source_year ? String(doc.source_year) : "");
    setError(null);
    setEditing(true);
  }

  function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    startTransition(async () => {
      const result = await updateDocument(doc.id, {
        sectionId: editSectionId,
        title: editTitle,
        sourceReference: editReference,
        sourceYear: editYear ? Number(editYear) : null,
      });
      setSaving(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  async function view() {
    if (!doc.file_url) return;
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("sources")
      .createSignedUrl(doc.file_url, 3600);
    if (error || !data) {
      setError("Could not open the file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function ingest() {
    setError(null);
    setIngesting(true);
    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        factsSkipped?: boolean;
      };
      if (!response.ok) {
        setError(payload.error ?? "Ingestion failed");
      } else if (payload.factsSkipped) {
        setError(
          "Chunks stored, but key facts were skipped — ANTHROPIC_API_KEY is not set."
        );
      }
    } catch {
      setError("Ingestion request failed — is the server running?");
    } finally {
      setIngesting(false);
      router.refresh();
    }
  }

  function remove() {
    const ok = window.confirm(
      `Delete "${doc.title}", its stored file, chunks and key facts? This cannot be undone.`
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteDocument(doc.id);
      if (result.error) setError(result.error);
    });
  }

  const ingested = (stats?.chunk_count ?? 0) > 0;

  return (
    <li className="rounded-card border border-hairline bg-porcelain p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select ${doc.title}`}
            className="mt-1 h-4 w-4 shrink-0 accent-theatre"
          />
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold text-theatre">
              {doc.title}
            </h3>
            <p className="mt-0.5 font-mono text-xs text-graphite/60">
              {doc.source_reference}
              {doc.source_year ? ` · ${doc.source_year}` : ""}
            </p>
            <p className="mt-1 text-xs text-graphite/60">
              {doc.sections?.title ?? "Unassigned"} · uploaded{" "}
              {new Date(doc.uploaded_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {ingested && (
                <span className="font-mono">
                  {" "}
                  · {stats!.chunk_count} chunks · {stats!.fact_count} facts
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${
              statusStyles[ingesting ? "processing" : doc.status] ??
              statusStyles.uploaded
            }`}
          >
            {ingesting ? "processing" : doc.status}
          </span>
          <button
            type="button"
            onClick={ingest}
            disabled={ingesting}
            className="rounded px-2 py-1 text-xs font-medium text-greentop hover:text-theatre disabled:opacity-40"
          >
            {ingesting ? "Ingesting…" : ingested ? "Re-ingest" : "Ingest"}
          </button>
          {ingested && (
            <Link
              href={`/admin/sources/${doc.id}`}
              className="rounded px-2 py-1 text-xs font-medium text-greentop hover:text-theatre"
            >
              Inspect
            </Link>
          )}
          {doc.file_url && (
            <button type="button" onClick={view} className={smallBtn}>
              View
            </button>
          )}
          <button
            type="button"
            onClick={editing ? () => setEditing(false) : openEdit}
            className={smallBtn}
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className={`${smallBtn} hover:text-heartbeat`}
          >
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <form
          onSubmit={saveEdit}
          className="mt-3 rounded-card border border-hairline bg-white/60 p-4"
        >
          <label className="block text-sm font-medium">
            Section
            <select
              value={editSectionId}
              onChange={(e) => setEditSectionId(Number(e.target.value))}
              className={field}
            >
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block text-sm font-medium">
              Title
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                className={field}
              />
            </label>
            <label className="block text-sm font-medium sm:w-28">
              Year
              <input
                value={editYear}
                onChange={(e) =>
                  setEditYear(e.target.value.replace(/\D/g, ""))
                }
                inputMode="numeric"
                maxLength={4}
                className={field}
              />
            </label>
          </div>

          <label className="mt-3 block text-sm font-medium">
            Source reference
            <input
              value={editReference}
              onChange={(e) => setEditReference(e.target.value)}
              required
              className={field}
            />
          </label>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-card bg-theatre px-4 py-2 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-card border border-hairline bg-porcelain px-4 py-2 text-sm font-medium text-graphite/70 hover:text-theatre"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-xs text-graphite/55">
            Changing the section also moves this document&rsquo;s ingested
            chunks and key facts — no need to re-ingest.
          </p>
        </form>
      )}

      {ingesting && (
        <p className="mt-2 text-xs text-graphite/60">
          Chunking, embedding and extracting key facts — this can take a few
          minutes for a long guideline. Leave this page open.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-heartbeat">{error}</p>}
    </li>
  );
}
