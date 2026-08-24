"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { PRIORITY_LABELS, PRIORITY_SHORT, type Priority } from "@/lib/priority";
import { groupKey, type DuplicateGroup } from "@/lib/duplicates";
import {
  deleteQuestionsFromDocument,
  deleteSupersededDocument,
  markGroupReviewed,
  setDocumentPriority,
  unmarkGroupReviewed,
} from "./actions";

export type DocExtras = Record<
  number,
  { fileUrl: string | null; totalQuestions: number }
>;

const action =
  "rounded px-2 py-1 text-xs font-medium text-graphite/60 hover:text-theatre disabled:opacity-40";

/**
 * Superseded sets with the actions needed to resolve them in place:
 * open the file, re-tier it, purge its questions, delete it.
 */
export function SupersededGroups({
  groups,
  extras,
  reviewed = false,
}: {
  groups: DuplicateGroup[];
  extras: DocExtras;
  /** Rendering the already-checked list, so the action is to undo. */
  reviewed?: boolean;
}) {
  return (
    <ul className="space-y-3">
      {groups.map((group) => {
        const newest = group.documents[0];
        const key = groupKey(group.documents);
        return (
          <li
            key={newest.id}
            className="rounded-card border border-hairline bg-porcelain p-4 shadow-card"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-theatre">
                {newest.title}
              </h2>
              <span className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-graphite/55">
                  {group.documents.length} editions
                  {group.yearGap !== null && ` · ${group.yearGap} years apart`}
                </span>
                <ReviewedButton
                  groupKey={key}
                  documentIds={group.documents.map((d) => d.id)}
                  reviewed={reviewed}
                />
              </span>
            </div>

            {group.staleQuestions > 0 && (
              <p className="mt-1.5 text-xs text-heartbeat">
                {group.staleQuestions} approved question
                {group.staleQuestions === 1 ? "" : "s"} came from an older
                edition — review or remove them.
              </p>
            )}

            <ul className="mt-3 space-y-1.5">
              {group.documents.map((doc, i) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  newest={i === 0}
                  extras={extras[doc.id]}
                />
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function DocumentRow({
  doc,
  newest,
  extras,
}: {
  doc: DuplicateGroup["documents"][number];
  newest: boolean;
  extras?: { fileUrl: string | null; totalQuestions: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const totalQuestions = extras?.totalQuestions ?? 0;

  async function view() {
    if (!extras?.fileUrl) {
      setError("No stored file for this document");
      return;
    }
    const supabase = createClient();
    const { data, error: signError } = await supabase.storage
      .from("sources")
      .createSignedUrl(extras.fileUrl, 3600);
    if (signError || !data) {
      setError("Could not open the file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  function changePriority(priority: Priority) {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await setDocumentPriority(doc.id, priority);
      if (result.error) setError(result.error);
      else {
        setNote(`Now ${PRIORITY_SHORT[priority]}`);
        router.refresh();
      }
    });
  }

  function removeQuestions() {
    const ok = window.confirm(
      `Delete all ${totalQuestions} question${totalQuestions === 1 ? "" : "s"} generated from "${doc.title}"? Candidates' answer history for them goes too. This cannot be undone.`
    );
    if (!ok) return;
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await deleteQuestionsFromDocument(doc.id);
      if (result.error) setError(result.error);
      else {
        setNote(`${result.deleted ?? 0} question(s) removed`);
        router.refresh();
      }
    });
  }

  function removeDocument() {
    const warning =
      totalQuestions > 0
        ? `\n\nNote: its ${totalQuestions} question(s) will NOT be deleted — remove those first if they are outdated.`
        : "";
    const ok = window.confirm(
      `Delete "${doc.title}", its stored file, chunks and key facts?${warning}\n\nThis cannot be undone.`
    );
    if (!ok) return;
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await deleteSupersededDocument(doc.id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <li
      className={`rounded-card border px-3 py-2 text-sm ${
        newest ? "border-greentop/40 bg-white/70" : "border-hairline bg-white/40"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={`font-mono text-[11px] ${newest ? "text-greentop" : "text-graphite/50"}`}
        >
          {newest ? "newest" : "older"}
        </span>
        <span className="min-w-0 flex-1 text-graphite/85">
          {doc.title}
          <span className="ml-2 font-mono text-[11px] text-graphite/50">
            {doc.sourceReference || "no reference"}
            {doc.year ? ` · ${doc.year}` : " · year unknown"} ·{" "}
            {doc.sectionTitle}
          </span>
        </span>
        <span
          className={`font-mono text-[11px] ${
            !newest && doc.approvedQuestions > 0
              ? "text-heartbeat"
              : "text-graphite/50"
          }`}
        >
          {doc.approvedQuestions} approved
          {totalQuestions > doc.approvedQuestions &&
            ` · ${totalQuestions} total`}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={view}
          disabled={pending || !extras?.fileUrl}
          className={action}
        >
          View
        </button>

        <select
          value={doc.priority}
          onChange={(e) => changePriority(Number(e.target.value) as Priority)}
          disabled={pending}
          aria-label={`Priority for ${doc.title}`}
          className="rounded-card border border-hairline bg-white px-2 py-1 text-xs disabled:opacity-40"
        >
          {([1, 2, 3] as Priority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={removeQuestions}
          disabled={pending || totalQuestions === 0}
          title="Delete every question generated from this document"
          className={`${action} hover:text-heartbeat`}
        >
          Remove its questions{totalQuestions > 0 ? ` (${totalQuestions})` : ""}
        </button>

        <button
          type="button"
          onClick={removeDocument}
          disabled={pending}
          className={`${action} hover:text-heartbeat`}
        >
          Delete document
        </button>

        {pending && (
          <span className="font-mono text-[11px] text-graphite/50">
            working…
          </span>
        )}
        {note && (
          <span className="font-mono text-[11px] text-greentop">{note}</span>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-heartbeat">{error}</p>}
    </li>
  );
}

/**
 * "Checked, keep both." Some of what this screen reports is correct to
 * keep — a partial update that does not replace the original, or two
 * documents that only look alike — and without a way to say so they
 * would sit at the top of the list for ever.
 */
function ReviewedButton({
  groupKey: key,
  documentIds,
  reviewed,
}: {
  groupKey: string;
  documentIds: number[];
  reviewed: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go() {
    startTransition(async () => {
      const result = reviewed
        ? await unmarkGroupReviewed(key)
        : await markGroupReviewed(key, documentIds);
      if (result.error) setError(result.error);
      else {
        setError(null);
        router.refresh();
      }
    });
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-heartbeat">{error}</span>}
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className={
          reviewed
            ? "rounded-card border border-hairline px-2.5 py-1 text-xs font-medium text-graphite/70 hover:border-greentop hover:text-theatre disabled:opacity-50"
            : "rounded-card border border-greentop px-2.5 py-1 text-xs font-medium text-greentop hover:bg-greentop hover:text-porcelain disabled:opacity-50"
        }
      >
        {reviewed ? "Put back" : "Keep both"}
      </button>
    </span>
  );
}
