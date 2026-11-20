"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { SourceTitle } from "@/components/SourceTitle";
import type { GuidelineKind } from "@/lib/guidelineCheck";
import { clearReplaced, markCheckedNow, runCheckNow, setReplaced } from "./actions";

export type GuidelineRow = {
  id: number;
  title: string;
  reference: string;
  year: number | null;
  section: string | null;
  kind: GuidelineKind;
  url: string | null;
  status: "current" | "checked" | "newer" | "not_listed" | "withdrawn" | "error" | "manual" | "unchecked" | "replaced";
  detail: string;
  checkedAt: string | null;
  /** Approved questions that cite it. */
  approved: number;
  /** A later copy of the same guidance already in the library. */
  suggestion: { id: number; reference: string; year: number | null } | null;
};

const LABEL: Record<GuidelineRow["status"], string> = {
  current: "Current",
  checked: "Checked",
  newer: "Newer edition?",
  not_listed: "Not on the RCOG list",
  withdrawn: "Withdrawn or replaced",
  error: "Could not read",
  manual: "Check by hand",
  unchecked: "Not checked yet",
  replaced: "Replaced",
};

const ATTENTION = new Set<GuidelineRow["status"]>(["newer", "not_listed", "withdrawn"]);
const TO_LOOK_AT = new Set<GuidelineRow["status"]>(["newer", "not_listed", "withdrawn", "error", "manual", "unchecked"]);

type Tab = "look" | "rcog" | "nice" | "other" | "replaced" | "all";
const TABS: { id: Tab; label: string; test: (r: GuidelineRow) => boolean }[] = [
  { id: "look", label: "To look at", test: (r) => TO_LOOK_AT.has(r.status) },
  { id: "rcog", label: "RCOG", test: (r) => r.kind === "rcog_gtg" || r.kind === "rcog_sip" },
  { id: "nice", label: "NICE", test: (r) => r.kind === "nice" },
  { id: "other", label: "Other publishers", test: (r) => r.kind === "other" },
  { id: "replaced", label: "Replaced", test: (r) => r.status === "replaced" },
  { id: "all", label: "All", test: () => true },
];

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never";
}

