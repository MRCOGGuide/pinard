"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SectionCoverage } from "@/lib/coverage";

// Typical MRCOG preparation runs 6–12 weeks; longer options cover
// candidates who start early.
const PERIODS = [
  { days: 42, label: "6 weeks" },
  { days: 56, label: "8 weeks" },
  { days: 70, label: "10 weeks" },
  { days: 84, label: "12 weeks" },
  { days: 120, label: "4 months" },
  { days: 180, label: "6 months" },
];

function statusOf(row: SectionCoverage) {
  if (row.target === 0) return { label: "no sources", tone: "text-graphite/45" };
  if (row.gap === 0) return { label: "complete", tone: "text-greentop" };
  if (row.approved === 0) return { label: "not started", tone: "text-heartbeat" };
  return { label: `${row.gap} to go`, tone: "text-graphite/70" };
}

export function CoverageTable({
  rows,
  days,
}: {
  rows: SectionCoverage[];
  days: number;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(null);
  const [hideComplete, setHideComplete] = useState(false);

  const withSources = rows.filter((r) => r.target > 0);
  const visible = hideComplete
    ? withSources.filter((r) => r.gap > 0)
    : withSources;

  const totals = withSources.reduce(
    (acc, r) => ({
      approved: acc.approved + r.approved,
      target: acc.target + r.target,
      gap: acc.gap + r.gap,
    }),
    { approved: 0, target: 0, gap: 0 }
  );
  const thin = withSources.filter((r) => r.needsMoreSource);
  const noSources = rows.filter((r) => r.target === 0).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">
          Revision period
          <select
            value={days}
            onChange={(e) =>
              router.replace(`/admin/coverage?days=${e.target.value}`)
            }
            className="ml-2 rounded-card border border-hairline bg-white px-2 py-1.5 text-sm font-normal"
          >
            {PERIODS.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-graphite/70">
          <input
            type="checkbox"
            checked={hideComplete}
            onChange={(e) => setHideComplete(e.target.checked)}
            className="h-3.5 w-3.5 accent-theatre"
          />
          Only sections with a gap
        </label>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Approved questions" value={totals.approved} />
        <Stat label="Target for this period" value={totals.target} />
        <Stat label="Still to generate" value={totals.gap} accent />
      </div>

      {thin.length > 0 && (
        <div className="mb-5 rounded-card border border-heartbeat/30 bg-porcelain p-4">
          <p className="text-sm leading-relaxed text-graphite/80">
            <strong className="text-theatre">
              {thin.length} section{thin.length === 1 ? "" : "s"} need more
              source material.
            </strong>{" "}
            Their target is limited by how much text is ingested, not by
            demand — generating beyond it would produce near-duplicate
            questions. Upload more guidelines or articles here:{" "}
            <span className="text-graphite/70">
              {thin
                .slice(0, 6)
                .map((r) => r.label.split(" · ").pop())
                .join(", ")}
              {thin.length > 6 ? `, and ${thin.length - 6} more` : ""}
            </span>
            .
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline text-left font-mono text-[11px] uppercase tracking-wide text-graphite/55">
              <th className="py-2 pr-3 font-normal">Section</th>
              <th className="py-2 pr-3 text-right font-normal">Docs</th>
              <th className="py-2 pr-3 text-right font-normal">SBA</th>
              <th className="py-2 pr-3 text-right font-normal">EMQ</th>
              <th className="py-2 pr-3 text-right font-normal">Approved</th>
              <th className="py-2 pr-3 text-right font-normal">Target</th>
              <th className="py-2 pr-3 text-right font-normal">Status</th>
              <th className="py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const status = statusOf(row);
              const open = openId === row.sectionId;
              const pct =
                row.target > 0
                  ? Math.min(100, Math.round((row.approved / row.target) * 100))
                  : 0;
              return (
                <tr
                  key={row.sectionId}
                  className="border-b border-hairline/60 align-top"
                >
                  <td className="py-2 pr-3">
                    <span className="text-graphite/90">{row.label}</span>
                    <span className="mt-1 block h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-hairline">
                      <span
                        className="block h-full rounded-full bg-greentop"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    {open && (
                      <div className="mt-2 rounded-card border border-hairline bg-white/60 p-3">
                        <p className="font-mono text-[11px] text-graphite/55">
                          plan demand {row.demand} · one question per article{" "}
                          {row.coverageNeed} · material supports {row.capacity}
                        </p>
                        {row.uncovered.length > 0 ? (
                          <>
                            <p className="mt-2 text-xs font-medium text-theatre">
                              {row.uncovered.length} article
                              {row.uncovered.length === 1 ? "" : "s"} with no
                              question yet:
                            </p>
                            <ul className="mt-1 space-y-0.5 text-xs text-graphite/70">
                              {row.uncovered.slice(0, 12).map((d) => (
                                <li key={d.id}>
                                  {d.title}{" "}
                                  <span className="font-mono text-graphite/45">
                                    ({d.chunks} chunks)
                                  </span>
                                </li>
                              ))}
                              {row.uncovered.length > 12 && (
                                <li className="text-graphite/50">
                                  …and {row.uncovered.length - 12} more
                                </li>
                              )}
                            </ul>
                          </>
                        ) : (
                          <p className="mt-2 text-xs text-greentop">
                            Every examinable article here has at least one
                            question.
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs text-graphite/70">
                    {row.examinableDocuments}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs text-graphite/70">
                    {row.approvedSba}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs text-graphite/70">
                    {row.approvedEmq}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs text-graphite/90">
                    {row.approved}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs text-graphite/90">
                    {row.target}
                    {row.needsMoreSource && (
                      <span
                        title="Capped by available source material"
                        className="ml-1 text-heartbeat"
                      >
                        *
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-2 pr-3 text-right font-mono text-xs ${status.tone}`}
                  >
                    {status.label}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : row.sectionId)}
                      className="rounded px-2 py-1 text-xs font-medium text-graphite/60 hover:text-theatre"
                    >
                      {open ? "Hide" : "Detail"}
                    </button>
                    {row.gap > 0 && (
                      <Link
                        href="/admin/generate"
                        className="ml-1 rounded px-2 py-1 text-xs font-medium text-greentop hover:text-theatre"
                      >
                        Generate
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && (
        <p className="mt-4 text-sm text-greentop">
          Every section with source material has reached its target for this
          revision period.
        </p>
      )}

      {noSources > 0 && (
        <p className="mt-4 text-xs text-graphite/55">
          {noSources} section{noSources === 1 ? " has" : "s have"} no ingested
          source material yet and are not counted above.
        </p>
      )}

      <div className="mt-6 rounded-card border border-hairline bg-porcelain p-4">
        <h2 className="font-display text-base font-semibold text-theatre">
          How these targets are worked out
        </h2>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-graphite/75">
          <li>
            <strong>Plan demand</strong> — the real study-plan algorithm is
            run for a candidate weak in every section over the chosen
            period, and the questions it asks of each section are totalled.
            Meeting it means no candidate ever repeats a question.
          </li>
          <li>
            <strong>One question per article</strong> — every ingested
            document of three chunks or more should be tested, scaled by
            length (about one question per ten chunks, up to eight), so no
            topic is silently missing.
          </li>
          <li>
            <strong>Target</strong> — the larger of those two, plus 30% for
            off-plan practice, the diagnostic and retakes.
          </li>
          <li>
            <strong>Capped by material</strong> — never more than about one
            question per chunk of source text. Past that you are re-testing
            the same facts, so the fix is more sources, not more questions
            (marked <span className="text-heartbeat">*</span>).
          </li>
        </ul>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-card border border-hairline bg-porcelain p-4 shadow-card">
      <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/55">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-2xl font-semibold ${accent ? "text-heartbeat" : "text-theatre"}`}
      >
        {value.toLocaleString("en-GB")}
      </p>
    </div>
  );
}
