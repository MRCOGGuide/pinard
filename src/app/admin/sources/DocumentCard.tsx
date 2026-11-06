"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SectionOption } from "@/lib/sections";
import { TOG_CATEGORIES, TOG_ISSUE_MONTHS, togCategoryLabel, togIssueLabel } from "@/lib/tog";
import { PRIORITY_LABELS, PRIORITY_SHORT, type Priority } from "@/lib/priority";
import { aidTone, questionTone, type SourceProgress, type Tone } from "@/lib/source-status";
import type { DocumentWithSection, IngestStats } from "./page";
import { AidSearchControl } from "./AidSearchControl";
import { GenerateFromSource } from "./GenerateFromSource";
import { deleteDocument, updateDocument } from "./actions";

const statusStyles: Record<string, string> = {
  uploaded: "text-ink/65 border-line",
  processing: "text-good border-good/40",
  ingested: "text-good border-good",
  failed: "text-accent-ink border-accent/50",
};

const smallBtn =
  "rounded px-2 py-1 text-xs font-medium text-ink/65 hover:text-ink-strong disabled:opacity-40";

const field =
  "mt-1 min-h-11 w-full rounded-control border border-line bg-raised px-3 py-2 font-ui text-[16px] text-ink focus:border-good focus:outline-none focus:ring-2 focus:ring-good/30";

const FILL: Record<Tone, string> = {
  red: "bg-[rgb(var(--c-fill-red))]",
  yellow: "bg-[rgb(var(--c-fill-yellow))]",
  green: "bg-[rgb(var(--c-fill-green))]",
  neutral: "",
};
const INK: Record<Tone, string> = {
  red: "text-accent-ink",
  yellow: "text-warn",
  green: "text-good",
  neutral: "text-ink-strong",
};

/**
 * One figure in a source's row of counts. The same four in the same places
 * on every card (owner, 5 November 2026: the counts were too faint to pick
 * out), so a gap can be seen going down the list, and coloured for how much
 * has been made (lib/source-status).
 */
function Count({ label, value, note, tone = "neutral" }: { label: string; value: number | string; note?: string; tone?: Tone }) {
  return (
    <div className="bg-surface">
      <div className={`h-full px-3 py-2 ${FILL[tone]}`}>
        <dt className="font-ui text-[13px] font-medium text-ink/75">{label}</dt>
        <dd className="flex min-h-8 flex-wrap items-baseline gap-x-1.5">
          {typeof value === "number" ? (
            <span className={`font-ui text-[22px] font-bold leading-8 tabular-nums ${INK[tone]}`}>{value}</span>
          ) : (
            <span className={`font-ui text-[15px] font-semibold leading-8 ${INK[tone]}`}>{value}</span>
          )}
          {note && <span className="font-ui text-[13px] font-medium text-ink/75">{note}</span>}
        </dd>
      </div>
    </div>
  );
}

/** Top right of the card: done, partly done, or nothing done (owner, 6 November 2026). */
function ProgressBadge({ progress }: { progress: SourceProgress }) {
  const left = progress.missing.join(", ");
  if (progress.state === "complete") {
    return (
      <span role="img" aria-label="Complete" title="Complete" className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-good text-surface">
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      </span>
    );
  }
  const partial = progress.state === "partial";
  const label = `${partial ? "Partly done" : "Nothing done yet"}. Still to do: ${left}`;
  return (
    <span role="img" aria-label={label} title={label} className="absolute right-3 top-3">
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M10.3 3.6a2 2 0 0 1 3.4 0l8.5 14.6a2 2 0 0 1-1.7 3H3.5a2 2 0 0 1-1.7-3z" fill={partial ? "#E8B100" : "#C22A45"} />
        <path d="M12 9v5" stroke={partial ? "#3A2A00" : "#FFFFFF"} strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="12" cy="17.3" r="1.3" fill={partial ? "#3A2A00" : "#FFFFFF"} />
      </svg>
    </span>
  );
}

const NOT_INGESTED: SourceProgress = { state: "none", missing: ["ingestion"] };

