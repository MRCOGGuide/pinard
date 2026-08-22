import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { fetchValueGroups } from "@/lib/similarValues";
import { SimilarValuesReview } from "./SimilarValuesReview";

/**
 * Owner review of the figures that pair under an answer.
 *
 * The heuristics in factQuality already drop study apparatus and model
 * scores. What reaches this screen is what they cannot judge: whether a
 * figure is the kind of thing a candidate should carry. A trial-arm
 * complication rate and a mortality figure can both be 1%.
 */

const PER_PAGE = 15;

export default async function SimilarValuesPage({
  searchParams,
}: {
  searchParams: { page?: string; show?: string };
}) {
  const supabase = createClient();
  const groups = await fetchValueGroups(supabase);

  const show = searchParams.show === "reviewed" ? "reviewed" : "unreviewed";
  const filtered =
    show === "reviewed"
      ? groups.filter((g) => g.reviewed)
      : groups.filter((g) => !g.reviewed);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const page = Math.min(
    pageCount,
    Math.max(1, Number(searchParams.page ?? "1") || 1)
  );
  const slice = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const factCount = groups.reduce((n, g) => n + g.facts.length, 0);
  const excluded = groups.reduce(
    (n, g) => n + g.facts.filter((f) => f.excluded).length,
    0
  );
  const reviewedGroups = groups.filter((g) => g.reviewed).length;

  return (
    <>
      <TraceHeader
        title="Similar values"
        eyebrow={`${reviewedGroups} of ${groups.length} groups reviewed`}
        lede="Figures that pair under an answer. Every fact here is in use until you decline it — decline the ones a candidate could not act on, such as a single trial's arm or a study's own methods. Declining never removes a fact from the store; it can still ground a question."
      />

      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-card border border-hairline bg-porcelain p-4 text-sm">
        <span className="font-mono text-xs text-graphite/60">
          {groups.length} value groups · {factCount} facts · {excluded} declined
        </span>
      </div>

      <SimilarValuesReview
        groups={slice}
        show={show}
        page={page}
        pageCount={pageCount}
        totalInFilter={filtered.length}
      />
    </>
  );
}
