import { TraceHeader } from "@/components/TraceHeader";
import { fetchGroupsForValues, fetchValueIndex } from "@/lib/similarValues";
import { SimilarValuesReview } from "./SimilarValuesReview";
import { PanelSwitch } from "./PanelSwitch";
import { readFlag, SIMILAR_VALUES_ENABLED } from "@/lib/settings";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "@/components/ui";

/**
 * Owner review of the figures that pair under an answer.
 *
 * The heuristics in factQuality already drop study apparatus and model
 * scores. What reaches this screen is what they cannot judge: whether a
 * figure is the kind of thing a candidate should carry. A trial-arm
 * complication rate and a mortality figure can both be 1%.
 */



export default async function SimilarValuesPage({
  searchParams,
}: {
  searchParams: { page?: string; show?: string; per?: string };
}) {
  const [index, panel] = await Promise.all([
    fetchValueIndex(),
    readFlag(SIMILAR_VALUES_ENABLED),
  ]);

  const show = searchParams.show === "reviewed" ? "reviewed" : "unreviewed";
  const filtered =
    show === "reviewed"
      ? index.groups.filter((g) => g.reviewed)
      : index.groups.filter((g) => !g.reviewed);

  // Page size lives in the URL beside the page number, so a link to
  // "page 3" means the same thing when it is opened again.
  const requested = Number(searchParams.per);
  const perPage = (PAGE_SIZES as readonly number[]).includes(requested)
    ? requested
    : DEFAULT_PAGE_SIZE;

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const page = Math.min(
    pageCount,
    Math.max(1, Number(searchParams.page ?? "1") || 1)
  );
  const firstShown = (page - 1) * perPage;

  // Only the groups this page shows are read in full.
  const slice = await fetchGroupsForValues(
    filtered.slice(firstShown, firstShown + perPage)
  );

  const reviewedGroups = index.groups.filter((g) => g.reviewed).length;

  return (
    <>
      <TraceHeader
        title="Similar values"
        eyebrow={`${reviewedGroups} of ${index.groups.length} groups reviewed`}
        lede="Figures that pair under an answer. While the panel is on, every fact here is in use until you decline it — decline the ones a candidate could not act on, such as a single trial's arm or a study's own methods. Declining never removes a fact from the store; it can still ground a question."
      />

      <PanelSwitch enabled={panel.enabled} available={panel.available} />

      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-card border border-hairline bg-porcelain p-4 text-sm">
        <span className="font-mono text-xs text-graphite/60">
          {index.groups.length} value groups · {index.factCount} facts ·{" "}
          {index.excludedCount} declined
        </span>
      </div>

      <SimilarValuesReview
        groups={slice}
        show={show}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        firstShown={firstShown}
        totalInFilter={filtered.length}
      />
    </>
  );
}
