import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant fallback for every app page. Next prefetches it with the layout, so a click swaps to this skeleton
 * at once while the page's own data streams in behind it. Shaped like the pages: a toolbar, then panels.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-28 rounded-full bg-muted" />
        <Skeleton className="h-8 w-36 rounded-full bg-muted" />
        <Skeleton className="h-8 w-32 rounded-full bg-muted" />
      </div>
      <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-11 items-center border-b px-4">
          <Skeleton className="h-4 w-40 bg-muted" />
        </div>
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="flex h-10 items-center gap-4 border-b border-row px-4 last:border-0">
            <Skeleton className="h-3.5 w-14 bg-muted" />
            <Skeleton className="h-3.5 w-40 bg-muted" />
            <Skeleton className="h-3.5 flex-1 bg-muted" />
            <Skeleton className="h-5 w-20 rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
