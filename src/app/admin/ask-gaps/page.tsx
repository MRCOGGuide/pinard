import Link from "next/link";
import { TraceHeader } from "@/components/TraceHeader";
import { groupedGaps, type GapRow } from "@/lib/ask-gaps";
import { createAdminClient } from "@/lib/supabase/admin";
import { GapList } from "./GapList";

export const dynamic = "force-dynamic";

/**
 * Admin > Ask gaps (owner's brief, part 7): everything Ask Pinard has told
 * someone is not covered. A gap may be missing from the library, or be
 * there and missed by the search; a candidate is told the same either way.
 */
export default async function AskGapsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const { data, error } = await createAdminClient()
    .from("ask_gaps")
    .select("id,created_at,gap,status")
    .order("created_at", { ascending: false })
    .limit(3000);
  const missingTable = Boolean(error && ["42P01", "PGRST205"].includes(error.code));
  const all = groupedGaps((data ?? []) as GapRow[]);
  const open = all.filter((g) => g.open);
  const shown = show === "closed" ? all.filter((g) => !g.open) : open;

  return (
    <>
      <TraceHeader
        title="Ask gaps"
        lede="What Ask Pinard has told someone is not covered, most often first. Some of it is missing from the library; some of it is there and the search missed it. Mark each one once you have dealt with it. If it comes up again, it returns here."
      />
      {missingTable ? (
        <p className="rounded-card border border-line bg-surface p-5 font-ui text-[16px] text-ink/80">
          Run <code className="font-mono text-[14px]">supabase/phase53-ask-gaps.sql</code> in the Supabase SQL editor, then
          reload this page. Gaps are logged from then on.
        </p>
      ) : (
        <>
          <p className="mb-6 flex flex-wrap gap-3 font-ui text-[14px]">
            {[
              ["", `Open (${open.length})`],
              ["closed", `Dealt with (${all.length - open.length})`],
            ].map(([key, label]) => (
              <Link
                key={key}
                href={key ? `/admin/ask-gaps?show=${key}` : "/admin/ask-gaps"}
                className={`rounded-full border px-3 py-1 ${(show ?? "") === key ? "border-ink-strong text-ink-strong" : "border-line text-ink/70 hover:text-ink-strong"}`}
              >
                {label}
              </Link>
            ))}
          </p>
          {shown.length === 0 ? (
            <p className="rounded-card border border-line bg-surface p-5 font-ui text-[16px] text-ink/80">
              {show === "closed" ? "Nothing has been dealt with yet." : "No open gaps."}
            </p>
          ) : (
            <GapList gaps={shown} />
          )}
        </>
      )}
    </>
  );
}
