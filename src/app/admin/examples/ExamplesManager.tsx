"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SectionOption } from "@/lib/sections";
import { OPTION_LETTERS } from "@/lib/types";
import type { EmqGroup, ExampleItem, ExampleWithSection } from "./page";
import {
  createEmqGroup,
  createExample,
  deleteEmqGroup,
  deleteExample,
  updateEmqGroup,
  updateExample,
  type EmqGroupInput,
  type ExampleInput,
} from "./actions";

const field =
  "mt-1 w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm";
const smallBtn =
  "rounded px-2 py-1 text-xs font-medium text-graphite/60 hover:text-theatre disabled:opacity-40";
const badge =
  "rounded-full border border-hairline px-2 py-0.5 font-mono text-[11px] uppercase text-graphite/60";

export function ExamplesManager({
  options,
  sectionId,
  items,
}: {
  options: SectionOption[];
  sectionId: number | null;
  items: ExampleItem[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState<"sba" | "emq" | null>(null);

  if (options.length === 0) {
    return (
      <p className="rounded-card border border-hairline bg-porcelain p-4 text-sm text-graphite/60">
        Create at least one section first — every example belongs to a section.
      </p>
    );
  }

  const defaultSectionId = sectionId ?? options[0].id;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">
          Filter by section
          <select
            value={sectionId ?? ""}
            onChange={(e) =>
              router.replace(
                e.target.value
                  ? `/admin/examples?section=${e.target.value}`
                  : "/admin/examples"
              )
            }
            className="ml-2 rounded-card border border-hairline bg-white px-2 py-1.5 text-sm font-normal"
          >
            <option value="">All sections</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setAdding(adding === "sba" ? null : "sba")}
            className="rounded-card bg-theatre px-4 py-2 text-sm font-medium text-porcelain hover:bg-greentop"
          >
            {adding === "sba" ? "Close" : "Add SBA"}
          </button>
          <button
            type="button"
            onClick={() => setAdding(adding === "emq" ? null : "emq")}
            className="rounded-card bg-theatre px-4 py-2 text-sm font-medium text-porcelain hover:bg-greentop"
          >
            {adding === "emq" ? "Close" : "Add EMQ set"}
          </button>
        </div>
      </div>

      {adding === "sba" && (
        <div className="mb-6">
          <SbaForm
            options={options}
            defaultSectionId={defaultSectionId}
            onDone={() => setAdding(null)}
          />
        </div>
      )}
      {adding === "emq" && (
        <div className="mb-6">
          <EmqForm
            options={options}
            defaultSectionId={defaultSectionId}
            onDone={() => setAdding(null)}
          />
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-graphite/60">
          No examples here yet. Add the first one — the generator needs 3–4 per
          format to learn the house style.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) =>
            item.kind === "sba" ? (
              <SbaCard
                key={`sba-${item.example.id}`}
                example={item.example}
                options={options}
              />
            ) : (
              <EmqCard
                key={`emq-${item.group.groupId}`}
                group={item.group}
                options={options}
              />
            )
          )}
        </ul>
      )}
    </div>
  );
}

/* ============================== SBA ============================== */

