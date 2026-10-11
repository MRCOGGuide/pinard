import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { TraceHeader } from "@/components/TraceHeader";
import { itemCount, type PathwayBody, type PathwayConflict, type PathwayStatus } from "@/lib/pathway-shape";

export const dynamic = "force-dynamic";

type Row = {
  slug: string;
  name: string;
  area: string;
  status: PathwayStatus;
  body: PathwayBody;
  gaps: string[];
  conflicts: PathwayConflict[];
  reviewed_at: string | null;
};

const STATUS_LABEL: Record<PathwayStatus, string> = {
  draft: "Waiting for review",
  needs_changes: "Needs changes",
  approved: "Approved",
  not_in_sources: "Not in the sources",
};

const AREA_LABEL: Record<string, string> = {
  obstetric: "Obstetric pathways",
  medical: "Medical conditions in pregnancy",
  gynaecology: "Gynaecology",
};

/**
 * Admin > Pathways (owner's brief, 11 October 2026, part 2).
 *
 * The pathways drawn out of the library, grouped by kind, each with its
 * review status. Only an approved pathway drives a live Ask Pinard
 * answer, so this page is where that happens.
 */
export default async function PathwaysPage() {
  const { data, error } = await createAdminClient()
    .from("pathways")
    .select("slug,name,area,status,body,gaps,conflicts,reviewed_at")
    .order("name");
  const missingTable = Boolean(error && error.code === "42P01");
  const rows = (data ?? []) as Row[];
  const count = (s: PathwayStatus) => rows.filter((r) => r.status === s).length;

  return (
    <>
      <TraceHeader
        title="Pathways"
        lede="Each pathway is drawn from the source library, every line with the passage it came from. Read it, remove any line that is wrong, choose between sources that disagree, then approve it. Only approved pathways are used in Ask Pinard's answers."
      />
      {missingTable ? (
        <p className="rounded-card border border-line bg-surface p-5 font-ui text-[16px] text-ink/80">
          Run <code className="font-mono text-[14px]">supabase/phase50-pathways.sql</code> in the Supabase SQL editor,
          then reload this page.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-5 font-ui text-[16px] text-ink/80">
          No pathways loaded yet.
        </p>
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
            {(["draft", "approved", "needs_changes", "not_in_sources"] as PathwayStatus[]).map((s) => (
              <div key={s} className="bg-surface p-4">
                <dt className="font-ui text-[13px] text-ink/65">{STATUS_LABEL[s]}</dt>
                <dd className="mt-1 font-ui text-[20px] font-semibold tabular-nums text-ink-strong">{count(s)}</dd>
              </div>
            ))}
          </dl>
          {Object.entries(AREA_LABEL).map(([area, label]) => {
            const mine = rows.filter((r) => r.area === area);
            if (mine.length === 0) return null;
            return (
              <section key={area} className="mb-8">
                <h2 className="mb-3 font-ui text-[17px] font-semibold text-ink-strong">{label}</h2>
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                  {mine.map((r) => {
                    const open = (r.conflicts ?? []).filter((c) => c.chosen === undefined || c.chosen === null).length;
                    return (
                      <li key={r.slug}>
                        <Link
                          href={`/admin/pathways/${r.slug}`}
                          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-sunk"
                        >
                          <span className="font-ui text-[16px] font-semibold text-ink-strong">{r.name}</span>
                          <span className="font-ui text-[14px] text-ink/70">
                            {STATUS_LABEL[r.status]}
                            {r.status !== "not_in_sources" && `, ${itemCount(r.body)} lines`}
                            {(r.gaps ?? []).length > 0 && `, ${r.gaps.length} gaps`}
                            {open > 0 && `, ${open} to choose`}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
