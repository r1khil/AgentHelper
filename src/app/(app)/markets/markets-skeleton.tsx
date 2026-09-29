import { SkeletonPageHead } from "@/components/app/page-head";
import { Bone, SkeletonPage, TextBone } from "@/components/app/skeletons";
import { cn } from "@/lib/utils";

// Markets while it loads, shaped like markets-view.tsx (the heading, the filter row, day sections of 36px rows, the
// 300px rail of cards) so the page lands without moving.

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const ROW = "grid grid-cols-[60px_minmax(0,1fr)_120px_216px] items-center gap-3";

/** A rail card with `rows` 34px rows, like RailCard. */
export function RailCardSkeleton({ rows, className }: { rows: number; className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-[12px] bg-surface p-4", className)}>
      <TextBone className="mb-1 text-body font-semibold" w="w-20" />
      {range(rows).map((i) => (
        <div key={i} className="flex h-[34px] items-center justify-between border-b border-row last:border-b-0">
          <Bone className="h-3 w-24 rounded-[4px]" />
          <Bone className="h-3 w-16 rounded-[4px]" />
        </div>
      ))}
      <TextBone className="mt-2 text-caption" w="w-40" />
    </div>
  );
}

export function MarketsSkeleton() {
  return (
    <>
      <SkeletonPageHead />
      <SkeletonPage className="flex gap-9">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <TextBone className="text-display font-semibold" w="w-44" />
            <TextBone className="text-body" w="w-96" />
          </div>
          <div className="mt-4 flex items-center gap-3 border-b pb-3">
            <Bone className="h-7 w-72 rounded-lg" />
            <Bone className="h-7 w-48 rounded-lg" />
            <span className="flex-1" />
            <Bone className="h-7 w-36 rounded-lg" />
          </div>
          {range(6).map((d) => (
            <div key={d} className="grid grid-cols-[100px_minmax(0,1fr)] gap-4 border-b py-3.5">
              <div className="flex flex-col gap-1.5 pt-2">
                <Bone className="h-3 w-20 rounded-[4px]" />
                <Bone className="h-2.5 w-12 rounded-[4px]" />
              </div>
              <div className="flex flex-col gap-0.5">
                {range(d % 3 === 0 ? 2 : 1).map((i) => (
                  <div key={i} className={cn(ROW, "h-9")}>
                    <Bone className="h-2.5 w-14 rounded-[4px]" />
                    <Bone className="h-3 w-48 rounded-[4px]" />
                    <Bone className="h-3 w-24 rounded-[4px]" />
                    <Bone className="ml-auto h-3 w-32 rounded-[4px]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex w-[300px] shrink-0 flex-col gap-[18px]">
          <RailCardSkeleton rows={4} />
          <RailCardSkeleton rows={5} />
        </div>
      </SkeletonPage>
    </>
  );
}
