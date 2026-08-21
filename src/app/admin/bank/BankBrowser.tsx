"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SectionOption } from "@/lib/sections";
import { QuestionEditForm } from "@/components/QuestionEditForm";
import type { BankDocument, BankQuestion } from "./page";
import { deleteQuestions, updateBankQuestion } from "./actions";
import { formatReference } from "@/lib/reference";

const field =
  "mt-1 w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm";

/**
 * Browse the approved bank by section and source guideline, with the
 * bulk-delete workflow for superseded guidelines.
 */
export function BankBrowser({
  questions,
  docs,
  options,
  sectionParents,
}: {
  questions: BankQuestion[];
  docs: BankDocument[];
  options: SectionOption[];
  sectionParents: Record<number, number | null>;
}) {
  const router = useRouter();
  const [sectionId, setSectionId] = useState<number>(0); // 0 = all
  const [documentId, setDocumentId] = useState<number>(0); // 0 = all
  const [formatFilter, setFormatFilter] = useState<"all" | "sba" | "emq">("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Title plus how the source is dated — the year, or year and issue
  // for a TOG article — so provenance can be judged here rather than by
  // opening the source library in another tab.
  const docTitle = useMemo(() => {
    const m = new Map<number, string>();
    for (const d of docs) {
      const ref = formatReference({
        reference: d.source_reference,
        year: d.source_year,
        togYear: d.tog_year,
        togIssue: d.tog_issue,
      });
      m.set(d.id, ref ? `${d.title} (${ref})` : d.title);
    }
    return m;
  }, [docs]);

  // "scenario 2 of 4" for every row that belongs to an EMQ set, so a
  // scenario in this flat list is never mistaken for a long-option SBA.
  const setPosition = useMemo(() => {
    const byGroup = new Map<string, number[]>();
    for (const q of questions) {
      if (q.format !== "emq" || !q.emq_group_id) continue;
      const list = byGroup.get(q.emq_group_id);
      if (list) list.push(q.id);
      else byGroup.set(q.emq_group_id, [q.id]);
    }
    const label = new Map<number, string>();
    for (const ids of Array.from(byGroup.values())) {
      if (ids.length < 2) continue;
      ids.forEach((id, i) => label.set(id, `${i + 1} of ${ids.length}`));
    }
    return label;
  }, [questions]);

  const inSection = (qSectionId: number, target: number) =>
    target === 0 ||
    qSectionId === target ||
    sectionParents[qSectionId] === target;

  const fromDocument = (q: BankQuestion, target: number) =>
    target === 0 || (q.source_document_ids ?? []).includes(target);

  const visible = questions.filter(
    (q) =>
      inSection(q.section_id, sectionId) &&
      fromDocument(q, documentId) &&
      (formatFilter === "all" || q.format === formatFilter)
  );

  // Counts reflect the current section/guideline scope, so the tabs
  // say how many of each format are actually in view.
  const inScope = questions.filter(
    (q) => inSection(q.section_id, sectionId) && fromDocument(q, documentId)
  );

  // Guideline filter offers only documents that actually have questions
  // in the current section scope, with counts.
  const docCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const q of questions) {
      if (!inSection(q.section_id, sectionId)) continue;
      for (const d of q.source_document_ids ?? []) {
        counts.set(d, (counts.get(d) ?? 0) + 1);
      }
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, sectionId, sectionParents]);

  const sectionCount = (target: number) =>
    questions.filter((q) => inSection(q.section_id, target)).length;

  const allSelected =
    visible.length > 0 && visible.every((q) => selected.has(q.id));

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(visible.map((q) => q.id)) : new Set());
  }

  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function bulkDelete() {
    const ids = visible.filter((q) => selected.has(q.id)).map((q) => q.id);
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Delete ${ids.length} approved question${ids.length === 1 ? "" : "s"} from the bank? Candidates' answer history for them is removed too. This cannot be undone.`
    );
    if (!ok) return;
    setError(null);
    setBusy(true);
    const result = await deleteQuestions(ids);
    setBusy(false);
    if (result.error) setError(result.error);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Section
          <select
            value={sectionId}
            onChange={(e) => {
              setSectionId(Number(e.target.value));
              setDocumentId(0);
              setSelected(new Set());
            }}
            className={field}
          >
            <option value={0}>All sections ({questions.length})</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} ({sectionCount(o.id)})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium">
          Source guideline
          <select
            value={documentId}
            onChange={(e) => {
              setDocumentId(Number(e.target.value));
              setSelected(new Set());
            }}
            className={field}
          >
            <option value={0}>All guidelines</option>
            {docs
              .filter((d) => (docCounts.get(d.id) ?? 0) > 0)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({docCounts.get(d.id)})
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1">
        {(
          [
            { value: "all", label: `All (${inScope.length})` },
            {
              value: "sba",
              label: `SBA (${inScope.filter((q) => q.format === "sba").length})`,
            },
            {
              value: "emq",
              label: `EMQ (${inScope.filter((q) => q.format === "emq").length})`,
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setFormatFilter(tab.value);
              setSelected(new Set());
            }}
            className={`rounded-card border px-2.5 py-1 text-xs font-medium ${
              formatFilter === tab.value
                ? "border-theatre bg-theatre text-porcelain"
                : "border-hairline bg-porcelain text-graphite/70 hover:text-theatre"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-card border border-hairline bg-porcelain px-4 py-2.5">
        <label className="flex items-center gap-2 text-sm font-medium text-graphite/80">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => toggleAll(e.target.checked)}
            className="h-4 w-4 accent-theatre"
          />
          Select all shown
        </label>
        <span className="font-mono text-xs text-graphite/55">
          {visible.length} shown · {selected.size} selected
        </span>
        <button
          type="button"
          onClick={bulkDelete}
          disabled={busy || selected.size === 0}
          className="ml-auto rounded-card border border-hairline px-3 py-1.5 text-xs font-medium text-graphite/60 hover:border-heartbeat/40 hover:text-heartbeat disabled:opacity-40"
        >
          {busy ? "Deleting…" : "Delete selected"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-heartbeat">{error}</p>}

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-graphite/60">
          No approved questions match this filter yet. Approve questions in
          the review queue and they appear here.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map((q) => {
            const open = openId === q.id;
            const sources = (q.source_document_ids ?? [])
              .map((d) => docTitle.get(d))
              .filter(Boolean) as string[];
            if (editingId === q.id) {
              return (
                <li key={q.id}>
                  <QuestionEditForm
                    initial={{
                      stem: q.stem,
                      options: q.options,
                      correct_key: q.correct_key,
                      explanation: q.explanation ?? "",
                      explanations: q.explanations.map((e) => ({
                        key: e.key,
                        verdict: e.verdict,
                        text: e.text,
                        citation_chunk_ids: e.citation_chunk_ids,
                        source_reference: e.source_reference,
                      })),
                    }}
                    onCancel={() => setEditingId(null)}
                    onSave={async (input) => {
                      const result = await updateBankQuestion(q.id, input);
                      if (!result.error) {
                        setEditingId(null);
                        router.refresh();
                      }
                      return result;
                    }}
                  />
                </li>
              );
            }
            return (
              <li
                key={q.id}
                className="rounded-card border border-hairline bg-porcelain p-4 shadow-card"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(q.id)}
                    onChange={(e) => toggleOne(q.id, e.target.checked)}
                    aria-label="Select question"
                    className="mt-1 h-4 w-4 shrink-0 accent-theatre"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-hairline px-2 py-0.5 font-mono uppercase text-graphite/60">
                        {q.format}
                      </span>
                      {setPosition.get(q.id) && (
                        <span
                          title="One scenario of an EMQ set. Candidates see the whole set together; deleting any scenario deletes the set."
                          className="rounded-full bg-sage px-2 py-0.5 font-mono text-[10px] text-greentop"
                        >
                          set · scenario {setPosition.get(q.id)}
                        </span>
                      )}
                      <span className="text-graphite/60">
                        {q.sections?.title ?? "Unassigned"}
                      </span>
                      {q.difficulty && (
                        <span className="font-mono text-graphite/50">
                          difficulty {q.difficulty}/5
                        </span>
                      )}
                      <span className="font-mono text-graphite/45">
                        generated{" "}
                        {new Date(q.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {q.reviewed_at && (
                        <span className="font-mono text-graphite/45">
                          approved{" "}
                          {new Date(q.reviewed_at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-graphite/90">
                      {open ? q.stem : `${q.stem.slice(0, 180)}${q.stem.length > 180 ? "…" : ""}`}
                    </p>
                    <p className="mt-1 text-xs text-graphite/55">
                      {sources.length > 0
                        ? `From: ${sources.join("; ")}`
                        : "From: (source document unknown — generated before provenance tracking)"}
                    </p>

                    {open && (
                      <div className="mt-3 border-t border-hairline pt-3">
                        {q.lead_in && (
                          <p className="mb-2 text-sm italic text-graphite/75">
                            {q.lead_in}
                          </p>
                        )}
                        <ol className="space-y-1">
                          {q.options.map((o) => (
                            <li
                              key={o.key}
                              className={`flex gap-2 text-sm ${
                                o.key === q.correct_key
                                  ? "font-medium text-greentop"
                                  : "text-graphite/85"
                              }`}
                            >
                              <span className="font-mono text-xs leading-5">
                                {o.key}
                              </span>
                              <span>
                                {o.text}
                                {o.key === q.correct_key && (
                                  <span aria-hidden> ✓</span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ol>
                        {q.explanation && (
                          <p className="mt-3 rounded-card border border-hairline bg-white/60 p-3 text-sm leading-relaxed text-graphite/85">
                            {q.explanation}
                          </p>
                        )}
                        <div className="mt-3 space-y-1.5">
                          {q.explanations.map((e) => (
                            <p key={e.key} className="text-sm text-graphite/80">
                              <span
                                className={`font-mono text-xs ${
                                  e.verdict === "correct"
                                    ? "text-greentop"
                                    : "text-graphite/50"
                                }`}
                              >
                                {e.key} {e.verdict === "correct" ? "✓" : "✗"}
                              </span>{" "}
                              {e.text}
                              {e.source_reference && (
                                <span className="ml-1 font-mono text-[11px] text-graphite/50">
                                  ({e.source_reference})
                                </span>
                              )}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : q.id)}
                      className="rounded px-2 py-1 text-xs font-medium text-greentop hover:text-theatre"
                    >
                      {open ? "Collapse" : "View"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(q.id)}
                      className="rounded px-2 py-1 text-xs font-medium text-graphite/60 hover:text-theatre"
                    >
                      Edit
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
