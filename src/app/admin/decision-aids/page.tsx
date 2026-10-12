import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { TraceHeader } from "@/components/TraceHeader";
import { formatReference } from "@/lib/reference";
import type { AidFlag, AidStatus } from "@/lib/decision-aid-shape";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  document_id: number;
  page: number;
  title: string;
  kind: string;
  status: AidStatus;
  flags: AidFlag[];
  content_documents: { title: string; source_reference: string | null; source_year: number | null } | null;
};

const STATUS_LABEL: Record<AidStatus, string> = {
  draft: "Waiting for review",
  approved: "Approved",
  needs_changes: "Needs changes",
  rejected: "Not a decision aid",
};

/**
 * Admin > Decision aids (owner's direction, 12 October 2026).
 *
 * Every flowchart, algorithm and decision table found in the guidelines,
 * by guideline. Those the checks flagged are marked and come first in
 * each guideline. Only an approved aid is followed by Ask Pinard.
 */
export default async function DecisionAidsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const { data, error } = await createAdminClient()
    .from("decision_aids")
    .select("id,document_id,page,title,kind,status,flags,content_documents(title,source_reference,source_year)")
    .order("document_id")
    .order("page");
  const missingTable = Boolean(error && error.code === "42P01");
  const all = (data ?? []) as unknown as Row[];
  const rows = show === "flagged" ? all.filter((r) => r.status === "draft" && r.flags.length > 0) : show === "waiting" ? all.filter((r) => r.status === "draft") : all;
  const count = (s: AidStatus) => all.filter((r) => r.status === s).length;
  const flagged = all.filter((r) => r.status === "draft" && r.flags.length > 0).length;

  const byDoc = new Map<number, Row[]>();
  for (const r of rows) byDoc.set(r.document_id, [...(byDoc.get(r.document_id) ?? []), r]);

  return (
    <>
      <TraceHeader
        title="Decision aids"
        lede="The flowcharts and decision tables in the guidelines, each transcribed as drawn beside a picture of the original. Check the transcription against the picture, then approve it. Only approved aids are followed by Ask Pinard."
      />
      {missingTable ? (
        <p className="rounded-card border border-line bg-surface p-5 font-ui text-[16px] text-ink/80">
          Run <code className="font-mono text-[14px]">supabase/phase51-decision-aids.sql</code> in the Supabase SQL editor,
          then reload this page.
        </p>
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
            {[
              ["Waiting for review", String(count("draft"))],
              ["Of those, flagged by the checks", String(flagged)],
              ["Approved", String(count("approved"))],
              ["Needs changes", String(count("needs_changes"))],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface p-4">
                <dt className="font-ui text-[13px] text-ink/65">{label}</dt>
                <dd className="mt-1 font-ui text-[20px] font-semibold tabular-nums text-ink-strong">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mb-6 flex flex-wrap gap-3 font-ui text-[14px]">
            {[
              ["", "All"],
              ["waiting", "Waiting for review"],
              ["flagged", "Flagged by the checks"],
            ].map(([key, label]) => (
              <Link
                key={key}
                href={key ? `/admin/decision-aids?show=${key}` : "/admin/decision-aids"}
                className={`rounded-full border px-3 py-1 ${(show ?? "") === key ? "border-ink-strong text-ink-strong" : "border-line text-ink/70 hover:text-ink-strong"}`}
              >
                {label}
              </Link>
            ))}
          </p>
          {[...byDoc.entries()].map(([docId, aids]) => {
            const d = aids[0].content_documents;
            const sorted = [...aids].sort((a, b) => Number(b.flags.length > 0) - Number(a.flags.length > 0) || a.page - b.page);
            return (
              <section key={docId} className="mb-6">
                <h2 className="mb-2 font-ui text-[16px] font-semibold text-ink-strong">
                  {d?.title}
                  <span className="font-normal text-ink/60">
                    {d ? `, ${formatReference({ reference: d.source_reference, year: d.source_year })}` : ""}
                  </span>
                </h2>
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                  {sorted.map((a) => (
                    <li key={a.id}>
                      <Link href={`/admin/decision-aids/${a.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-sunk">
                        <span className="font-ui text-[15px] text-ink-strong">
                          {a.title} <span className="text-ink/55">(page {a.page}, {a.kind})</span>
                        </span>
                        <span className="font-ui text-[13px] text-ink/70">
                          {STATUS_LABEL[a.status]}
                          {a.status === "draft" && a.flags.length > 0 && <span className="text-accent-ink">, {a.flags.length} to check</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
