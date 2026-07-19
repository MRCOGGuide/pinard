"use client";

import { useState, useTransition } from "react";
import type { ExamPart, Section } from "@/lib/types";
import {
  createSection,
  deleteSection,
  moveSection,
  renameSection,
  setSectionActive,
} from "./actions";

type Node = Section & { children: Section[] };

const btn =
  "rounded px-2 py-1 text-xs font-medium text-graphite/60 hover:text-theatre disabled:opacity-30";

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
          />

          {parent.children.length > 0 && (
            <ul className="mt-2 divide-y divide-hairline border-t border-hairline pl-4">
              {parent.children.map((child, j) => (
                <li key={child.id} className="py-1">
                  <SectionRow
                    section={child}
                    first={j === 0}
                    last={j === parent.children.length - 1}
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
}: {
  section: Section;
  first: boolean;
  last: boolean;
  heading?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);

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
        <button
          type="button"
          className={`${btn} hover:text-heartbeat`}
          disabled={pending}
          onClick={remove}
        >
          Delete
        </button>
      </div>
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
