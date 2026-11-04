import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { TraceHeader } from "@/components/TraceHeader";
import type { LegalKind } from "@/lib/legal-index";
import { ApproveAll } from "./ApproveAll";

export const dynamic = "force-dynamic";

type Status = "draft" | "approved" | "needs_changes" | "rejected";
type Row = { id: number; name: string; kind: LegalKind; jurisdiction: string; establishes: string; status: Status };

const STATUS_LABEL: Record<Status, string> = {
  draft: "Waiting for review",
  approved: "Approved",
  needs_changes: "Needs changes",
  rejected: "Not needed",
};

const KINDS: [LegalKind, string][] = [
  ["law", "Laws"],
  ["case", "Cases"],
  ["guidance", "Professional and regulatory guidance"],
];

/**
 * Admin > Legal index (the owner's brief, part 4): every law, case and
 * piece of professional or regulatory guidance named in the library,
 * with what it establishes. Only an approved entry is used by Ask Pinard.
 */
export default async function LegalIndexPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const { data, error } = await createAdminClient()
    .from("legal_index")
    .select("id,name,kind,jurisdiction,establishes,status")
    .order("kind")
    .order("name");
  const missingTable = Boolean(error && error.code === "42P01");
  const all = (data ?? []) as Row[];
  const rows = show === "waiting" ? all.filter((r) => r.status === "draft") : show === "changes" ? all.filter((r) => r.status === "needs_changes") : all;
  const count = (s: Status) => all.filter((r) => r.status === s).length;

  return (
    <>
      <TraceHeader
        title="Legal index"
        lede="Every law, case and piece of professional or regulatory guidance named in the library, with what it establishes and where it appears. Only approved entries are used by Ask Pinard."
      />
      {missingTable ? (
        <p className="rounded-card border border-line bg-surface p-5 font-ui text-[16px] text-ink/80">
          Run <code className="font-mono text-[14px]">supabase/phase52-legal-index.sql</code> in the Supabase SQL editor,
          then reload this page.
        </p>
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
            {(["draft", "approved", "needs_changes", "rejected"] as Status[]).map((s) => (
              <div key={s} className="bg-surface p-4">
                <dt className="font-ui text-[13px] text-ink/65">{STATUS_LABEL[s]}</dt>
                <dd className="mt-1 font-ui text-[20px] font-semibold tabular-nums text-ink-strong">{count(s)}</dd>
              </div>
            ))}
          </dl>
          <p className="mb-6 flex flex-wrap gap-3 font-ui text-[14px]">
            {[
              ["", "All"],
              ["waiting", "Waiting for review"],
              ["changes", "Needs changes"],
            ].map(([key, label]) => (
              <Link
                key={key}
                href={key ? `/admin/legal-index?show=${key}` : "/admin/legal-index"}
                className={`rounded-full border px-3 py-1 ${(show ?? "") === key ? "border-ink-strong text-ink-strong" : "border-line text-ink/70 hover:text-ink-strong"}`}
              >
                {label}
              </Link>
            ))}
          </p>
          {count("draft") > 0 && <ApproveAll count={count("draft")} />}
          {KINDS.map(([kind, heading]) => {
            const entries = rows.filter((r) => r.kind === kind);
            if (entries.length === 0) return null;
            return (
              <section key={kind} className="mb-6">
                <h2 className="mb-2 font-ui text-[16px] font-semibold text-ink-strong">{heading}</h2>
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                  {entries.map((e) => (
                    <li key={e.id}>
                      <Link href={`/admin/legal-index/${e.id}`} className="block px-4 py-3 hover:bg-sunk">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <span className="font-ui text-[15px] text-ink-strong">
                            {e.name}
                            {e.jurisdiction && <span className="text-ink/55"> ({e.jurisdiction})</span>}
                          </span>
                          <span className="font-ui text-[13px] text-ink/70">{STATUS_LABEL[e.status]}</span>
                        </span>
                        <span className="mt-1 block font-ui text-[14px] text-ink/70">{e.establishes}</span>
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
