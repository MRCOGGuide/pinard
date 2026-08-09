"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SectionOption } from "@/lib/sections";
import { TOG_CATEGORIES, togCategoryLabel, togIssueLabel } from "@/lib/tog";
import type { DocumentWithSection, IngestStats } from "./page";
import { DocumentCard } from "./DocumentCard";
import { deleteDocuments } from "./actions";

/**
 * TOG items group by year (newest first) → issue (latest first) →
 * category, under headers like "TOG 2026 · Issue 3 (July) · Articles".
 * Non-TOG documents keep their flat, newest-first order above them.
 */
function togGroups(docs: DocumentWithSection[]) {
  const categoryOrder = new Map<string, number>(
    TOG_CATEGORIES.map((c, i) => [c.value, i])
  );
  const sorted = [...docs].sort(
    (a, b) =>
      (b.tog_year ?? 0) - (a.tog_year ?? 0) ||
      (b.tog_issue ?? 0) - (a.tog_issue ?? 0) ||
      (categoryOrder.get(a.tog_category ?? "") ?? 9) -
        (categoryOrder.get(b.tog_category ?? "") ?? 9) ||
      a.title.localeCompare(b.title)
  );
  const groups: { header: string; docs: DocumentWithSection[] }[] = [];
  for (const doc of sorted) {
    const header = `TOG ${doc.tog_year} · ${togIssueLabel(doc.tog_issue ?? 0)} · ${togCategoryLabel(doc.tog_category)}`;
    const last = groups[groups.length - 1];
    if (last && last.header === header) last.docs.push(doc);
    else groups.push({ header, docs: [doc] });
  }
  return groups;
}

/**
 * Selectable document list with a bulk toolbar: select all / none,
 * ingest the selection (sequentially, so the embedding API is not
 * hammered) and delete the selection in one go.
 */
export function DocumentList({
  docs,
  stats,
  options,
}: {
  docs: DocumentWithSection[];
  stats: Record<number, IngestStats>;
  options: SectionOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = docs.length > 0 && selected.size === docs.length;

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(docs.map((d) => d.id)) : new Set());
  }

  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function bulkIngest() {
    const chosen = docs.filter((d) => selected.has(d.id));
    if (chosen.length === 0) return;
    setError(null);
    setBusy(true);
    const failures: string[] = [];
    let factErrorTotal = 0;
    for (let i = 0; i < chosen.length; i++) {
      setProgress(`Ingesting ${i + 1} of ${chosen.length}…`);
      try {
        const response = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: chosen[i].id }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          factErrors?: number;
        };
        if (!response.ok) {
          failures.push(
            `${chosen[i].title}: ${payload.error ?? `HTTP ${response.status} (likely a timeout — its chunks may still be stored; check the card)`}`
          );
        } else if (payload.factErrors) {
          factErrorTotal += payload.factErrors;
        }
      } catch {
        failures.push(`${chosen[i].title}: request failed`);
      }
    }
    setProgress(null);
    setBusy(false);
    const notes: string[] = [];
    if (failures.length > 0) {
      notes.push(
        `${failures.length} of ${chosen.length} failed:\n• ${failures.slice(0, 8).join("\n• ")}${failures.length > 8 ? `\n…and ${failures.length - 8} more` : ""}`
      );
    }
    if (factErrorTotal > 0) {
      notes.push(
        `${factErrorTotal} chunk(s) hit fact-extraction errors — filter "Partially ingested" and use "Extract facts".`
      );
    }
    setError(notes.length > 0 ? notes.join("\n") : null);
    setSelected(new Set());
    router.refresh();
  }

  async function bulkDelete() {
    const ids = docs.filter((d) => selected.has(d.id)).map((d) => d.id);
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Delete ${ids.length} document${ids.length === 1 ? "" : "s"}, their stored files, chunks and key facts? This cannot be undone.`
    );
    if (!ok) return;
    setError(null);
    setBusy(true);
    setProgress("Deleting…");
    const result = await deleteDocuments(ids);
    setProgress(null);
    setBusy(false);
    if (result.error) setError(result.error);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-card border border-hairline bg-porcelain px-4 py-2.5">
        <label className="flex items-center gap-2 text-sm font-medium text-graphite/80">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => toggleAll(e.target.checked)}
            className="h-4 w-4 accent-theatre"
          />
          Select all
        </label>
        <span className="font-mono text-xs text-graphite/55">
          {selected.size} selected
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={bulkIngest}
            disabled={busy || selected.size === 0}
            className="rounded-card border border-greentop/40 px-3 py-1.5 text-xs font-medium text-greentop hover:text-theatre disabled:opacity-40"
          >
            Ingest selected
          </button>
          <button
            type="button"
            onClick={bulkDelete}
            disabled={busy || selected.size === 0}
            className="rounded-card border border-hairline px-3 py-1.5 text-xs font-medium text-graphite/60 hover:border-heartbeat/40 hover:text-heartbeat disabled:opacity-40"
          >
            Delete selected
          </button>
        </div>
      </div>

      {progress && (
        <p className="mb-3 text-xs text-graphite/60">
          {progress} Sequential on purpose — leave this page open.
        </p>
      )}
      {error && (
        <p className="mb-3 whitespace-pre-line text-xs text-heartbeat">{error}</p>
      )}

      <ul className="space-y-3">
        {docs
          .filter((d) => !d.tog_year)
          .map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              stats={stats[doc.id] ?? null}
              options={options}
              selected={selected.has(doc.id)}
              onSelect={(checked) => toggleOne(doc.id, checked)}
            />
          ))}
      </ul>

      {togGroups(docs.filter((d) => Boolean(d.tog_year))).map((group) => (
        <div key={group.header} className="mt-5">
          <h3 className="mb-2 border-b border-hairline pb-1 font-mono text-xs font-medium uppercase tracking-wide text-greentop">
            {group.header}
          </h3>
          <ul className="space-y-3">
            {group.docs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                stats={stats[doc.id] ?? null}
                options={options}
                selected={selected.has(doc.id)}
                onSelect={(checked) => toggleOne(doc.id, checked)}
              />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
