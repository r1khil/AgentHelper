import { SkeletonPageHead } from "@/components/app/page-head";
import { Bone, SkeletonChart, SkeletonRows, SkeletonStatStrip, TextBone } from "@/components/app/skeletons";
import type { PortfolioView } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Loading shapes for the Portfolio. A view's loading.tsx shows only its body (the layout's header, hero and view
// control stay on screen while it loads); PortfolioSkeleton is the whole page, for the first visit. Each copies the
// outer layout of the component named above it so the page streams in without moving.

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** positions-table.tsx: the heading and its four buttons, the header row, a group row on its band and its holdings. */
export function PositionsSkeleton({ rows = 9 }: { rows?: number }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading positions">
      <div className="mt-6 flex items-center gap-2">
        <TextBone className="flex-1 text-title font-bold" w="w-28" />
        {["w-24", "w-24", "w-20", "w-16"].map((w, i) => (
          <Bone key={i} className={cn("h-7 rounded-lg", w)} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-col">
        <div className="flex h-8 items-center border-b">
          <Bone className="h-2.5 w-12 rounded-[4px]" />
        </div>
        {range(rows).map((i) => (
          <div key={i} className={cn("flex items-center gap-2.5 border-b", i === 0 ? "h-11 bg-band" : "h-10 border-row pl-[18px]")}>
            {i > 0 && <Bone className="size-5 rounded-[5px]" />}
            <Bone className={cn("h-3 rounded-[4px]", i === 0 ? "w-40" : "w-28")} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The book's hero, chart, range row and five numbers (scope-hero.tsx), then the view control. */
function HeroBones() {
  return (
    <div className="flex flex-col">
      <TextBone className="text-body" w="w-16" />
      <div className="hero-figure flex items-center">
        <Bone className="h-9 w-72 rounded-[6px]" />
      </div>
      <TextBone className="text-emph" w="w-96" />
      <SkeletonChart className="mt-[22px] h-[220px]" />
      <div className="mt-3 flex items-center gap-1 border-b pb-3.5">
        {range(6).map((i) => (
          <Bone key={i} className="h-7 w-10 rounded-lg" />
        ))}
        <span className="flex-1" />
        <TextBone className="text-caption" w="w-80" />
      </div>
      <SkeletonStatStrip cells={5} className="border-t-0" />
      <Bone className="mt-[22px] h-[34px] w-[440px] rounded-[10px]" />
    </div>
  );
}

/** The rail beside Positions (rail.tsx): the ask pill and three cards. */
function RailBones() {
  return (
    <div className="flex w-[300px] shrink-0 flex-col gap-[18px]">
      <Bone className="h-[46px] rounded-full" />
      {[5, 4].map((rows, c) => (
        <div key={c} className="rounded-xl bg-surface p-4">
          <TextBone className="mb-2 text-body font-semibold" w="w-40" />
          <SkeletonRows count={rows} row="flex h-9 items-center px-0" cells={["w-full"]} />
        </div>
      ))}
    </div>
  );
}

const VIEW_BODY: Record<PortfolioView, () => React.ReactNode> = {
  positions: () => <PositionsSkeleton />,
  performance: () => <PerformanceSkeleton />,
  risk: () => <RiskViewSkeleton />,
  exposure: () => <ExposureViewSkeleton />,
  activity: () => <ActivitySkeleton />,
  "what-if": () => <WhatIfSkeleton />,
};

/**
 * The whole Portfolio on the first visit or a change of scope: header, hero, view control and the view's body, with
 * the rail beside Positions.
 */
export function PortfolioSkeleton({ view = "positions" }: { view?: PortfolioView }) {
  return (
    <>
      <SkeletonPageHead />
      <div className="flex items-start gap-9" aria-busy="true" aria-label="Loading the portfolio">
        <div className="flex min-w-0 flex-1 flex-col">
          <HeroBones />
          <div className="mt-3.5">{VIEW_BODY[view]()}</div>
        </div>
        {view === "positions" && <RailBones />}
      </div>
    </>
  );
}

/** A section heading and a table of rows. */
function TableBones({ rows, className }: { rows: number; className?: string }) {
  return (
    <section className={className}>
      <TextBone className="text-title font-bold" w="w-40" />
      <TextBone className="mt-1 text-caption" w="w-80" />
      <div className="mt-2 flex h-[34px] items-center border-b">
        <Bone className="h-2.5 w-12 rounded-[4px]" />
      </div>
      <SkeletonRows count={rows} row="grid min-h-9 grid-cols-[minmax(0,1fr)_80px_80px_80px] items-center gap-3 px-0" cells={["w-32", "w-12 justify-self-end", "w-12 justify-self-end", "w-12 justify-self-end"]} />
    </section>
  );
}

/** A view's own headline (portfolio/hero.tsx): label, the figure and the line under it. */
function ViewHeadBones() {
  return (
    <div className="flex flex-col">
      <TextBone className="text-body" w="w-72" />
      <TextBone className="text-display" w="w-40" />
      <TextBone className="text-body" w="w-[520px] max-w-full" />
    </div>
  );
}

/** Performance (attribution-views.tsx, daily/today-view.tsx): the headline, the chart and period buttons, the effects, sectors beside teams, holdings. */
export function PerformanceSkeleton() {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading performance">
      <ViewHeadBones />
      <SkeletonChart className="mt-[22px] h-[200px]" />
      <div className="mt-3.5 flex items-center gap-1 border-b pb-3.5">
        {range(9).map((i) => (
          <Bone key={i} className="h-7 w-14 rounded-lg" />
        ))}
      </div>
      <SkeletonStatStrip cells={3} className="border-t-0" />
      <div className="mt-[26px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14">
        <TableBones rows={10} />
        <TableBones rows={6} />
      </div>
    </div>
  );
}

/** Risk (risk-view.tsx): the headline, the drawdown and window buttons, four numbers, where the risk comes from. */
export function RiskViewSkeleton() {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading risk">
      <ViewHeadBones />
      <SkeletonChart className="mt-[22px] h-[150px]" />
      <div className="mt-3.5 flex items-center gap-1 border-b pb-3.5">
        {range(3).map((i) => (
          <Bone key={i} className="h-7 w-12 rounded-lg" />
        ))}
      </div>
      <SkeletonStatStrip cells={4} className="border-t-0" />
      <div className="mt-[26px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14">
        <TableBones rows={10} />
        <TableBones rows={6} />
      </div>
    </div>
  );
}

/** Exposure (exposure-view.tsx): the headline and the look-through switch, sector tilts beside factors. */
export function ExposureViewSkeleton() {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading exposure">
      <div className="flex items-end gap-10">
        <div className="min-w-0 flex-1">
          <ViewHeadBones />
        </div>
        <Bone className="mb-1 h-9 w-56 shrink-0 rounded-lg" />
      </div>
      <div className="mt-[30px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14 border-t pt-[22px]">
        <TableBones rows={11} />
        <TableBones rows={7} />
      </div>
    </div>
  );
}

/** Activity (activity-view.tsx): the History row with its filters and buttons, the totals line, the entries by day. */
export function ActivitySkeleton() {
  return (
    <div className="flex max-w-[1000px] flex-col" aria-busy="true" aria-label="Loading activity">
      <div className="mt-5 flex flex-wrap items-center gap-1">
        <TextBone className="mr-3 text-title font-bold" w="w-20" />
        {["w-10", "w-16", "w-12", "w-20"].map((w, i) => (
          <Bone key={i} className={cn("h-7 rounded-lg", w)} />
        ))}
        <span className="flex-1" />
        {["w-24", "w-36", "w-24"].map((w, i) => (
          <Bone key={i} className={cn("h-7 rounded-lg", w)} />
        ))}
      </div>
      <TextBone className="mt-2.5 text-caption" w="w-4/5" />
      {[3, 2, 2].map((rows, d) => (
        <div key={d}>
          <div className="border-b pt-[18px] pb-1.5">
            <TextBone className="text-caption" w="w-24" />
          </div>
          {range(rows).map((i) => (
            <div key={i} className="grid min-h-14 grid-cols-[36px_minmax(0,1fr)_140px_150px] items-center gap-3.5 border-b border-row">
              <Bone className="size-8 rounded-full" />
              <div className="min-w-0">
                <TextBone className="text-body font-semibold" w="w-64" />
                <TextBone className="text-caption" w="w-96" />
              </div>
              <Bone className="ml-auto h-3 w-20 rounded-[4px]" />
              <Bone className="ml-auto h-3 w-16 rounded-[4px]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** What if (backtesting-redesign.tsx): the result, the settings row, the replay chart, the weight changes beside saved scenarios. */
export function WhatIfSkeleton() {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading what if">
      <ViewHeadBones />
      <div className="mt-[18px] flex items-center gap-2">
        {["w-44", "w-72", "w-40", "w-60"].map((w, i) => (
          <Bone key={i} className={cn("h-[30px] rounded-md", w)} />
        ))}
        <span className="flex-1" />
        <Bone className="h-[30px] w-24 rounded-md" />
      </div>
      <SkeletonChart className="mt-[18px] h-[220px]" />
      <div className="mt-[26px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14">
        <TableBones rows={4} />
        <TableBones rows={3} />
      </div>
    </div>
  );
}