const panel = "rounded-control border border-line p-3";
const panelTitle = "font-ui text-[14px] font-semibold text-ink-strong";

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
  const [editIsTog, setEditIsTog] = useState(Boolean(doc.tog_year));
  const [editTogYear, setEditTogYear] = useState(
    doc.tog_year ? String(doc.tog_year) : ""
  );
  const [editTogIssue, setEditTogIssue] = useState(doc.tog_issue ?? 1);
  const [editTogCategory, setEditTogCategory] = useState(
    doc.tog_category ?? TOG_CATEGORIES[0].value
  );
  const [editPriority, setEditPriority] = useState<Priority>(
    (doc.priority ?? 2) as Priority
  );
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setEditSectionId(doc.section_id);
    setEditTitle(doc.title);
    setEditReference(doc.source_reference);
    setEditYear(doc.source_year ? String(doc.source_year) : "");
    setEditIsTog(Boolean(doc.tog_year));
    setEditTogYear(doc.tog_year ? String(doc.tog_year) : "");
    setEditTogIssue(doc.tog_issue ?? 1);
    setEditTogCategory(doc.tog_category ?? TOG_CATEGORIES[0].value);
    setEditPriority((doc.priority ?? 2) as Priority);
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
        priority: editPriority,
        togYear: editIsTog && editTogYear ? Number(editTogYear) : null,
        togIssue: editIsTog ? editTogIssue : null,
        togCategory: editIsTog ? editTogCategory : null,
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

  async function ingest(factsOnly = false) {
    setError(null);
    setIngesting(true);
    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id, factsOnly }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        factsSkipped?: boolean;
        factErrors?: number;
        factErrorSample?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? `Ingestion failed (HTTP ${response.status})`);
      } else if (payload.factsSkipped) {
        setError(
          "Chunks stored, but key facts were skipped, ANTHROPIC_API_KEY is not set."
        );
      } else if (payload.factErrors && payload.factErrors > 0) {
        setError(
          `${payload.factErrors} chunk(s) failed fact extraction (${payload.factErrorSample ?? "API error"}). Click "Extract facts" to retry just the facts.`
        );
      }
    } catch {
      setError("Ingestion request failed: is the server running?");
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
  const pdf = Boolean(doc.file_url?.endsWith(".pdf"));
  const aidCount = stats?.aid_count ?? 0;
  const searched = stats?.aids_searched ?? false;
  const questions = stats?.questions;
  const generated = { sba: (questions?.sba ?? 0) + (questions?.waitingSba ?? 0), emq: (questions?.emq ?? 0) + (questions?.waitingEmq ?? 0) };
  const countNote = (waiting: number, max: boolean) =>
    [waiting > 0 ? `+${waiting} waiting` : "", max ? "reached max" : ""].filter(Boolean).join(", ") || undefined;

  return (
    <li className="relative rounded-card border border-line bg-surface p-4 shadow-card">
      <ProgressBadge progress={stats?.progress ?? NOT_INGESTED} />
      <div className="flex flex-wrap items-start justify-between gap-2 pr-8">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select ${doc.title}`}
            className="mt-1 h-4 w-4 shrink-0 accent-brand"
          />
          <div className="min-w-0">
            <h3 className="font-display text-[19px] font-semibold leading-snug text-ink-strong">
              {doc.title}
            </h3>
            <p className="mt-0.5 font-mono text-xs text-ink/65">
              {doc.source_reference}
              {doc.source_year ? ` · ${doc.source_year}` : ""}
              <span
                title={PRIORITY_LABELS[(doc.priority ?? 2) as Priority]}
                className={
                  (doc.priority ?? 2) === 1
                    ? "ml-2 rounded-full bg-sunk px-1.5 py-0.5 text-micro text-good"
                    : "ml-2 rounded-full border border-line px-1.5 py-0.5 text-micro text-ink/65"
                }
              >
                {PRIORITY_SHORT[(doc.priority ?? 2) as Priority]}
              </span>
            </p>
            {doc.tog_year && (
              <p className="mt-0.5 font-mono text-label text-good">
                TOG {doc.tog_year} · {togIssueLabel(doc.tog_issue ?? 0)} ·{" "}
                {togCategoryLabel(doc.tog_category)}
              </p>
            )}
            <p className="mt-1 text-xs text-ink/65">
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
            className={`rounded-full border px-2 py-0.5 font-mono text-label ${
              statusStyles[ingesting ? "processing" : doc.status] ??
              statusStyles.uploaded
            }`}
          >
            {ingesting ? "processing" : doc.status}
          </span>
          <button
            type="button"
            onClick={() => ingest(false)}
            disabled={ingesting}
            className="rounded px-2 py-1 text-xs font-medium text-good hover:text-ink-strong disabled:opacity-40"
          >
            {ingesting ? "Ingesting…" : ingested ? "Re-ingest" : "Ingest"}
          </button>
          {ingested && stats!.fact_count === 0 && (
            <button
              type="button"
              onClick={() => ingest(true)}
              disabled={ingesting}
              className="rounded px-2 py-1 text-xs font-medium text-good hover:text-ink-strong disabled:opacity-40"
              title="Keep the stored chunks and re-run key-fact extraction only"
            >
              Extract facts
            </button>
          )}
          {ingested && (
            <Link
              href={`/admin/sources/${doc.id}`}
              className="rounded px-2 py-1 text-xs font-medium text-good hover:text-ink-strong"
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
            className={`${smallBtn} hover:text-accent-ink`}
          >
            Delete
          </button>
        </div>
      </div>

      {ingested && (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line sm:grid-cols-4">
            <Count label="SBA" value={stats!.questions.sba} tone={questionTone(generated.sba)} note={countNote(stats!.questions.waitingSba, stats!.max.sba)} />
            <Count
              label={stats!.questions.emq === 1 ? "EMQ set" : "EMQ sets"}
              value={stats!.questions.emq}
              tone={questionTone(generated.emq)}
              note={countNote(stats!.questions.waitingEmq, stats!.max.emq)}
            />
            {aidCount > 0 || searched ? (
              <Count
                label={aidCount === 1 ? "Decision aid" : "Decision aids"}
                value={aidCount}
                tone={aidTone(aidCount, searched, pdf)}
                note={aidCount === 0 ? "none found" : undefined}
              />
            ) : (
              <Count label="Decision aids" value={pdf ? "Not searched yet" : "Not a PDF"} tone={aidTone(aidCount, searched, pdf)} />
            )}
            <Count label="Waiting for review" value={stats!.questions.waiting} />
          </dl>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <section className={panel}>
              <h4 className={panelTitle}>Generate questions</h4>
              <GenerateFromSource documentId={doc.id} max={stats!.max} />
            </section>
            {pdf && (
              <section className={panel}>
                <h4 className={panelTitle}>Find decision aids</h4>
                <AidSearchControl documentId={doc.id} aidCount={aidCount} searched={searched} uploadedAt={doc.uploaded_at} />
              </section>
            )}
          </div>
        </>
      )}

      {editing && (
        <form
          onSubmit={saveEdit}
          className="mt-3 rounded-card border border-line bg-raised/60 p-4"
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

          <label className="mt-3 block text-sm font-medium">
            Exam priority
            <select
              value={editPriority}
              onChange={(e) =>
                setEditPriority(Number(e.target.value) as Priority)
              }
              className={field}
            >
              {([1, 2, 3] as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-ink/65">
              Core material is served first when a candidate&rsquo;s exam is
              close.
            </span>
          </label>

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={editIsTog}
              onChange={(e) => setEditIsTog(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            This is a TOG item
          </label>

          {editIsTog && (
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium">
                TOG year
                <input
                  value={editTogYear}
                  onChange={(e) =>
                    setEditTogYear(e.target.value.replace(/\D/g, ""))
                  }
                  inputMode="numeric"
                  maxLength={4}
                  required
                  className={field}
                />
              </label>
              <label className="block text-sm font-medium">
                Issue
                <select
                  value={editTogIssue}
                  onChange={(e) => setEditTogIssue(Number(e.target.value))}
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
                  value={editTogCategory}
                  onChange={(e) => setEditTogCategory(e.target.value)}
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

          <div className="mt-4 flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="btn-motion inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-xs text-ink/65">
            Changing the section also moves this document&rsquo;s ingested
            chunks and key facts: no need to re-ingest.
          </p>
        </form>
      )}

      {ingesting && (
        <p className="mt-2 text-xs text-ink/65">
          Chunking, embedding and extracting key facts, this can take a few
          minutes for a long guideline. Leave this page open.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-accent-ink">{error}</p>}
    </li>
  );
}