export function GuidelinesBoard({
  rows,
  ranAt,
  dueAt,
  due,
  running,
}: {
  rows: GuidelineRow[];
  ranAt: string | null;
  dueAt: string | null;
  due: boolean;
  running: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("look");
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [replacing, setReplacing] = useState<Record<number, string>>({});

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, rows.filter(t.test).length])), [rows]);
  const shown = useMemo(() => {
    const test = TABS.find((t) => t.id === tab)!.test;
    // What needs attention first, then the most-cited.
    return rows.filter(test).sort((a, b) => Number(ATTENTION.has(b.status)) - Number(ATTENTION.has(a.status)) || b.approved - a.approved);
  }, [rows, tab]);
  const attention = rows.filter((r) => ATTENTION.has(r.status)).length;

  const act = (fn: () => Promise<{ error?: string } & Record<string, unknown>>, done?: (r: Record<string, unknown>) => string) =>
    start(async () => {
      setMessage(null);
      const result = await fn();
      if (result.error) setMessage(String(result.error));
      else if (done) setMessage(done(result));
      setChosen(new Set());
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-surface p-4 shadow-card">
          <p className="font-ui text-[14px] font-semibold text-ink/65">Last full check</p>
          <p className="mt-1 font-display text-2xl font-medium text-ink-strong">{day(ranAt)}</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-4 shadow-card">
          <p className="font-ui text-[14px] font-semibold text-ink/65">Next check due</p>
          <p className={`mt-1 font-display text-2xl font-medium ${due ? "text-accent-ink" : "text-ink-strong"}`}>{due ? "Now" : day(dueAt)}</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-4 shadow-card">
          <p className="font-ui text-[14px] font-semibold text-ink/65">May need updating</p>
          <p className={`mt-1 font-display text-2xl font-medium ${attention ? "text-accent-ink" : "text-ink-strong"}`}>{attention}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonClass("primary", "sm")}
          disabled={pending || running}
          onClick={() =>
            act(runCheckNow as never, (r) => `Checked ${r.checked}: ${r.flagged} to look at${r.errors ? `, ${r.errors} could not be read` : ""}.`)
          }
        >
          {running ? "A check is running" : pending ? "Checking…" : "Run the check now"}
        </button>
        {chosen.size > 0 && (
          <button
            type="button"
            className={buttonClass("secondary", "sm")}
            disabled={pending}
            onClick={() => act(() => markCheckedNow([...chosen]), () => `Marked ${chosen.size} checked.`)}
          >
            Mark {chosen.size} checked and current
          </button>
        )}
        {message && <p className="font-ui text-[14px] text-ink/75" role="status">{message}</p>}
      </div>

      <div role="tablist" aria-label="Guidelines" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === t.id ? "border-good text-ink-strong" : "border-transparent text-ink/65 hover:text-ink-strong"}`}
          >
            {t.label} <span className="tabular-nums text-ink/65">({counts[t.id]})</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-5 text-sm text-good">Nothing here.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.id} className="rounded-card border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start gap-3">
                {r.status !== "replaced" && (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-brand"
                    aria-label={`Choose ${r.title}`}
                    checked={chosen.has(r.id)}
                    onChange={(e) => {
                      const next = new Set(chosen);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      setChosen(next);
                    }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-ui text-[15px] leading-snug text-ink-strong">
                    <SourceTitle title={r.title || r.reference} url={r.url} className="font-semibold" />
                    <span className="text-ink/65">
                      {" "}
                      · {r.reference}
                      {r.year ? `, ${r.year}` : ""} · #{r.id}
                    </span>
                  </p>
                  <p className="mt-1 font-ui text-[13px] text-ink/65">
                    {r.section ?? "No section"} · {r.approved} approved question{r.approved === 1 ? "" : "s"} · checked {day(r.checkedAt)}
                  </p>
                  <p className="mt-2 font-ui text-[14px] leading-relaxed text-ink/80">
                    <span
                      className={`mr-2 inline-block rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                        ATTENTION.has(r.status) ? "bg-accent/10 text-accent-ink" : r.status === "current" || r.status === "checked" ? "bg-sunk text-good" : "bg-sunk text-ink/70"
                      }`}
                    >
                      {LABEL[r.status]}
                    </span>
                    {r.detail}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
                {r.status === "replaced" ? (
                  <button type="button" className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => act(() => clearReplaced(r.id))}>
                    Undo replaced
                  </button>
                ) : (
                  <>
                    <button type="button" className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => act(() => markCheckedNow([r.id]), () => "Marked checked.")}>
                      Checked and current
                    </button>
                    {r.suggestion ? (
                      <button
                        type="button"
                        className={buttonClass("secondary", "sm")}
                        disabled={pending}
                        onClick={() => act(() => setReplaced(r.id, r.suggestion!.id), () => "Marked replaced. Take its questions out in the Bank.")}
                      >
                        Replaced by #{r.suggestion.id} ({r.suggestion.year ?? "?"})
                      </button>
                    ) : (
                      <span className="flex items-center gap-2">
                        <label className="sr-only" htmlFor={`by-${r.id}`}>
                          Library number of the new edition
                        </label>
                        <input
                          id={`by-${r.id}`}
                          inputMode="numeric"
                          placeholder="New edition #"
                          value={replacing[r.id] ?? ""}
                          onChange={(e) => setReplacing({ ...replacing, [r.id]: e.target.value.replace(/\D/g, "") })}
                          className="w-32 rounded-control border border-line bg-surface px-2 py-1 text-sm"
                        />
                        <button
                          type="button"
                          className={buttonClass("secondary", "sm")}
                          disabled={pending}
                          onClick={() => act(() => setReplaced(r.id, replacing[r.id] ? Number(replacing[r.id]) : null), () => "Marked replaced. Take its questions out in the Bank.")}
                        >
                          {replacing[r.id] ? "Mark replaced" : "Replaced (new edition not uploaded)"}
                        </button>
                      </span>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
