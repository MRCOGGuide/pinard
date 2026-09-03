"use client";

import { useState, useTransition } from "react";
import type { ExamPart, Section, SectionPriority } from "@/lib/types";
import {
  createSection,
  deleteSection,
  moveSection,
  renameSection,
  reparentSection,
  setSectionActive,
  setSectionPriority,
} from "./actions";

type Node = Section & { children: Section[] };

const btn =
  "rounded px-2 py-1 text-xs font-medium text-graphite/60 hover:text-theatre disabled:opacity-30";

/**
 * The tier reads at a glance down the tree — green core, amber
 * supporting, rose background — so a mis-tiered section is visible
 * without reading every row. Amber is the coverage bars' existing
 * midpoint, so this introduces no new hue.
 */
const PRIORITY_STYLE: Record<SectionPriority, string> = {
  1: "border-greentop/50 bg-greentop/10 text-greentop",
  2: "border-amber/50 bg-amber/10 text-amber",
  3: "border-heartbeat/40 bg-heartbeat/10 text-heartbeat",
};

export function SectionsManager({
  exam,
  tree,
}: {
  exam: ExamPart;
  tree: Node[];
}) {
  return (
    <div className="space-y-3">
      {tree.length === 0 && (
        <p className="text-sm text-graphite/60">
          No sections yet for this exam. Add the first one below.
        </p>
      )}

      {tree.map((parent, i) => (
        <div
          key={parent.id}
          className="rounded-card border border-hairline bg-porcelain p-4 shadow-card"
        >
          <SectionRow
            section={parent}
            first={i === 0}
            last={i === tree.length - 1}
            heading
            parents={tree}
          />

          {parent.children.length > 0 && (
            <ul className="mt-2 divide-y divide-hairline border-t border-hairline pl-4">
              {parent.children.map((child, j) => (
                <li key={child.id} className="py-1">
                  <SectionRow
                    section={child}
                    first={j === 0}
                    last={j === parent.children.length - 1}
                    parents={tree}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 pl-4">
            <AddForm
              exam={exam}
              parentId={parent.id}
              placeholder="New sub-topic"
              label="Add sub-topic"
            />
          </div>
        </div>
      ))}

      <div className="rounded-card border border-dashed border-hairline p-4">
        <AddForm
          exam={exam}
          parentId={null}
          placeholder="New section title"
          label="Add section"
        />
      </div>
    </div>
  );
}

function SectionRow({
  section,
  first,
  last,
  heading = false,
  parents,
}: {
  section: Section;
  first: boolean;
  last: boolean;
  heading?: boolean;
  parents: Node[];
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Where this row could go: top level (if it's a sub-topic), or under
  // any other top-level section. The server enforces the two-level rule.
  const destinations: { value: string; label: string }[] = [
    ...(section.parent_id !== null
      ? [{ value: "top", label: "Top level — its own section" }]
      : []),
    ...parents
      .filter((p) => p.id !== section.id && p.id !== section.parent_id)
      .map((p) => ({ value: String(p.id), label: `Under “${p.title}”` })),
  ];

  function moveTo(value: string) {
    setMoveError(null);
    startTransition(async () => {
      const result = await reparentSection(
        section.id,
        value === "top" ? null : Number(value)
      );
      if (result.error) setMoveError(result.error);
      else setMoving(false);
    });
  }

  function saveRename() {
    const next = title.trim();
    if (!next || next === section.title) {
      setTitle(section.title);
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await renameSection(section.id, next);
      setEditing(false);
    });
  }

  function remove() {
    const ok = window.confirm(
      `Delete "${section.title}"? Any sub-topics, documents and questions attached to it are deleted too.`
    );
    if (!ok) return;
    startTransition(async () => {
      await deleteSection(section.id);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {editing ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveRename();
            if (e.key === "Escape") {
              setTitle(section.title);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 rounded-card border border-hairline bg-white px-2 py-1 text-sm"
        />
      ) : (
        <span
          className={`min-w-0 flex-1 ${
            heading
              ? "font-display text-base font-semibold text-theatre"
              : "text-sm"
          } ${section.is_active ? "" : "text-graphite/40 line-through decoration-hairline"}`}
        >
          {section.title}
          {!section.is_active && (
            <span className="ml-2 align-middle font-sans text-[10px] font-medium uppercase tracking-wide text-graphite/50 no-underline">
              hidden
            </span>
          )}
        </span>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          className={btn}
          disabled={pending || first}
          aria-label="Move up"
          onClick={() =>
            startTransition(async () => {
              await moveSection(section.id, "up");
            })
          }
        >
          ↑
        </button>
        <button
          type="button"
          className={btn}
          disabled={pending || last}
          aria-label="Move down"
          onClick={() =>
            startTransition(async () => {
              await moveSection(section.id, "down");
            })
          }
        >
          ↓
        </button>
        {editing ? (
          <button
            type="button"
            className={btn}
            disabled={pending}
            onClick={saveRename}
          >
            Save
          </button>
        ) : (
          <button
            type="button"
            className={btn}
            disabled={pending}
            onClick={() => setEditing(true)}
          >
            Rename
          </button>
        )}
        {/* Every section is examined; the tier decides how much of a
            candidate's revision, and of the generated bank, it is worth.
            A select rather than a toggle because there are three of
            them and the middle one is not a compromise. */}
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Priority for {section.title}</span>
          <select
            value={section.priority ?? 2}
            disabled={pending}
            onChange={(e) =>
              startTransition(async () => {
                await setSectionPriority(
                  section.id,
                  Number(e.target.value) as SectionPriority
                );
              })
            }
            className={`rounded-card border px-2 py-1 font-mono text-[11px] font-medium disabled:opacity-50 ${
              PRIORITY_STYLE[(section.priority ?? 2) as SectionPriority]
            }`}
          >
            <option value={1}>1 · core</option>
            <option value={2}>2 · supporting</option>
            <option value={3}>3 · background</option>
          </select>
        </label>
        <button
          type="button"
          className={btn}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setSectionActive(section.id, !section.is_active);
            })
          }
        >
          {section.is_active ? "Hide" : "Show"}
        </button>
        {destinations.length > 0 && (
          <button
            type="button"
            className={btn}
            disabled={pending}
            onClick={() => {
              setMoveError(null);
              setMoving((m) => !m);
            }}
          >
            {moving ? "Cancel" : "Move"}
          </button>
        )}
        <button
          type="button"
          className={`${btn} hover:text-heartbeat`}
          disabled={pending}
          onClick={remove}
        >
          Delete
        </button>
      </div>

      {moving && (
        <div className="flex w-full items-center gap-2 pt-1">
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) moveTo(e.target.value);
            }}
            disabled={pending}
            className="rounded-card border border-hairline bg-white px-2 py-1 text-xs"
          >
            <option value="" disabled>
              Move to…
            </option>
            {destinations.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-graphite/50">
            Documents and questions move with it.
          </span>
        </div>
      )}
      {moveError && (
        <p className="w-full pt-1 text-xs text-heartbeat">{moveError}</p>
      )}
    </div>
  );
}

function AddForm({
  exam,
  parentId,
  placeholder,
  label,
}: {
  exam: ExamPart;
  parentId: number | null;
  placeholder: string;
  label: string;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    startTransition(async () => {
      const result = await createSection(exam, title, parentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setTitle("");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-card border border-hairline bg-white px-3 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={pending || !title.trim()}
        className="rounded-card bg-theatre px-3 py-1.5 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-50"
      >
        {label}
      </button>
      {error && <p className="w-full text-xs text-heartbeat">{error}</p>}
    </form>
  );
}
