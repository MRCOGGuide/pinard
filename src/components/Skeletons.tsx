import { Skeleton, SkeletonRegion, SkeletonText } from "@/components/ui";

/**
 * Loading states, shaped like what they stand in for.
 *
 * A spinner says "wait" and nothing else; a skeleton the shape of the
 * page says what is coming and holds its place, so nothing jumps when
 * it arrives. These are what the loading.tsx files render while a
 * server component fetches.
 */

/** Any screen: a heading with the trace under it, a line of lede, and
 *  three blocks of content. */
export function PageSkeleton({ label = "Loading the page" }: { label?: string }) {
  return (
    <SkeletonRegion label={label}>
      <Skeleton className="h-9 w-2/3 max-w-[22rem]" />
      <Skeleton className="mt-4 h-[3px] w-44" />
      <SkeletonText lines={2} className="mt-5 max-w-[34rem]" />
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

/** A question screen: the counter and trace, a stem, five options. */
export function QuestionSkeleton({ label = "Loading the questions" }: { label?: string }) {
  return (
    <SkeletonRegion label={label}>
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

/** A page of figures: a row of four numbers, then a list of rows with
 *  bars (Today, Progress, Plan). */
export function DashboardSkeleton({ label = "Loading your progress" }: { label?: string }) {
  return (
    <SkeletonRegion label={label}>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-4 h-[3px] w-44" />
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
