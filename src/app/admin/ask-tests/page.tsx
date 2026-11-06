import { TraceHeader } from "@/components/TraceHeader";
import { latestRuns, runStarted, type TestResult, type TestRun } from "@/lib/ask-tests";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReviewCard } from "../ask/AskBench";
import type { AskReview } from "../ask/actions";
import { RunTests } from "./RunTests";

export const dynamic = "force-dynamic";

const when = (run: TestRun) =>
  runStarted(run.id).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const seconds = (ms: number | null | undefined) => (ms ? `${Math.round(ms / 1000)} s` : "–");

const RATING = { good: "Good", needs_work: "Needs work", wrong: "Wrong" };

/**
 * Admin > Ask tests (owner's brief, part 8): the fixed questions, each
 * answer beside the run before, with the times. The owner judges clinical
 * correctness, so the ratings here are the sign-off.
 */
export default async function AskTestsPage() {
  const runs = await latestRuns(2);
  const [latest, previous] = runs;
  const ids = runs.flatMap((run) => run.results.map((r) => r.review_id)).filter((id): id is number => id !== null);
  const { data } = ids.length ? await createAdminClient().from("ask_reviews").select("*").in("id", ids) : { data: [] };
  const reviews = new Map(((data ?? []) as AskReview[]).map((r) => [r.id, r]));
  const reviewOf = (r: TestResult | undefined) => (r?.review_id ? reviews.get(r.review_id) : undefined);
  const inPrevious = (r: TestResult) => previous?.results.find((p) => p.question === r.question);
  const timing = (r: TestResult | undefined) => (r ? `${seconds(r.first_ms)}, ${seconds(reviewOf(r)?.total_ms)}` : "–");

  return (
    <>
      <TraceHeader
        title="Ask tests"
        lede="The same questions asked again after each change, every answer beside the one before it. The clinical judgement is yours: rate each latest answer, and say what it should have said."
      />
      <RunTests />
      {!latest ? (
        <p className="rounded-card border border-line bg-surface p-5 font-ui text-[16px] text-ink/80">No tests have been run yet.</p>
      ) : (
        <>
          <div className="mb-6 overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full font-ui text-[14px]">
              <thead>
                <tr className="border-b border-line text-left text-ink/70">
                  <th className="px-4 py-2 font-medium">Question</th>
                  <th className="px-4 py-2 font-medium">Before (first line, all)</th>
                  <th className="px-4 py-2 font-medium">Latest (first line, all)</th>
                  <th className="px-4 py-2 font-medium">Your rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {latest.results.map((r) => {
                  const rating = reviewOf(r)?.rating;
                  return (
                    <tr key={r.n}>
                      <td className="px-4 py-2 text-ink-strong">
                        <a href={`#test-${r.n}`} className="hover:text-good">
                          {r.label}
                        </a>
                      </td>
                      <td className="px-4 py-2 tabular-nums text-ink/80">{timing(inPrevious(r))}</td>
                      <td className="px-4 py-2 tabular-nums text-ink/80">{timing(r)}</td>
                      <td className="px-4 py-2 text-ink/80">{rating ? RATING[rating] : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {latest.results.map((r) => {
            const before = reviewOf(inPrevious(r));
            const now = reviewOf(r);
            return (
              <section key={r.n} id={`test-${r.n}`} className="mb-8 scroll-mt-20">
                <h2 className="font-ui text-[17px] font-semibold text-ink-strong">{r.label}</h2>
                <p className="mt-1 mb-3 font-ui text-[15px] text-ink/80">{r.question}</p>
                {!r.planned && (
                  <p className="mb-3 font-ui text-[14px] text-accent-ink">The planning step failed on this answer, so its search was short. Run the tests again before judging it.</p>
                )}
                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                  {before ? (
                    <ReviewCard review={before} heading={`Before: ${when(previous)}`} />
                  ) : (
                    <p className="font-ui text-[15px] text-ink/70">Not in the run before.</p>
                  )}
                  {now ? (
                    <ReviewCard review={now} heading={`Latest: ${when(latest)}`} />
                  ) : (
                    <p className="font-ui text-[15px] text-accent-ink">This answer could not be saved.</p>
                  )}
                </div>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