function SbaCard({
  example,
  options,
}: {
  example: ExampleWithSection;
  options: SectionOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <li>
        <SbaForm
          options={options}
          defaultSectionId={example.section_id}
          initial={example}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  function remove() {
    if (!window.confirm("Delete this example question?")) return;
    startTransition(async () => {
      await deleteExample(example.id);
    });
  }

  return (
    <li className="rounded-card border border-hairline bg-porcelain p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={badge}>{example.format}</span>
          <span className="text-xs text-graphite/60">
            {example.sections?.title ?? "Unassigned"}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={smallBtn}
          >
            Edit
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

      <p className="mt-2 whitespace-pre-wrap font-display text-[15px] leading-relaxed text-graphite">
        {example.stem}
      </p>

      <ol className="mt-3 space-y-1">
        {example.options.map((option) => {
          const correct = option.key === example.correct_key;
          return (
            <li
              key={option.key}
              className={`flex gap-2 text-sm ${
                correct ? "font-medium text-greentop" : "text-graphite/80"
              }`}
            >
              <span className="font-mono text-xs leading-5">{option.key}</span>
              <span>
                {option.text}
                {correct && <span aria-hidden> ✓</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {example.rationale && (
        <p className="mt-3 border-t border-hairline pt-2 text-sm text-graphite/70">
          {example.rationale}
        </p>
      )}
      {example.source_note && (
        <p className="mt-2 font-mono text-xs text-graphite/50">
          {example.source_note}
        </p>
      )}
    </li>
  );
}

function SbaForm({
  options,
  defaultSectionId,
  initial,
  onDone,
}: {
  options: SectionOption[];
  defaultSectionId: number;
  initial?: ExampleWithSection;
  onDone: () => void;
}) {
  const [sectionId, setSectionId] = useState(
    initial?.section_id ?? defaultSectionId
  );
  const [stem, setStem] = useState(initial?.stem ?? "");
  const [texts, setTexts] = useState<string[]>(
    initial ? initial.options.map((o) => o.text) : Array(5).fill("")
  );
  const [correctIndex, setCorrectIndex] = useState<number>(
    initial
      ? Math.max(
          0,
          initial.options.findIndex((o) => o.key === initial.correct_key)
        )
      : 0
  );
  const [rationale, setRationale] = useState(initial?.rationale ?? "");
  const [sourceNote, setSourceNote] = useState(initial?.source_note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setText(index: number, value: string) {
    setTexts((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function removeOption(index: number) {
    if (texts.length <= 2) return;
    setTexts((prev) => prev.filter((_, i) => i !== index));
    setCorrectIndex((prev) =>
      index === prev ? 0 : index < prev ? prev - 1 : prev
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const input: ExampleInput = {
      sectionId,
      format: "sba",
      stem,
      options: texts.map((text, i) => ({ key: OPTION_LETTERS[i], text })),
      correctKey: OPTION_LETTERS[correctIndex],
      rationale,
      sourceNote,
    };
    startTransition(async () => {
      const result = initial
        ? await updateExample(initial.id, input)
        : await createExample(input);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-greentop/40 bg-porcelain p-5 shadow-card"
    >
      <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/50">
        {initial ? "Edit SBA" : "New SBA"}
      </p>

      <label className="mt-3 block text-sm font-medium">
        Section
        <select
          value={sectionId}
          onChange={(e) => setSectionId(Number(e.target.value))}
          className={field}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm font-medium">
        Stem
        <textarea
          value={stem}
          onChange={(e) => setStem(e.target.value)}
          rows={4}
          required
          placeholder="A 32-year-old woman at 34 weeks presents with…"
          className={field}
        />
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">
          Options{" "}
          <span className="font-normal text-graphite/50">
            (tick the correct one)
          </span>
        </legend>
        <div className="mt-1 space-y-2">
          {texts.map((text, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="sba-correct"
                checked={correctIndex === i}
                onChange={() => setCorrectIndex(i)}
                aria-label={`Mark option ${OPTION_LETTERS[i]} correct`}
                className="accent-greentop"
              />
              <span className="w-4 font-mono text-xs text-graphite/60">
                {OPTION_LETTERS[i]}
              </span>
              <input
                value={text}
                onChange={(e) => setText(i, e.target.value)}
                placeholder={`Option ${OPTION_LETTERS[i]}`}
                className="min-w-0 flex-1 rounded-card border border-hairline bg-white px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeOption(i)}
                disabled={texts.length <= 2}
                aria-label={`Remove option ${OPTION_LETTERS[i]}`}
                className={smallBtn}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => texts.length < 10 && setTexts((p) => [...p, ""])}
          disabled={texts.length >= 10}
          className="mt-2 rounded px-1 py-1 text-xs font-medium text-greentop hover:text-theatre disabled:opacity-40"
        >
          Add option
        </button>
      </fieldset>

      <label className="mt-4 block text-sm font-medium">
        Rationale{" "}
        <span className="font-normal text-graphite/50">(optional)</span>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={2}
          className={field}
        />
      </label>

      <label className="mt-4 block text-sm font-medium">
        Source note{" "}
        <span className="font-normal text-graphite/50">(optional)</span>
        <input
          value={sourceNote}
          onChange={(e) => setSourceNote(e.target.value)}
          placeholder="Based on RCOG GTG No. 52 style"
          className={field}
        />
      </label>

      {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-card bg-theatre px-5 py-2 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-60"
        >
          {pending ? "Saving…" : initial ? "Save changes" : "Add SBA"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-card border border-hairline bg-porcelain px-4 py-2 text-sm font-medium text-graphite/70 hover:text-theatre"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ============================== EMQ ============================== */

function EmqCard({
  group,
  options,
}: {
  group: EmqGroup;
  options: SectionOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <li>
        <EmqForm
          options={options}
          defaultSectionId={group.sectionId}
          initial={group}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  function remove() {
    if (
      !window.confirm(
        `Delete this EMQ set (${group.scenarios.length} scenario${
          group.scenarios.length === 1 ? "" : "s"
        })?`
      )
    )
      return;
    startTransition(async () => {
      await deleteEmqGroup(group.groupId);
    });
  }

  return (
    <li className="rounded-card border border-hairline bg-porcelain p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={badge}>emq set</span>
          <span className="text-xs text-graphite/60">
            {group.sectionTitle ?? "Unassigned"} · {group.scenarios.length}{" "}
            scenario{group.scenarios.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={smallBtn}
          >
            Edit
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

      <ol className="mt-3 space-y-0.5">
        {group.options.map((option) => (
          <li key={option.key} className="flex gap-2 text-sm text-graphite/80">
            <span className="font-mono text-xs leading-5">{option.key}</span>
            <span>{option.text}</span>
          </li>
        ))}
      </ol>

      <p className="mt-3 whitespace-pre-wrap border-t border-hairline pt-3 text-sm italic text-graphite/70">
        {group.leadIn}
      </p>

      <ol className="mt-3 space-y-3">
        {group.scenarios.map((scenario, i) => (
          <li key={scenario.id} className="flex gap-3">
            <span className="font-mono text-xs leading-6 text-graphite/50">
              {i + 1}.
            </span>
            <div className="min-w-0">
              <p className="whitespace-pre-wrap font-display text-[15px] leading-relaxed text-graphite">
                {scenario.stem}
              </p>
              <p className="mt-1 text-sm font-medium text-greentop">
                Answer: {scenario.correct_key}
                <span aria-hidden> ✓</span>
              </p>
              {scenario.rationale && (
                <p className="mt-1 text-sm text-graphite/70">
                  {scenario.rationale}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {group.sourceNote && (
        <p className="mt-3 font-mono text-xs text-graphite/50">
          {group.sourceNote}
        </p>
      )}
    </li>
  );
}

type ScenarioDraft = { stem: string; correctIndex: number; rationale: string };

function EmqForm({
  options,
  defaultSectionId,
  initial,
  onDone,
}: {
  options: SectionOption[];
  defaultSectionId: number;
  initial?: EmqGroup;
  onDone: () => void;
}) {
  const [sectionId, setSectionId] = useState(
    initial?.sectionId ?? defaultSectionId
  );
  const [leadIn, setLeadIn] = useState(
    initial?.leadIn ??
      "Each of the following clinical scenarios relates to …. For each patient, select the single most appropriate option from the list above. Each option may be used once, more than once or not at all."
  );
  const [texts, setTexts] = useState<string[]>(
    initial ? initial.options.map((o) => o.text) : Array(8).fill("")
  );
  const [scenarios, setScenarios] = useState<ScenarioDraft[]>(
    initial
      ? initial.scenarios.map((s) => ({
          stem: s.stem,
          correctIndex: Math.max(
            0,
            initial.options.findIndex((o) => o.key === s.correct_key)
          ),
          rationale: s.rationale ?? "",
        }))
      : [
          { stem: "", correctIndex: 0, rationale: "" },
          { stem: "", correctIndex: 0, rationale: "" },
          { stem: "", correctIndex: 0, rationale: "" },
        ]
  );
  const [sourceNote, setSourceNote] = useState(initial?.sourceNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setText(index: number, value: string) {
    setTexts((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function removeOption(index: number) {
    if (texts.length <= 4) return;
    setTexts((prev) => prev.filter((_, i) => i !== index));
    setScenarios((prev) =>
      prev.map((s) => ({
        ...s,
        correctIndex:
          s.correctIndex === index
            ? 0
            : s.correctIndex > index
              ? s.correctIndex - 1
              : s.correctIndex,
      }))
    );
  }

  function patchScenario(index: number, patch: Partial<ScenarioDraft>) {
    setScenarios((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const input: EmqGroupInput = {
      sectionId,
      leadIn,
      options: texts.map((text, i) => ({ key: OPTION_LETTERS[i], text })),
      scenarios: scenarios.map((s) => ({
        stem: s.stem,
        correctKey: OPTION_LETTERS[s.correctIndex],
        rationale: s.rationale,
      })),
      sourceNote,
    };
    startTransition(async () => {
      const result = initial
        ? await updateEmqGroup(initial.groupId, input)
        : await createEmqGroup(input);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-greentop/40 bg-porcelain p-5 shadow-card"
    >
      <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/50">
        {initial ? "Edit EMQ set" : "New EMQ set"}
      </p>

      <label className="mt-3 block text-sm font-medium">
        Section
        <select
          value={sectionId}
          onChange={(e) => setSectionId(Number(e.target.value))}
          className={field}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">
          Option list{" "}
          <span className="font-normal text-graphite/50">
            (shared by every scenario)
          </span>
        </legend>
        <div className="mt-1 space-y-2">
          {texts.map((text, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-4 font-mono text-xs text-graphite/60">
                {OPTION_LETTERS[i]}
              </span>
              <input
                value={text}
                onChange={(e) => setText(i, e.target.value)}
                placeholder={`Option ${OPTION_LETTERS[i]}`}
                className="min-w-0 flex-1 rounded-card border border-hairline bg-white px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeOption(i)}
                disabled={texts.length <= 4}
                aria-label={`Remove option ${OPTION_LETTERS[i]}`}
                className={smallBtn}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            texts.length < OPTION_LETTERS.length &&
            setTexts((p) => [...p, ""])
          }
          disabled={texts.length >= OPTION_LETTERS.length}
          className="mt-2 rounded px-1 py-1 text-xs font-medium text-greentop hover:text-theatre disabled:opacity-40"
        >
          Add option
        </button>
      </fieldset>

      <label className="mt-4 block text-sm font-medium">
        Lead-in instruction
        <textarea
          value={leadIn}
          onChange={(e) => setLeadIn(e.target.value)}
          rows={3}
          required
          className={field}
        />
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Scenarios</legend>
        <div className="mt-1 space-y-4">
          {scenarios.map((scenario, i) => (
            <div
              key={i}
              className="rounded-card border border-hairline bg-white/60 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-graphite/50">
                  Scenario {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    scenarios.length > 1 &&
                    setScenarios((prev) => prev.filter((_, j) => j !== i))
                  }
                  disabled={scenarios.length <= 1}
                  className={smallBtn}
                >
                  Remove
                </button>
              </div>
              <textarea
                value={scenario.stem}
                onChange={(e) => patchScenario(i, { stem: e.target.value })}
                rows={3}
                placeholder="A 32-year-old woman at 37 weeks of gestation…"
                className={field}
              />
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-medium text-graphite/70">
                  Correct option
                  <select
                    value={scenario.correctIndex}
                    onChange={(e) =>
                      patchScenario(i, {
                        correctIndex: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-card border border-hairline bg-white px-2 py-1.5 text-sm"
                  >
                    {texts.map((text, j) => (
                      <option key={j} value={j}>
                        {OPTION_LETTERS[j]}
                        {text.trim()
                          ? ` — ${text.slice(0, 60)}${text.length > 60 ? "…" : ""}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-graphite/70">
                  Rationale{" "}
                  <span className="font-normal text-graphite/50">
                    (optional)
                  </span>
                  <input
                    value={scenario.rationale}
                    onChange={(e) =>
                      patchScenario(i, { rationale: e.target.value })
                    }
                    className="mt-1 w-full rounded-card border border-hairline bg-white px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setScenarios((prev) => [
              ...prev,
              { stem: "", correctIndex: 0, rationale: "" },
            ])
          }
          className="mt-2 rounded px-1 py-1 text-xs font-medium text-greentop hover:text-theatre"
        >
          Add scenario
        </button>
      </fieldset>

      <label className="mt-4 block text-sm font-medium">
        Source note{" "}
        <span className="font-normal text-graphite/50">(optional)</span>
        <input
          value={sourceNote}
          onChange={(e) => setSourceNote(e.target.value)}
          placeholder="Part 2 EMQ style, severe hypertension in pregnancy"
          className={field}
        />
      </label>

      {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-card bg-theatre px-5 py-2 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-60"
        >
          {pending ? "Saving…" : initial ? "Save changes" : "Add EMQ set"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-card border border-hairline bg-porcelain px-4 py-2 text-sm font-medium text-graphite/70 hover:text-theatre"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
