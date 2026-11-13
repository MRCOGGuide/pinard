import { Skeleton, SkeletonRegion, SkeletonText } from "@/components/ui";

/**
 * Loading states, shaped like what they stand in for.
 *
 * A spinner says "wait" and nothing else; a skeleton the shape of the
 * page says what is coming and holds its place, so nothing jumps when
 * it arrives. These are what the loading.tsx files render while a
 * server component fetches.
 *
 * Each opens on the dark band its page will have (.masthead), with the
 * page's own title on it where the placeholder knows which page it is
 * for. Moving between two pages passes through one of these, and
 * without the band it went dark, pale, dark: the band left with one
 * page and came back with the next. With it the band holds, and the
 * title is already the right one by the time the page fills in.
 */

/** The head of the page to come: its title if known, a block if not,
 *  and the line the trace will be drawn along. */
function Band({ title, compact = false }: { title?: string; compact?: boolean }) {
  return (
    <header className={compact ? "masthead masthead-compact" : "masthead"} aria-hidden="true">
      {title ? (
        <h1 className="type-title text-ink-strong">{title}</h1>
      ) : (
        <div className="type-title">
          <Skeleton className="h-[0.82em] w-[5.5em] max-w-full" />
        </div>
      )}
      <div className={`flex items-end pb-[5px] ${compact ? "mt-2 h-4 w-36" : "mt-3 h-5 w-44"}`}>
        <span className="block h-px w-full bg-accent/50" />
      </div>
    </header>
  );
}

/** Any screen: its band, a line of lede, and three blocks of content. */
export function PageSkeleton({ label = "Loading the page", title }: { label?: string; title?: string }) {
  return (
    <SkeletonRegion label={label}>
      <Band title={title} />
      <SkeletonText lines={2} className="max-w-[34rem]" />
      <div className="mt-10 space-y-8">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-t border-line pt-6">
            <Skeleton className="h-5 w-48" />
            <SkeletonText lines={3} className="mt-4" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** A question screen: its band (the compact one, as a screen of
 *  questions has), the counter and trace, a stem, five options. */
export function QuestionSkeleton({
  label = "Loading the questions",
  title,
  compact = true,
}: {
  label?: string;
  title?: string;
  compact?: boolean;
}) {
  return (
    <SkeletonRegion label={label}>
      <Band title={title} compact={compact} />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="mt-3 h-[3px] w-full" />
      <Skeleton className="mt-8 h-4 w-40" />
      <SkeletonText lines={4} className="mt-4 max-w-[38rem]" />
      <div className="mt-8 space-y-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-control" />
        ))}
      </div>
      <Skeleton className="mt-8 h-12 w-40 rounded-control" />
    </SkeletonRegion>
  );
}

/** A page of figures: its band, a row of four numbers, then a list of
 *  rows with bars (Progress, Plan). */
export function DashboardSkeleton({ label = "Loading your progress", title }: { label?: string; title?: string }) {
  return (
    <SkeletonRegion label={label}>
      <Band title={title} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[84px] rounded-card" />
        ))}
      </div>
      <div className="mt-10 space-y-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="mt-2 h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
