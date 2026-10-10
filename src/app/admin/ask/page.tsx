import { createAdminClient } from "@/lib/supabase/admin";
import { TraceHeader } from "@/components/TraceHeader";
import { AskBench } from "./AskBench";
import type { AskReview } from "./actions";

export const dynamic = "force-dynamic";
// An answer may plan, search, and be sent back once: up to a minute.
export const maxDuration = 60;

/**
 * Admin > Ask Pinard: the test bench (owner's request, 10 October 2026).
 *
 * Ask anything a candidate might; see the answer exactly as they would,
 * how long it took, which passages the search found, and whether the
 * checks sent a first draft back. Mark it Good, Needs work or Wrong, and
 * say what it should have said. Those ratings are what each fix is
 * aimed at, and the same questions are asked again after it
 * (scripts/eval-ask.mts) so improvements are measured, not assumed.
 */
export default async function AskReviewPage() {
  const { data, error } = await createAdminClient()
    .from("ask_reviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const missingTable = Boolean(error && error.code === "42P01");
  const reviews = (data ?? []) as AskReview[];
  const rated = reviews.filter((r) => r.rating);
  const count = (r: AskReview["rating"]) => rated.filter((x) => x.rating === r).length;
  const times = reviews.filter((r) => r.ok && r.total_ms).map((r) => r.total_ms as number).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : null;

  return (
    <>
      <TraceHeader
        title="Ask Pinard"
        lede="Test it as a candidate would, then rate each answer. Every rating is used to improve it, and the same questions are asked again after each change."
      />
      {missingTable ? (
        <p className="rounded-card border border-line bg-surface p-5 font-ui text-[16px] text-ink/80">
          Run <code className="font-mono text-[14px]">supabase/phase48-ask-reviews.sql</code> in the Supabase SQL
          editor, then reload this page.
        </p>
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
            {[
              ["Asked", String(reviews.length)],
              ["Good", `${count("good")} of ${rated.length}`],
              ["Needs work or wrong", String(count("needs_work") + count("wrong"))],
              ["Typical time", median ? `${(median / 1000).toFixed(1)} s` : "–"],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface p-4">
                <dt className="font-ui text-[13px] text-ink/65">{label}</dt>
                <dd className="mt-1 font-ui text-[20px] font-semibold tabular-nums text-ink-strong">{value}</dd>
              </div>
            ))}
          </dl>
          <AskBench initial={reviews} />
        </>
      )}
    </>
  );
}
