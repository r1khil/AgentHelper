import { SkeletonPageHead } from "@/components/app/page-head";
import { Skeleton } from "@/components/ui/skeleton";

/** A rail card's shape while it loads: the surface, its title, and `rows` label / value rows. */
export function RailCardFallback({ title, rows }: { title?: string; rows: number }) {
  return (
    <div aria-hidden className="rounded-xl bg-surface p-4">
      {title ? <p className="mb-1.5 text-body font-semibold">{title}</p> : <Skeleton className="mb-3 h-3 w-24" />}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-[34px] items-center justify-between border-b border-row last:border-b-0">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

/**
 * The holding page while it streams in, shaped like it so nothing moves: the header, the name and price, the chart,
 * the ask box and the tab row with rows under it, and the rail's cards beside.
 */
export function HoldingPageSkeleton() {
  return (
    <>
      <SkeletonPageHead />
      <div aria-busy="true" aria-label="Loading the holding" className="flex gap-10">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-[10px]" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
          </div>
          <div className="mt-[18px] flex items-baseline gap-3">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="mt-[22px] h-[220px] w-full" />
          <div className="mt-3 flex gap-1 border-b pb-3.5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-9" />
            ))}
          </div>
          <Skeleton className="mt-[22px] h-[104px] w-full rounded-2xl" />
          <div className="mt-[26px] flex h-9 gap-5 border-b">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="grid h-[54px] grid-cols-[110px_minmax(0,1fr)_120px] items-center gap-3.5 border-b border-row">
              <Skeleton className="h-3 w-14" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-2.5 w-2/5" />
              </div>
              <Skeleton className="ml-auto h-3 w-16" />
            </div>
          ))}
        </div>
        <aside className="flex w-[300px] shrink-0 flex-col gap-[22px] pt-1">
          <RailCardFallback rows={6} />
          <RailCardFallback rows={4} />
          <div className="flex flex-col gap-2 px-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </aside>
      </div>
    </>
  );
}
