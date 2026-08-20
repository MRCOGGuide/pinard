import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { leafSections } from "@/lib/performance";
import { fetchFlaggedIds } from "@/lib/session";
import { EXAM_LABELS, type ExamPart, type Section } from "@/lib/types";

export default async function PractisePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("exam")
    .eq("id", user.id)
    .single();
  if (!profile?.exam) redirect("/onboarding");

  const { data: sections } = await supabase
    .from("sections")
    .select("*")
    .eq("exam", profile.exam)
    .order("sort_order");

  const units = leafSections((sections ?? []) as Section[]);
  const flaggedCount = (await fetchFlaggedIds(supabase, user.id)).length;

  // Approved-question counts per section, so users see what's practisable.
  const { data: approved } = await supabase
    .from("generated_questions")
    .select("section_id")
    .eq("status", "approved");
  const counts = new Map<number, number>();
  for (const row of (approved ?? []) as { section_id: number }[]) {
    counts.set(row.section_id, (counts.get(row.section_id) ?? 0) + 1);
  }

  return (
    <>
      <TraceHeader
        title="Practise"
        lede={`Browse any ${EXAM_LABELS[profile.exam as ExamPart]} topic and practise off-plan. Everything you answer still feeds your progress.`}
      />

      {flaggedCount > 0 && (
        <Link
          href="/practise/flagged"
          className="mb-4 flex items-center justify-between rounded-card border border-heartbeat/30 bg-heartbeat/5 p-4 hover:border-heartbeat"
        >
          <span className="font-display text-base font-medium text-theatre">
            <span aria-hidden>⚑</span> Flagged for review
          </span>
          <span className="font-mono text-xs text-graphite/55">
            {flaggedCount} question{flaggedCount === 1 ? "" : "s"}
          </span>
        </Link>
      )}

      {units.length === 0 ? (
        <p className="rounded-card border border-hairline bg-porcelain p-4 text-sm text-graphite/60">
          No topics yet for this exam.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {units.map((s) => {
            const n = counts.get(s.id) ?? 0;
            const disabled = n === 0;
            const inner = (
              <>
                <span className="font-display text-base font-medium text-theatre">
                  {s.title}
                </span>
                <span className="font-mono text-xs text-graphite/55">
                  {n} question{n === 1 ? "" : "s"}
                </span>
              </>
            );
            return (
              <li key={s.id}>
                {disabled ? (
                  <div className="flex items-center justify-between rounded-card border border-dashed border-hairline p-4 opacity-60">
                    {inner}
                  </div>
                ) : (
                  <Link
                    href={`/practise/${s.id}`}
                    className="flex items-center justify-between rounded-card border border-hairline bg-porcelain p-4 shadow-card hover:border-greentop"
                  >
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
