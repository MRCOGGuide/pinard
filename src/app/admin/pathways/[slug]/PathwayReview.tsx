"use client";

import { useState, useTransition } from "react";
import { buttonClass, FIELD_CLASS } from "@/components/ui";
import {
  PATHWAY_FIELDS,
  type PathwayBody,
  type PathwayConflict,
  type PathwayItem,
  type PathwayStatus,
} from "@/lib/pathway-shape";
import { chooseConflictPosition, removePathwayItem, reviewPathway } from "../actions";

export type SourcePassage = { title: string; reference: string; text: string };

const STATUS_LABEL: Record<PathwayStatus, string> = {
  draft: "Waiting for review",
  needs_changes: "Needs changes",
  approved: "Approved: used in Ask Pinard's answers",
  not_in_sources: "Not in the sources",
};

function Sources({ ids, sources }: { ids: number[]; sources: Record<number, SourcePassage> }) {
  return (
    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
      {ids.map((id) => {
        const s = sources[id];
        return (
          <details key={id} className="font-ui text-[13px] text-ink/65">
            <summary className="cursor-pointer underline decoration-line underline-offset-2 hover:text-ink-strong">
              {s ? `${s.title}${s.reference ? `, ${s.reference}` : ""}` : `Passage ${id} (no longer in the library)`}
            </summary>
            {s && (
              <p className="mt-2 max-w-[44rem] whitespace-pre-line rounded-control border border-line bg-sunk p-3 text-[14px] leading-relaxed text-ink/85">
                {s.text}
              </p>
            )}
          </details>
        );
      })}
    </span>
  );
}

export function PathwayReview(props: {
  slug: string;
  status: PathwayStatus;
  body: PathwayBody;
  gaps: string[];
  conflicts: PathwayConflict[];
  removed: string[];
  note: string;
  sources: Record<number, SourcePassage>;
}) {
  const { slug, sources } = props;
  const [body, setBody] = useState(props.body);
  const [conflicts, setConflicts] = useState(props.conflicts);
  const [status, setStatus] = useState(props.status);
  const [note, setNote] = useState(props.note);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const locked = status === "approved";

  function remove(field: keyof PathwayBody, index: number, item: PathwayItem) {
    if (!window.confirm(`Remove this line?\n\n${item.text}`)) return;
    start(async () => {
      const result = await removePathwayItem({ slug, field, index });
      if (result.error) return setError(result.error);
      setBody((b) => ({ ...b, [field]: b[field].filter((_, i) => i !== index) }));
      setError(null);
    });
  }

  function choose(conflict: number, position: number | null) {
    start(async () => {
      const result = await chooseConflictPosition({ slug, conflict, position });
      if (result.error) return setError(result.error);
      setConflicts((cs) => cs.map((c, i) => (i === conflict ? { ...c, chosen: position } : c)));
      setError(null);
    });
  }

  function review(next: "approved" | "needs_changes" | "draft") {
    start(async () => {
      const result = await reviewPathway({ slug, status: next, note });
      if (result.error) return setError(result.error);
      setStatus(next);
      setError(null);
      setSaved(next === "approved" ? "Approved." : next === "needs_changes" ? "Sent back with your note." : "Back to draft.");
    });
  }

  const unchosen = conflicts.filter((c) => c.chosen === undefined || c.chosen === null).length;

  return (
    <div className="space-y-6">
      <p className="font-ui text-[15px] font-semibold text-ink-strong">{STATUS_LABEL[status]}</p>

      {conflicts.length > 0 && (
        <section className="rounded-card border border-accent/40 bg-surface p-5">
          <h2 className="font-ui text-[17px] font-semibold text-ink-strong">Where the sources disagree</h2>
          <p className="mt-1 font-ui text-[14px] text-ink/70">
            Choose which takes priority. Until you do, the point is left out of answers.
          </p>
          {conflicts.map((c, ci) => (
            <fieldset key={ci} className="mt-4 border-t border-line pt-4">
              <legend className="font-ui text-[15px] font-semibold text-ink-strong">{c.topic}</legend>
              <div className="mt-2 space-y-3">
                {c.positions.map((p, pi) => (
                  <label key={pi} className="flex gap-3">
                    <input
                      type="radio"
                      name={`conflict-${ci}`}
                      checked={c.chosen === pi}
                      disabled={pending || locked}
                      onChange={() => choose(ci, pi)}
                      className="mt-1.5"
                    />
                    <span>
                      <span className="reading text-[16px] text-ink/90">{p.text}</span>
                      <Sources ids={p.chunks} sources={sources} />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </section>
      )}

      {PATHWAY_FIELDS.map(({ key, label }) => {
        const items = body[key];
        if (items.length === 0) return null;
        return (
          <section key={key}>
            <h2 className="mb-2 font-ui text-[17px] font-semibold text-ink-strong">{label}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {items.map((item, i) => (
                <li key={`${key}-${i}`} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="reading text-[16px] text-ink/90">
                      {item.when && <span className="font-semibold text-ink-strong">{item.when}: </span>}
                      {item.text}
                      {item.where && <span className="text-ink/55"> ({item.where})</span>}
                    </p>
                    <Sources ids={item.chunks} sources={sources} />
                  </div>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => remove(key, i, item)}
                      disabled={pending}
                      className="shrink-0 font-ui text-[13px] text-ink/60 underline underline-offset-2 hover:text-accent-ink"
                    >
                      Remove this line
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {props.gaps.length > 0 && (
        <section>
          <h2 className="mb-2 font-ui text-[17px] font-semibold text-ink-strong">What the sources leave out</h2>
          <ul className="list-disc space-y-1 pl-6 reading text-[16px] text-ink/85">
            {props.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </section>
      )}

      {props.removed.length > 0 && (
        <details className="rounded-card border border-line bg-surface p-4">
          <summary className="cursor-pointer font-ui text-[15px] font-semibold text-ink-strong">
            Lines the checks removed ({props.removed.length})
          </summary>
          <ul className="mt-3 list-disc space-y-1 pl-6 font-ui text-[14px] text-ink/75">
            {props.removed.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </details>
      )}

      <section className="rounded-card border border-line bg-surface p-5">
        <label className="font-ui text-[14px] text-ink/70">
          Your note (what to change, or anything to remember)
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={`${FIELD_CLASS} mt-1 w-full`} />
        </label>
        {unchosen > 0 && !locked && (
          <p className="mt-2 font-ui text-[14px] text-ink/70">
            {unchosen === 1 ? "One disagreement is" : `${unchosen} disagreements are`} still to choose. You can approve now; those
            points stay out of answers until you choose.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {locked ? (
            <button type="button" onClick={() => review("draft")} disabled={pending} className={buttonClass("secondary", "sm")}>
              Set back to draft to change it
            </button>
          ) : (
            <>
              <button type="button" onClick={() => review("approved")} disabled={pending || status === "not_in_sources"} className={buttonClass("primary", "sm")}>
                Approve
              </button>
              <button type="button" onClick={() => review("needs_changes")} disabled={pending} className={buttonClass("secondary", "sm")}>
                Needs changes
              </button>
            </>
          )}
          {saved && <span className="font-ui text-[14px] text-ink/70">{saved}</span>}
          {error && <span className="font-ui text-[14px] text-accent-ink">{error}</span>}
        </div>
      </section>
    </div>
  );
}
