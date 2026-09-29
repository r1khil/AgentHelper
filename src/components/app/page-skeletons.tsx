import { LastSessionSkeleton } from "@/app/(app)/_today/last-session";
import { SkeletonPageHead } from "@/components/app/page-head";
import { StressPanelFallback } from "@/components/app/risk/stress-panel";
import { cn } from "@/lib/utils";
import { Bone, SkeletonChart, SkeletonPage, SkeletonPanel, SkeletonPanelHeader, SkeletonPill, SkeletonRows, SkeletonStatStrip, SkeletonTabs, TextBone } from "./skeletons";

// One loading skeleton per page, used by the route's loading.tsx. Each copies its page's outer layout classes
// (grids, column widths, gaps, panel and row heights) from the component named above it, so the page streams in
// on top of it without moving. Update the skeleton when that layout changes.

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/* ------------------------------------------------------------------------------------------------ Home */

/** One of Home's three columns (`_today/hoot-list.tsx`, movers.tsx, coming-up.tsx): a 13px heading over a hairline, then rows. */
function HomeColumn({ rows, row, className }: { rows: number; row: string; className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between border-b pb-1.5">
        <TextBone className="text-body font-bold" w="w-28" />
        <Bone className="h-3 w-12 rounded-[4px]" />
      </div>
      {range(rows).map((i) => (
        <div key={i} className={cn("flex items-center border-b border-row", row)}>
          <Bone className="h-3 w-full rounded-[4px]" />
        </div>
      ))}
    </section>
  );
}

/**
 * Home (`_today/today-view.tsx`): no page header, a thin line at the top, then Hoot's face, the greeting, the question
 * box, the starter chips and the three columns (Needs you, Moving the book today, This week). Below them, for readers
 * who see a book, the last session and the evening brief (the fund's book only), and the teams. Those follow the reader's
 * role, which the shell sets on <main>.
 */
export function TodaySkeleton() {
  return (
    <SkeletonPage>
      <div className="-mx-10 -mt-8 flex h-[52px] items-center justify-end px-10">
        <Bone className="h-3 w-72 rounded-[4px]" />
      </div>
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center pt-10">
        <Bone className="size-[52px] rounded-full" />
        <TextBone className="mt-3.5 text-hero" w="w-[26rem]" />
        <TextBone className="mt-2.5 text-emph" w="w-[30rem]" />
        {/* The question box: two 26px lines of text and the control row. */}
        <div className="mt-[26px] flex w-full flex-col rounded-xl border border-border-strong px-4 pt-4 pb-3">
          <div className="h-[52px]" />
          <div className="mt-2.5 flex items-center gap-2">
            <Bone className="h-[30px] w-28 rounded-md" />
            <span className="flex-1" />
            <Bone className="size-[34px] rounded-lg" />
          </div>
        </div>
        <TextBone className="mt-2.5 text-caption" w="w-96" />
        <div className="mt-[18px] flex flex-wrap justify-center gap-2">
          {["w-64", "w-56", "w-64", "w-60"].map((w, i) => (
            <Bone key={i} className={cn("h-[30px] rounded-md", w)} />
          ))}
        </div>
      </div>
      <div className="mx-auto mt-12 grid w-full max-w-[1048px] grid-cols-3 items-start gap-10">
        <HomeColumn rows={3} row="h-[52px]" />
        <HomeColumn rows={5} row="h-[38px]" />
        <HomeColumn rows={5} row="h-[38px]" />
      </div>
      {/* Readers who see a book: the last session, and Hoot's brief for the fund's. */}
      <div className="mx-auto mt-14 hidden w-full max-w-[1048px] grid-cols-2 items-start gap-10 in-data-[role=admin]:grid in-data-[role=exec]:grid in-data-[role^=lead]:grid">
        <LastSessionSkeleton />
        <section className="hidden in-data-[role=admin]:block in-data-[role=exec]:block">
          <div className="flex items-baseline justify-between border-b pb-1.5">
            <TextBone className="text-body font-bold" w="w-40" />
          </div>
          <div className="mt-3">
            {["w-full", "w-full", "w-full", "w-full", "w-3/5"].map((w, i) => (
              <TextBone key={i} className="hoot-prose" w={w} />
            ))}
          </div>
        </section>
      </div>
      {/* Teams: a 52px row per team under a divider. */}
      <section className="mx-auto mt-12 w-full max-w-[1048px]">
        <div className="flex items-baseline justify-between border-b pb-1.5">
          <TextBone className="text-body font-bold" w="w-32" />
          <Bone className="h-3 w-14 rounded-[4px]" />
        </div>
        <div className="flex h-8 shrink-0 items-center">
          <Bone className="h-2.5 w-10 rounded-[4px]" />
        </div>
        {range(6).map((i) => (
          <div key={i} className="flex h-[52px] items-center gap-3 border-t border-row">
            <Bone className="h-3 w-32 rounded-[4px]" />
            <span className="flex-1" />
            <Bone className="h-3 w-24 rounded-[4px]" />
          </div>
        ))}
      </section>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Portfolio and team */

/**
 * The Overview's body (`t/[team]/fund-overview.tsx`, components/app/portfolio/*): the fund's label, value and change,
 * the 220px chart with its range row, the six-number strip, Needs you beside This week, then the positions table.
 */
export function OverviewSkeletonBody() {
  return (
    <div className="flex flex-col">
      <TextBone className="text-body" w="w-16" />
      <TextBone className="hero-figure" w="w-72" />
      <TextBone className="text-emph" w="w-96" />
      <SkeletonChart className="mt-[22px] h-[220px]" />
      <div className="mt-3 flex items-center gap-1 border-b pb-3.5">
        {range(6).map((i) => (
          <Bone key={i} className="h-7 w-10 rounded-lg" />
        ))}
        <span className="flex-1" />
        <TextBone className="text-caption" w="w-80" />
      </div>
      <div className="grid grid-cols-6 gap-4 border-b pt-[18px] pb-5">
        {range(6).map((i) => (
          <div key={i} className="flex min-w-0 flex-col gap-[3px]">
            <TextBone className="text-caption" w="w-20" />
            <TextBone className="figure text-title" w="w-16" />
            <TextBone className="text-caption" w="w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-14 pt-[22px] pb-1.5">
        {[4, 4].map((rows, s) => (
          <div key={s}>
            <TextBone className="mb-1 text-body font-bold" w="w-16" />
            {range(rows).map((i) => (
              <div key={i} className="grid min-h-10 grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-3 border-b border-row">
                <Bone className="h-3 w-12 rounded-[4px]" />
                <Bone className="h-3 w-3/4 rounded-[4px]" />
                <Bone className="h-3 w-20 rounded-[4px]" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-2">
        <TextBone className="flex-1 text-title font-bold" w="w-28" />
        {["w-16", "w-24", "w-20", "w-16"].map((w, i) => (
          <Bone key={i} className={cn("h-7 rounded-lg", w)} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-col">
        <div className="flex h-8 items-center border-b">
          <Bone className="h-2.5 w-12 rounded-[4px]" />
        </div>
        {range(9).map((i) => (
          <div key={i} className={cn("flex items-center border-b", i === 0 ? "h-9" : "h-10 border-row")}>
            <Bone className={cn("h-3 rounded-[4px]", i === 0 ? "w-40" : "ml-4 w-28")} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Portfolio · Overview (`t/[team]/fund-overview.tsx`): the body, under the header the shell draws. */
export function OverviewSkeleton() {
  return (
    <>
      <SkeletonPageHead tabs={6} />
      <SkeletonPage>
        <OverviewSkeletonBody />
      </SkeletonPage>
    </>
  );
}

/** A team's page (`t/[team]/team-page.tsx`): the label, value and line, four figures, the filter row, the holdings table. */
export function TeamSkeleton() {
  return (
    <>
      <SkeletonPageHead />
      <SkeletonPage className="flex flex-col">
      <TextBone className="text-body" w="w-64" />
      <TextBone className="hero-figure" w="w-56" />
      <TextBone className="text-emph" w="w-96" />
      <SkeletonStatStrip cells={4} className="mt-[18px]" />
      <div className="mt-[22px] flex shrink-0 flex-wrap items-center gap-1">
        <TextBone className="mr-3 text-title font-bold" w="w-24" />
        <Bone className="h-7 w-16 rounded-lg" />
        <Bone className="h-7 w-32 rounded-lg" />
        <Bone className="h-7 w-44 rounded-lg" />
        <span className="flex-1" />
        <TextBone className="text-body" w="w-48" />
      </div>
      <div className="mt-2.5 flex flex-col">
        <div className="flex h-8 items-center border-b">
          <Bone className="h-2.5 w-16 rounded-[4px]" />
        </div>
        {range(5).map((i) => (
          <div key={i} className="flex h-12 items-center border-b border-row">
            <Bone className="h-3 w-24 rounded-[4px]" />
          </div>
        ))}
      </div>
      </SkeletonPage>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------ Holding */

/** components/app/holdings/holding-sections.tsx KeyValueSection: a title over two columns of 40px rows. */
function SkeletonKeyValues({ rows }: { rows: number }) {
  return (
    <section className="min-w-0">
      <TextBone className="text-title font-bold" w="w-32" />
      <div className="mt-2 grid grid-cols-2 gap-x-6">
        {range(rows * 2).map((i) => (
          <div key={i} className="flex h-10 items-center justify-between border-b border-row">
            <Bone className="h-3 w-24 rounded-[4px]" />
            <Bone className="h-3 w-14 rounded-[4px]" />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * A holding's Overview tab (`t/[team]/h/[ticker]/page.tsx`): the header with its five tabs, the company and ticker,
 * the price and its change, the chart with its range row, Fund position beside Key statistics, the thesis and notes
 * beside Research and Coverage, then Latest beside the price against the S&P 500.
 */
export function HoldingSkeleton() {
  return (
    <>
      <SkeletonPageHead tabs={5} />
      <SkeletonPage className="flex min-w-0 flex-col">
        <div className="flex flex-col">
          <TextBone className="text-emph font-semibold" w="w-40" />
          <TextBone className="text-caption" w="w-56" />
        </div>
        <TextBone className="hero-figure" w="w-52" />
        <TextBone className="text-emph" w="w-96" />
        <SkeletonChart className="mt-[22px] h-[220px]" />
        <div className="mt-3 flex items-center gap-1 border-b pb-3.5">
          {range(6).map((i) => (
            <Bone key={i} className="h-7 w-10 rounded-lg" />
          ))}
        </div>
        <div className="mt-[26px] grid grid-cols-2 gap-14">
          <SkeletonKeyValues rows={4} />
          <SkeletonKeyValues rows={4} />
        </div>
        <div className="mt-[30px] grid grid-cols-2 items-start gap-14">
          <div className="flex min-w-0 flex-col gap-6">
            <section>
              <TextBone className="text-title font-bold" w="w-16" />
              <div className="mt-2">
                {["w-full", "w-full", "w-11/12", "w-2/3"].map((w, i) => (
                  <TextBone key={i} className="text-emph" w={w} />
                ))}
              </div>
            </section>
            <section>
              <TextBone className="text-title font-bold" w="w-24" />
              {range(2).map((i) => (
                <div key={i} className="flex gap-3 border-b border-row py-2.5">
                  <Bone className="size-[26px] shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <TextBone className="text-body" w="w-40" />
                    <TextBone className="mt-0.5 text-body" w="w-4/5" />
                  </div>
                </div>
              ))}
            </section>
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <section>
              <TextBone className="mb-1.5 text-title font-bold" w="w-24" />
              {range(6).map((i) => (
                <div key={i} className="grid h-[42px] grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-3 border-b border-row">
                  <Bone className="h-3 w-14 rounded-[4px]" />
                  <Bone className="h-3 w-3/4 rounded-[4px]" />
                  <Bone className="h-3 w-16 rounded-[4px]" />
                </div>
              ))}
            </section>
          </div>
        </div>
        <div className="mt-[30px] grid grid-cols-2 items-start gap-14">
          <section>
            <TextBone className="text-title font-bold" w="w-16" />
            {range(5).map((i) => (
              <div key={i} className="grid min-h-12 grid-cols-[58px_minmax(0,1fr)] items-center gap-3 border-b border-row py-1.5">
                <Bone className="h-3 w-10 rounded-[4px]" />
                <div>
                  <TextBone className="text-body leading-snug" w="w-4/5" />
                  <TextBone className="text-caption" w="w-24" />
                </div>
              </div>
            ))}
          </section>
          <SkeletonPanel className="shrink-0 px-4 py-3.5">
            <TextBone className="text-emph font-semibold" w="w-32" />
            <SkeletonChart className="mt-2.5 h-[200px]" />
          </SkeletonPanel>
        </div>
      </SkeletonPage>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------ Movements */

/**
 * Movements (movements/movements-view.tsx and workspace.tsx), with a movement selected as it nearly always is: the
 * list on the left, the big number, facts row and write-up in the middle, the evidence Hoot gathered on the right,
 * one window tall under the 53px page header.
 */
export function MovementsSkeleton() {
  return (
    <SkeletonPage fullBleed className="flex h-dvh min-h-0 flex-col">
      <SkeletonPageHead />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r pt-3.5 pr-4 pl-10">
          <Bone className="mb-1.5 h-7 w-24 self-start rounded-lg" />
          {range(9).map((i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-0.5 border-b border-row py-2.5">
              <TextBone className="text-body font-semibold" w="w-10" />
              <TextBone className="text-body" w="w-14" />
              <TextBone className="text-caption" w="w-16" />
              <TextBone className="text-caption" w="w-24" />
            </div>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pt-[26px]">
          <div className="flex items-baseline gap-3.5">
            <TextBone className="hero-figure" w="w-56" />
            <TextBone className="text-emph" w="w-72" />
          </div>
          <div className="mt-3 flex gap-x-7 border-b pb-3.5">
            {["w-28", "w-44", "w-40", "w-32"].map((w, i) => (
              <TextBone key={i} className="text-body" w={w} />
            ))}
          </div>
          <div className="mt-[18px] flex items-baseline">
            <TextBone className="flex-1 text-title font-bold" w="w-28" />
            <TextBone className="text-caption" w="w-24" />
          </div>
          <div className="mt-2 min-h-40 border-y border-row py-3">
            {["w-full", "w-full", "w-5/6", "w-full", "w-3/4"].map((w, i) => (
              <TextBone key={i} className="text-emph leading-6" w={w} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Bone className="h-[30px] w-44 rounded-lg" />
            <Bone className="h-[30px] w-24 rounded-lg" />
            <span className="flex-1" />
            <Bone className="h-[30px] w-28 rounded-lg" />
          </div>
      </div>
      <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l pt-[22px] pr-10 pl-6">
        <div className="flex items-baseline">
          <TextBone className="flex-1 text-body font-bold" w="w-36" />
          <TextBone className="text-caption" w="w-14" />
        </div>
        <TextBone className="mt-1 text-caption" w="w-52" />
        {[1, 2, 1].map((n, g) => (
          <div key={g}>
            <TextBone className="pt-3 pb-0.5 text-caption font-semibold" w="w-16" />
            {range(n).map((i) => (
              <div key={i} className="grid grid-cols-[18px_minmax(0,1fr)] gap-1.5 border-b border-row py-[7px]">
                <Bone className="h-3 w-3 rounded-[4px]" />
                <span className="flex flex-col gap-[3px]">
                  <TextBone className="text-body" w="w-full" />
                  <TextBone className="text-caption" w="w-32" />
                  <TextBone className="text-caption" w="w-14" />
                </span>
              </div>
            ))}
          </div>
        ))}
      </aside>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Calendars */

/**
 * The earnings and economic calendars (earnings/calendar-view.tsx, week layout): the month, Show and Expectations
 * down the side, the week's days on the right.
 */
export function CalendarSkeleton() {
  return (
    <SkeletonPage className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-5">
        {/* Month */}
        <SkeletonPanel className="shrink-0 px-3.5 pt-3.5 pb-2.5">
          <div className="flex h-6 items-center gap-1">
            <TextBone className="flex-1 text-emph font-semibold" w="w-32" />
            <Bone className="size-6 rounded-full" />
            <Bone className="size-6 rounded-full" />
          </div>
          <div className="mt-2.5 grid grid-cols-7 gap-y-0.5 text-center font-mono text-caption">
            {range(7).map((i) => (
              <span key={i} className="pb-1.5">
                <span className="inline-block h-[0.7em] w-2 rounded-[3px] bg-muted align-middle" />
              </span>
            ))}
            {range(35).map((i) => (
              <span key={i} className="flex h-[34px] items-center justify-center">
                <Bone className="h-2.5 w-3.5 rounded-[3px]" />
              </span>
            ))}
          </div>
        </SkeletonPanel>
        {/* Show */}
        <SkeletonPanel className="shrink-0 px-3.5 pt-3.5 pb-3.5">
          <TextBone className="text-emph font-semibold" w="w-12" />
          <div className="mt-2.5 flex flex-col gap-2.5 text-body">
            {["w-28", "w-24"].map((w, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Bone className="size-4 rounded-[5px]" />
                <TextBone className="flex-1" w={w} />
              </div>
            ))}
            <div>
              <div className="flex items-center gap-2.5">
                <Bone className="size-4 rounded-[5px]" />
                <TextBone className="flex-1" w="w-36" />
              </div>
              <div className="mt-2.5 flex flex-col gap-2 pl-[26px]">
                <SkeletonPill className="w-44" />
                <Bone className="h-8 w-full rounded-lg" />
              </div>
            </div>
          </div>
        </SkeletonPanel>
        {/* Expectations this week */}
        <SkeletonPanel className="min-h-[220px] flex-1 px-3.5 pt-3.5 pb-3.5">
          <TextBone className="text-emph font-semibold" w="w-44" />
          <TextBone className="mt-0.5 text-body" w="w-52" />
          <div className="mt-2.5 flex flex-col">
            {range(3).map((i) => (
              <div key={i} className="border-t border-row">
                <div className="flex h-10 items-center gap-2.5">
                  <Bone className="h-3 w-11 rounded-[4px]" />
                  <Bone className="h-3 flex-1 rounded-[4px]" />
                  <Bone className="h-[22px] w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1" />
          <div className="mt-3 flex flex-col gap-1">
            <div>
              {["w-full", "w-full", "w-1/2"].map((w, i) => (
                <TextBone key={i} className="text-body leading-[18px]" w={w} />
              ))}
            </div>
            <TextBone className="text-body leading-5" w="w-40" />
          </div>
        </SkeletonPanel>
      </div>
      {/* The week */}
      <SkeletonPanel className="min-h-[520px]">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b px-5">
          <TextBone className="text-title font-semibold" w="w-48" />
          <TextBone className="text-body" w="w-56" />
          <span className="flex-1" />
          <SkeletonPill className="w-44" />
        </div>
        <div className="flex flex-1 flex-col">
          {[2, 1, 2, 1, 2].map((rows, d) => (
            <div key={d} className="flex flex-1 flex-col border-b pb-2 last:border-b-0">
              <div className="px-5 pt-2.5 pb-1">
                <TextBone className="font-mono text-body font-semibold" w="w-20" />
              </div>
              {range(rows).map((i) => (
                <div key={i} className="grid h-9 grid-cols-[52px_110px_minmax(0,1fr)_220px_180px] items-center gap-3 px-5">
                  <Bone className="h-3 w-10 rounded-[4px]" />
                  <Bone className="h-3 w-20 rounded-[4px]" />
                  <Bone className="h-3 w-2/5 rounded-[4px]" />
                  <Bone className="h-3 w-32 rounded-[4px]" />
                  <Bone className="h-3 w-20 rounded-[4px]" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </SkeletonPanel>
    </SkeletonPage>
  );
}

/** One earnings report (`earnings/[id]/page.tsx`): the title block, the prep-pack strip, expectations beside results. */
export function EarningsReportSkeleton() {
  const header = (
    <div className="flex min-h-11 shrink-0 items-center gap-2 border-b px-4 py-1.5">
      <TextBone className="text-emph font-semibold" w="w-64" />
      <span className="flex-1" />
      <Bone className="h-[22px] w-20 rounded-full" />
    </div>
  );
  return (
    <SkeletonPage className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <TextBone className="font-mono text-display leading-none" w="w-20" />
          <TextBone className="text-emph" w="w-40" />
          <TextBone className="font-mono text-body" w="w-36" />
          <Bone className="h-[22px] w-20 rounded-full" />
        </div>
        <TextBone className="text-body" w="w-80" />
      </div>
      <SkeletonPanel className="flex-row items-center gap-3 px-4 py-3">
        <TextBone className="flex-1 text-body" w="w-96" />
      </SkeletonPanel>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2">
        <SkeletonPanel>
          {header}
          <div className="grid gap-3 p-4">
            {range(3).map((i) => (
              <div key={i} className="grid gap-1.5">
                <TextBone className="text-body" w="w-40" />
                <Bone className="h-[76px] w-full rounded-lg" />
              </div>
            ))}
          </div>
        </SkeletonPanel>
        <SkeletonPanel>
          {header}
          <div className="p-4">
            <TextBone className="text-body" w="w-3/4" />
          </div>
        </SkeletonPanel>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Research */

/** A 13px section heading over a hairline (Recent chats, Holding boards, the board's side column). */
function SectionHead({ w = "w-28", aside }: { w?: string; aside?: string }) {
  return (
    <div className="flex items-baseline gap-2.5 border-b pb-1.5">
      <TextBone className="flex-1 text-body font-bold" w={w} />
      {aside && <Bone className={cn("h-3 rounded-[4px]", aside)} />}
    </div>
  );
}

/**
 * A holding's research board (`agent/h/[ticker]`, agent/holding-board.tsx): the header (breadcrumb, no tabs), then
 * this holding's chats (240px), the conversation with its box pinned at the bottom, and the side column (300px). The
 * page is exactly the window tall; the columns scroll inside it.
 */
export function ResearchBoardSkeleton() {
  return (
    <SkeletonPage fullBleed className="flex h-dvh min-h-0 flex-col">
      <SkeletonPageHead />
      <div className="flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 overflow-hidden border-r pt-[18px] pr-4 pl-10">
          <TextBone className="pb-1 text-caption font-semibold" w="w-24" />
          {range(4).map((i) => (
            <div key={i} className="flex flex-col border-b border-row py-2">
              <TextBone className="text-body" w={i % 2 ? "w-32" : "w-40"} />
              <TextBone className="text-caption" w="w-24" />
            </div>
          ))}
        </aside>
        <section className="relative flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden px-8 pt-[22px]">
            <div className="flex max-w-[720px] flex-col gap-4">
              <div className="flex justify-end">
                <Bone className="h-10 w-[min(360px,70%)] rounded-xl" />
              </div>
              <TextBone className="text-caption" w="w-40" />
              <div>
                {["w-full", "w-full", "w-11/12", "w-full", "w-2/3"].map((w, i) => (
                  <TextBone key={i} className="hoot-prose" w={w} />
                ))}
              </div>
            </div>
          </div>
          <div className="absolute inset-x-8 bottom-5 flex h-11 items-center gap-2 rounded-[10px] border border-border-strong py-1.5 pr-1.5 pl-3">
            <span className="flex-1" />
            <Bone className="size-[30px] rounded-[7px]" />
          </div>
        </section>
        <aside className="flex w-[300px] shrink-0 flex-col gap-[22px] overflow-hidden border-l pt-[18px] pr-10 pl-6">
          {[5, 3, 1].map((rows, s) => (
            <section key={s}>
              <TextBone className="text-body font-bold" w="w-40" />
              {range(rows).map((i) => (
                <div key={i} className="border-b border-row py-[7px]">
                  <TextBone className="text-caption leading-[17px]" w="w-full" />
                </div>
              ))}
            </section>
          ))}
        </aside>
      </div>
    </SkeletonPage>
  );
}

/**
 * A Hoot thread (`hoot/[chatId]`, chat/chat-panel.tsx ChatWorkspace): the header (breadcrumb, no tabs), the question, what
 * Hoot did, the source cards and the answer in a 760px column, and the follow-up box fixed at the bottom over a fade.
 */
export function ThreadSkeleton() {
  return (
    <SkeletonPage fullBleed className="flex h-dvh min-h-0 flex-col">
      <SkeletonPageHead />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex w-full max-w-[840px] flex-col px-10 pt-[30px]">
          <div className="flex justify-end">
            <Bone className="h-11 w-[min(420px,70%)] rounded-xl" />
          </div>
          <div className="mt-6 flex items-center gap-2">
            <Bone className="size-[26px] rounded-full" />
            <TextBone className="text-body" w="w-56" />
          </div>
          <div className="mt-3.5 grid grid-cols-4 gap-2">
            {range(4).map((i) => (
              <Bone key={i} className="h-[82px] rounded-lg" />
            ))}
          </div>
          <div className="mt-[22px]">
            {["w-full", "w-full", "w-11/12", "w-full", "w-full", "w-3/5"].map((w, i) => (
              <TextBone key={i} className="hoot-prose leading-[29px]" w={w} />
            ))}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-linear-to-b from-transparent to-background to-35% px-10 pt-6 pb-4">
          <div className="flex h-[52px] w-[760px] max-w-full items-center gap-2 rounded-xl border border-border-strong py-2 pr-2 pl-4">
            <span className="flex-1" />
            <Bone className="size-[34px] rounded-lg" />
          </div>
          <TextBone className="mt-1.5 text-caption" w="w-80" />
        </div>
      </div>
    </SkeletonPage>
  );
}

/**
 * Research (`agent/page.tsx`): the header with its two tabs, then Hoot's face, the serif heading, the question box and
 * three starter chips in a 760px column, and Recent chats beside the holding boards.
 */
export function ResearchHomeSkeleton() {
  return (
    <>
      <SkeletonPageHead tabs={2} />
      <SkeletonPage>
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center pt-3">
        <Bone className="size-11 rounded-full" />
        <TextBone className="mt-3 text-hero" w="w-[28rem]" />
        <TextBone className="mt-2 text-emph" w="w-[40rem]" />
        <div className="mt-6 flex w-full flex-col rounded-xl border border-border-strong px-4 pt-4 pb-3">
          <div className="h-[52px]" />
          <div className="mt-2.5 flex items-center gap-2">
            <Bone className="h-[30px] w-28 rounded-md" />
            <Bone className="h-[30px] w-36 rounded-md" />
            <span className="flex-1" />
            <Bone className="size-[34px] rounded-lg" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {["w-72", "w-72", "w-52"].map((w, i) => (
            <Bone key={i} className={cn("h-[30px] rounded-md", w)} />
          ))}
        </div>
      </div>
      <div className="mx-auto mt-12 grid w-full max-w-[1048px] grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-start gap-12">
        <section>
          <SectionHead w="w-24" aside="w-32" />
          {range(6).map((i) => (
            <div key={i} className="flex flex-col gap-0.5 border-b border-row py-[9px]">
              <TextBone className="text-body font-medium" w={i % 2 ? "w-64" : "w-72"} />
              <TextBone className="text-caption" w="w-40" />
            </div>
          ))}
        </section>
        <section>
          <SectionHead w="w-56" aside="w-10" />
          {range(6).map((i) => (
            <div key={i} className="grid min-h-12 grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 border-b border-row py-1.5">
              <Bone className="h-3 w-10 rounded-[4px]" />
              <div>
                <TextBone className="text-body" w="w-32" />
                <TextBone className="text-caption" w="w-48" />
              </div>
              <Bone className="h-3 w-24 rounded-[4px]" />
            </div>
          ))}
        </section>
      </div>
      </SkeletonPage>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------ Sell-side */

/**
 * Sell-side calls (sell-side/sell-side-layout.tsx and call-workspace.tsx): the page header with Research's two tabs, the
 * saved calls on the left, the call's title and brief in the middle and its timeline on the right.
 */
export function SellSideSkeleton() {
  return (
    <SkeletonPage fullBleed className="flex h-dvh min-h-0 flex-col">
      <SkeletonPageHead tabs={2} />
      <div className="flex min-h-0 flex-1">
        <aside className="w-[260px] shrink-0 overflow-hidden border-r pt-[18px] pr-4 pl-10">
          <TextBone className="pb-1 text-caption font-semibold" w="w-28" />
          {range(8).map((i) => (
            <div key={i} className="flex flex-col border-b border-row py-[9px]">
              <TextBone className="text-body" w="w-40" />
              <TextBone className="text-caption" w="w-32" />
            </div>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pt-6">
          <TextBone className="text-body" w="w-80 max-w-full" />
          <TextBone className="mt-0.5 text-display font-bold" w="w-96 max-w-full" />
          <SkeletonTabs className="mt-4" widths={["w-16", "w-16", "w-28"]} />
          <TextBone className="mt-5 text-body font-bold" w="w-24" />
          {range(3).map((i) => (
            <div key={i} className="border-b border-row py-[7px]">
              <TextBone className="text-body leading-5" w="w-full" />
            </div>
          ))}
          <TextBone className="mt-[22px] text-body font-bold" w="w-80" />
          <div className="mt-1.5 h-[30px] border-b" />
          {range(3).map((i) => (
            <div key={i} className="min-h-10 border-b border-row py-2">
              <TextBone className="text-body leading-5" w="w-2/3" />
            </div>
          ))}
        </div>
        <aside className="w-[280px] shrink-0 overflow-hidden border-l pt-6 pr-10 pl-6">
          <TextBone className="mb-1.5 text-body font-bold" w="w-16" />
          {range(5).map((i) => (
            <div key={i} className="grid grid-cols-[44px_minmax(0,1fr)] gap-2 border-b border-row py-2">
              <TextBone className="text-caption" w="w-9" />
              <TextBone className="text-caption" w="w-full" />
            </div>
          ))}
        </aside>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Models */

/** models/models-view.tsx GRID. */
const MODELS_GRID = "grid grid-cols-[minmax(0,1fr)_104px_100px_100px_minmax(0,1.4fr)_176px] items-center gap-x-3";

/**
 * Models (models/models-view.tsx): the page header with the model's three tabs, the model list, then the big number
 * and the selected model's proposed values.
 */
export function ModelsSkeleton() {
  return (
    <SkeletonPage fullBleed className="flex h-dvh min-h-0 flex-col">
      <SkeletonPageHead tabs={3} />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col overflow-hidden border-r pt-3.5 pr-4 pl-10">
          <Bone className="mb-1.5 h-7 w-24 self-start rounded-lg" />
          {range(8).map((i) => (
            <div key={i} className="flex flex-col border-b border-row py-[9px]">
              <TextBone className="text-body" w="w-32" />
              <TextBone className="text-caption" w="w-36" />
            </div>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden pt-6 pr-10 pl-8">
          <div className="flex items-end gap-4">
            <div className="flex min-w-0 flex-1 flex-col">
              <TextBone className="text-body" w="w-96 max-w-full" />
              <TextBone className="hero-figure" w="w-96 max-w-full" />
              <TextBone className="text-emph" w="w-80 max-w-full" />
            </div>
            <TextBone className="pb-1 text-caption" w="w-64" />
          </div>
          <div className="mt-[22px]">
            <div className={cn(MODELS_GRID, "h-8 border-b")}>
              <Bone className="h-2.5 w-24 rounded-[4px]" />
            </div>
            {range(4).map((i) => (
              <div key={i} className={cn(MODELS_GRID, "min-h-12 border-b border-row py-1.5")}>
                <span className="flex flex-col">
                  <TextBone className="text-body font-semibold" w="w-28" />
                  <TextBone className="text-caption" w="w-20" />
                </span>
                <Bone className="h-3 w-16 rounded-[4px]" />
                <Bone className="h-3 w-14 justify-self-end rounded-[4px]" />
                <Bone className="h-3 w-16 justify-self-end rounded-[4px]" />
                <span className="flex flex-col">
                  <TextBone className="text-caption" w="w-40" />
                  <TextBone className="text-caption" w="w-28" />
                </span>
                <Bone className="h-7 w-32 justify-self-end rounded-lg" />
              </div>
            ))}
          </div>
          <div className="mt-[22px] flex items-center gap-2">
            <Bone className="h-[30px] w-32 rounded-lg" />
            <Bone className="h-[30px] w-24 rounded-lg" />
            <span className="flex-1" />
            <Bone className="h-[30px] w-64 rounded-lg" />
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Portfolio analytics */

/** The Portfolio analytics pages' opening block (portfolio/hero.tsx): the label, the 44px figure, the line under it, and a note at the right. */
function AnalyticsHero({ note = true }: { note?: boolean }) {
  return (
    <div className="flex items-end gap-10">
      <div className="flex min-w-0 flex-1 flex-col">
        <TextBone className="text-body" w="w-72" />
        <div className="hero-figure flex items-center">
          <Bone className="h-9 w-52 rounded-[6px]" />
        </div>
        <TextBone className="text-emph" w="w-[520px] max-w-full" />
      </div>
      {note && (
        <div className="mb-1 flex w-[360px] shrink-0 flex-col gap-1.5">
          <TextBone className="text-body" w="w-full" />
          <TextBone className="text-body" w="w-2/3" />
        </div>
      )}
    </div>
  );
}

/** A section's heading (17px bold) and its grey line under it, as portfolio/parts.tsx SectionHead. */
function AnalyticsSectionHead({ w = "w-40", sub = "w-80" }: { w?: string; sub?: string | false }) {
  return (
    <div>
      <TextBone className="text-title font-bold" w={w} />
      {sub && <TextBone className="mt-1 text-caption" w={sub} />}
    </div>
  );
}

/** A div-grid table: a 34px header row and 36-40px rows on row dividers. */
function AnalyticsTable({ rows, cols, cells, rowHeight = "min-h-9" }: { rows: number; cols: string; cells: string[]; rowHeight?: string }) {
  return (
    <div className="mt-2">
      <div className={cn(cols, "min-h-[34px] items-center gap-x-3 border-b")}>
        {cells.map((_, i) => (
          <Bone key={i} className={cn("h-2.5 w-12 rounded-[4px]", i > 0 && "justify-self-end")} />
        ))}
      </div>
      {range(rows).map((i) => (
        <div key={i} className={cn(cols, rowHeight, "items-center gap-x-3 border-b border-row")}>
          {cells.map((w, j) => (
            <Bone key={j} className={cn("h-3 rounded-[4px]", w, j > 0 && "justify-self-end")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The chart, and the range buttons under it on a hairline. */
function AnalyticsChart({ buttons = 9, height = "h-[200px]" }: { buttons?: number; height?: string }) {
  return (
    <>
      <SkeletonChart className={cn("mt-[22px]", height)} />
      <div className="mt-3.5 flex items-center gap-1 border-b pb-3.5">
        {range(buttons).map((i) => (
          <Bone key={i} className="h-7 w-14 rounded-lg" />
        ))}
        <span className="flex-1" />
        <TextBone className="text-caption" w="w-40" />
      </div>
    </>
  );
}

/**
 * Performance, fund and team (attribution/attribution-views.tsx): the gap to the benchmark and what it is made of, the
 * chart with the period buttons under it, the effects that add up to the gap, the sector table beside contribution by
 * team, holdings by contribution and the footnote. `tabs` is the number of tabs the header shows (six for the fund,
 * four for a team).
 */
export function AttributionSkeleton({ tabs = 6 }: { tabs?: number }) {
  return (
    <>
      <SkeletonPageHead tabs={tabs} />
      <SkeletonPage className="flex flex-col">
        <AnalyticsHero />
        <AnalyticsChart />
        <SkeletonStatStrip cells={3} className="border-t-0" />
        <div className="mt-[26px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14">
          <section>
            <AnalyticsSectionHead w="w-24" sub={false} />
            <AnalyticsTable rows={12} cols="grid grid-cols-[minmax(0,1fr)_54px_58px_62px_62px_58px_58px_62px] xl:grid-cols-[minmax(0,1fr)_60px_64px_64px_68px_64px_64px_64px]" cells={["w-36", "w-10", "w-10", "w-12", "w-12", "w-9", "w-9", "w-10"]} />
          </section>
          <section>
            <AnalyticsSectionHead w="w-24" sub="w-full" />
            <AnalyticsTable rows={7} cols="grid grid-cols-[minmax(0,1fr)_90px_56px]" cells={["w-32", "w-16", "w-10"]} rowHeight="min-h-11" />
          </section>
        </div>
        <section className="mt-8">
          <AnalyticsSectionHead w="w-52" sub="w-64" />
          <div className="mt-2 grid grid-cols-2 gap-x-14">
            {range(2).map((c) => (
              <div key={c}>
                <div className="flex min-h-8 items-center border-b">
                  <Bone className="h-2.5 w-28 rounded-[4px]" />
                </div>
                <SkeletonRows count={5} row="grid min-h-11 grid-cols-[3.5rem_1fr_3.5rem] gap-2.5 px-0" cells={["w-11", "h-1.5 w-full rounded-[2px]", "w-8 justify-self-end"]} />
              </div>
            ))}
          </div>
        </section>
        <div className="mt-[22px] max-w-[760px]">
          <TextBone className="text-caption" w="w-full" />
          <TextBone className="text-caption" w="w-2/3" />
        </div>
      </SkeletonPage>
    </>
  );
}

/**
 * Portfolio · Activity (`attribution/ledger/page.tsx`, portfolio/activity-view.tsx): the header with the portfolio's tabs,
 * the History row with its filters and buttons, the totals line, then the entries by day. Tickets to review, when
 * there are any, push it down.
 */
export function LedgerSkeleton() {
  return (
    <>
      <SkeletonPageHead tabs={6} />
      <SkeletonPage className="flex max-w-[1000px] flex-col">
        <div className="mt-[34px] flex flex-wrap items-center gap-1">
          <TextBone className="mr-3 text-title font-bold" w="w-20" />
          <Bone className="h-7 w-10 rounded-lg" />
          <Bone className="h-7 w-16 rounded-lg" />
          <Bone className="h-7 w-12 rounded-lg" />
          <Bone className="h-7 w-20 rounded-lg" />
          <span className="flex-1" />
          <div className="flex items-center gap-2">
            <Bone className="h-7 w-24 rounded-lg" />
            <Bone className="h-7 w-36 rounded-lg" />
            <Bone className="h-7 w-24 rounded-lg" />
          </div>
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
      </SkeletonPage>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------ Risk and exposure */

/** Risk (risk/risk-view.tsx): volatility and what it is made of, the drawdown, the window buttons, four numbers, where the risk comes from beside its split by team, and the stress tests. */
export function RiskSkeleton({ tabs = 6 }: { tabs?: number }) {
  return (
    <>
      <SkeletonPageHead tabs={tabs} />
      <SkeletonPage className="flex flex-col">
        <AnalyticsHero />
        <TextBone className="mt-[22px] text-caption" w="w-48" />
        <SkeletonChart className="mt-1.5 h-[150px]" />
        <div className="mt-3.5 flex items-center gap-1 border-b pb-3.5">
          {range(3).map((i) => (
            <Bone key={i} className="h-7 w-12 rounded-lg" />
          ))}
          <span className="flex-1" />
          <TextBone className="text-caption" w="w-80" />
        </div>
        <SkeletonStatStrip cells={4} className="border-t-0" />
        <div className="mt-[26px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14">
          <section>
            <AnalyticsSectionHead w="w-56" sub="w-full" />
            <AnalyticsTable rows={10} cols="grid grid-cols-[minmax(0,1fr)_64px_84px_112px_minmax(0,120px)] xl:grid-cols-[minmax(0,1fr)_70px_96px_140px_150px]" cells={["w-28", "w-10", "w-10", "h-1 w-full", "w-16"]} />
          </section>
          <section>
            <AnalyticsSectionHead w="w-20" sub="w-44" />
            <AnalyticsTable rows={6} cols="grid grid-cols-[minmax(0,1fr)_90px_44px]" cells={["w-32", "h-1.5 w-full", "w-8"]} />
          </section>
        </div>
        <StressPanelFallback className="mt-[34px]" />
      </SkeletonPage>
    </>
  );
}

/** Exposure (exposure/exposure-view.tsx): active share and the sectors behind it with the look-through switch, sector weights beside factor tilts and concentration, then the largest positions. */
export function ExposureSkeleton({ tabs = 6 }: { tabs?: number }) {
  return (
    <>
      <SkeletonPageHead tabs={tabs} />
      <SkeletonPage className="flex flex-col">
        <div className="flex items-end gap-10">
          <div className="flex min-w-0 flex-1 flex-col">
            <TextBone className="text-body" w="w-96 max-w-full" />
            <div className="hero-figure flex items-center">
              <Bone className="h-9 w-44 rounded-[6px]" />
            </div>
            <TextBone className="text-emph" w="w-[560px] max-w-full" />
          </div>
          <Bone className="mb-1 h-9 w-56 shrink-0 rounded-lg" />
        </div>
        <div className="mt-[30px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14 border-t pt-[22px]">
          <section>
            <AnalyticsSectionHead w="w-72" sub="w-80" />
            <AnalyticsTable rows={11} cols="grid grid-cols-[minmax(0,1fr)_56px_72px_minmax(90px,1.1fr)_76px] xl:grid-cols-[minmax(0,1fr)_64px_84px_minmax(120px,200px)_84px]" cells={["w-40", "w-10", "w-10", "h-2.5 w-full", "w-14"]} rowHeight="min-h-[38px]" />
          </section>
          <div className="flex flex-col gap-[30px]">
            <section>
              <AnalyticsSectionHead w="w-24" sub="w-full" />
              <SkeletonRows className="mt-2" count={7} row="grid min-h-[34px] grid-cols-[80px_minmax(0,1fr)_48px] gap-x-2.5 px-0" cells={["w-16", "h-2 w-full", "w-8 justify-self-end"]} />
            </section>
            <section>
              <AnalyticsSectionHead w="w-28" sub={false} />
              <SkeletonRows className="mt-2" count={3} row="flex min-h-9 justify-between px-0" cells={["w-32", "w-16"]} />
            </section>
          </div>
        </div>
        <section className="mt-[34px]">
          <AnalyticsSectionHead w="w-72" sub="w-96" />
          <div className="mt-2 grid grid-cols-2 gap-x-14">
            {range(2).map((c) => (
              <SkeletonRows key={c} count={6} row="grid min-h-10 grid-cols-[70px_minmax(0,1fr)_80px] gap-3 px-0" cells={["w-11", "w-3/4", "w-12 justify-self-end"]} />
            ))}
          </div>
        </section>
      </SkeletonPage>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------ Backtesting */

/** backtesting/redesign/backtesting-redesign.tsx: the result in one number, the settings row, the replay, then the weight changes beside the saved scenarios. */
export function BacktestingSkeleton({ tabs = 6 }: { tabs?: number }) {
  return (
    <>
      <SkeletonPageHead tabs={tabs} />
      <SkeletonPage className="flex flex-col">
        <AnalyticsHero note={false} />
        <div className="mt-[18px] flex items-center gap-2">
          {["w-44", "w-72", "w-40", "w-60"].map((w, i) => (
            <Bone key={i} className={cn("h-[30px] rounded-md", w)} />
          ))}
          <span className="flex-1" />
          <Bone className="h-[30px] w-20 rounded-md" />
          <Bone className="h-[30px] w-28 rounded-md" />
          <Bone className="h-[30px] w-24 rounded-md" />
        </div>
        {/* A plain open replays today's weights as the page loads, so the chart is there from the start. */}
        <SkeletonChart className="mt-[18px] h-[220px]" />
        <div className="mt-2.5 flex items-center gap-4 border-b pb-3.5">
          <TextBone className="text-caption" w="w-24" />
          <TextBone className="text-caption" w="w-28" />
          <TextBone className="text-caption" w="w-16" />
          <span className="flex-1" />
          <TextBone className="text-caption" w="w-52" />
        </div>
        <div className="mt-[26px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14">
          <section>
            <AnalyticsSectionHead w="w-40" sub={false} />
            <AnalyticsTable rows={4} cols="grid grid-cols-[minmax(0,1fr)_70px_80px_90px_120px_30px]" cells={["w-32", "w-10", "w-14", "w-12", "w-12", "w-4"]} rowHeight="min-h-11" />
          </section>
          <section>
            <AnalyticsSectionHead w="w-40" sub={false} />
            <SkeletonRows className="mt-1" count={3} row="flex min-h-[52px] flex-col items-start justify-center gap-1.5 px-0" cells={["w-44", "w-28"]} />
          </section>
        </div>
        <section className="mt-[30px]">
          <AnalyticsSectionHead w="w-32" sub={false} />
          <AnalyticsTable rows={5} cols="grid grid-cols-[minmax(0,1fr)_140px_120px_160px_120px]" cells={["w-32", "w-12", "w-12", "w-24", "w-12"]} rowHeight="min-h-10" />
        </section>
      </SkeletonPage>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------ Weekly */

/** The weekly update (weekly/weekly-view.tsx, Summary tab): the packs, then the pack's head, strip, tabs and four panels. */
export function WeeklySkeleton() {
  return (
    <SkeletonPage className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* The packs: a plain, sticky list with no dividers. */}
      <SkeletonPanel variant="plain" className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-104px)]">
        <SkeletonPanelHeader className="px-3.5" w="w-12" aside="w-28" />
        <div className="min-h-0 flex-1 overflow-hidden">
          {range(3).map((i) => (
            <div key={i} className="flex items-center gap-2 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <TextBone className="text-body font-medium" w="w-36" />
                <TextBone className="mt-px text-caption" w="w-24" />
              </div>
              <Bone className="h-[22px] w-12 rounded-full" />
            </div>
          ))}
        </div>
      </SkeletonPanel>
      <div className="flex min-h-0 min-w-0 flex-col gap-5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <TextBone className="text-title font-semibold" w="w-80 max-w-full" />
              <TextBone className="mt-0.5 text-body" w="w-64" />
              {/* Beside the actions the built-and-sent line wraps once in a narrow window. */}
              <TextBone className="text-body xl:hidden" w="w-12" />
            </div>
            <SkeletonPill className="h-[34px] w-24" />
            <SkeletonPill className="h-[34px] w-32" />
            <SkeletonPill className="size-9" />
          </div>
          <SkeletonStatStrip cells={4} notes={false} />
          <SkeletonTabs className="-mt-1" widths={["w-16", "w-16", "w-14", "w-16", "w-14"]} />
          {/* Summary: four plain sections of 40px rows, no dividers, each as tall as its rows. */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {[3, 3, 5, 5].map((rows, p) => (
              <SkeletonPanel key={p} variant="plain">
                <SkeletonPanelHeader w="w-36" aside="w-16" />
                <div className="flex flex-col">
                  {range(rows).map((i) => (
                    <div key={i} className="flex min-h-10 items-center gap-2.5 px-4">
                      <Bone className="h-3 w-16 rounded-[4px]" />
                      <Bone className="h-3 w-2/5 rounded-[4px]" />
                      <span className="flex-1" />
                      <Bone className="h-3 w-12 rounded-[4px]" />
                    </div>
                  ))}
                </div>
              </SkeletonPanel>
            ))}
          </div>
          {/* Why they moved: Hoot's one line per mover. */}
          <SkeletonPanel variant="plain">
            <SkeletonPanelHeader w="w-28" aside="w-48" />
            <div className="flex flex-col">
              {range(4).map((i) => (
                <div key={i} className="flex h-[37px] items-center gap-4 px-4 text-body">
                  <TextBone className="w-14 shrink-0" w="w-11" />
                  <TextBone className="min-w-0 flex-1" w="w-3/5" />
                </div>
              ))}
            </div>
          </SkeletonPanel>
        </div>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Changelog */

/** The changelog (changelog/changelog-view.tsx): every merged change, beside this month's counts and how it's written. */
export function ChangelogSkeleton() {
  return (
    <SkeletonPage className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <SkeletonPanel>
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b px-5">
          <TextBone className="flex-1 text-emph font-semibold" w="w-80 max-w-full" />
          <TextBone className="text-body" w="w-32" />
          <SkeletonPill className="h-[30px] w-24" />
        </div>
        <div className="flex flex-1 flex-col">
          {range(8).map((i) => (
            <div key={i} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-start gap-4 border-b border-row px-5 py-3.5 last:border-b-0">
              <div className="min-w-0">
                <TextBone className="font-mono text-body" w="w-12" />
                <TextBone className="mt-0.5 text-caption" w="w-16" />
              </div>
              <div className="min-w-0">
                <TextBone className="text-emph font-semibold" w="w-72 max-w-full" />
                <TextBone className="mt-0.5 text-body leading-[1.45]" w="w-full" />
                <TextBone className="text-body leading-[1.45]" w="w-full" />
                {i % 2 === 0 && <TextBone className="text-body leading-[1.45]" w="w-1/2" />}
              </div>
              <Bone className="h-3 w-10 rounded-[4px]" />
            </div>
          ))}
        </div>
      </SkeletonPanel>
      <div className="flex flex-col gap-5 lg:sticky lg:top-20 lg:h-[calc(100dvh-104px)] lg:self-start">
        <div className="shrink-0 rounded-[14px] bg-rail px-[18px] py-4">
          <div className="label-mono">
            <span className="inline-block h-[0.7em] w-20 rounded-[3px] bg-rail-2 align-middle" />
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-3.5">
            {range(2).map((i) => (
              <div key={i}>
                <div className="figure text-display">
                  <span className="inline-block h-[0.7em] w-10 rounded-[4px] bg-rail-2 align-middle" />
                </div>
                <div className="text-body">
                  <span className="inline-block h-[0.7em] w-24 rounded-[3px] bg-rail-2 align-middle" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <SkeletonPanel className="min-h-0 flex-1 gap-3 px-[18px] py-4">
          <TextBone className="text-emph font-semibold" w="w-44" />
          <div>
            {["w-full", "w-full", "w-11/12", "w-2/3"].map((w, i) => (
              <TextBone key={i} className="text-body leading-[1.55]" w={w} />
            ))}
          </div>
          <div className="flex flex-col border-t border-row">
            {range(3).map((i) => (
              <div key={i} className="flex h-9 items-center justify-between gap-3 border-b border-row">
                <Bone className="h-3 w-20 rounded-[4px]" />
                <Bone className="h-3 w-24 rounded-[4px]" />
              </div>
            ))}
          </div>
        </SkeletonPanel>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Admin */

/** admin/members-panel.tsx GRID. */
const MEMBERS_GRID = "grid grid-cols-[minmax(0,1fr)_minmax(0,200px)_130px_120px_28px] items-center gap-3";

/**
 * Admin (admin/admin-view.tsx): members beside connections and scheduled jobs, each as tall as its rows. Execs see
 * it view only, under a one-line banner.
 */
export function AdminSkeleton() {
  return (
    <SkeletonPage className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="hidden in-data-[role=exec]:flex">
        <Bone className="h-[35.5px] w-full rounded-[10px]" />
      </div>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        {/* Members: a 44px row per member, as tall as the list. */}
        <SkeletonPanel>
          <div className="flex h-12 shrink-0 items-center gap-2.5 border-b px-4">
            <TextBone className="text-emph font-semibold" w="w-20" />
            <span className="flex-1" />
            <SkeletonPill className="w-[220px]" />
          </div>
          <div className={cn(MEMBERS_GRID, "h-[34px] shrink-0 border-b px-4")}>
            <Bone className="h-2.5 w-12 rounded-[4px]" />
          </div>
          <div className="flex flex-col">
            {range(8).map((i) => (
              <div key={i} className={cn(MEMBERS_GRID, "min-h-11 border-b border-row px-4")}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <Bone className="size-[26px] shrink-0 rounded-full" />
                  <Bone className="h-3 w-32 rounded-[4px]" />
                </div>
                <Bone className="h-3 w-24 rounded-[4px]" />
                <Bone className="h-[22px] w-20 rounded-full" />
                <Bone className="h-3 w-16 rounded-[4px]" />
                <span />
              </div>
            ))}
          </div>
        </SkeletonPanel>
        <div className="flex flex-col gap-5">
          {/* Connections: a plain section, no dividers, the services line under it. */}
          <SkeletonPanel variant="plain" className="shrink-0">
            <SkeletonPanelHeader w="w-28" />
            <SkeletonRows count={5} divided={false} row="flex h-[52px] gap-3" cells={["size-2 rounded-full", "w-40", "ml-auto w-16"]} />
            <div className="flex min-h-10 shrink-0 items-center gap-3 px-4 py-2">
              <Bone className="h-3 w-56 rounded-[4px]" />
            </div>
          </SkeletonPanel>
          {/* Scheduled jobs: every job shown, no inner scroll. */}
          <SkeletonPanel>
            <SkeletonPanelHeader w="w-32" aside="w-24" />
            <div className="flex flex-col">
              {range(7).map((i) => (
                <div key={i} className="flex min-h-14 items-center gap-3 border-b border-row px-4 py-2 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <TextBone className="text-body font-semibold" w="w-40" />
                    <TextBone className="text-body" w="w-56 max-w-full" />
                    <TextBone className="text-body" w="w-32" />
                  </div>
                  <Bone className="h-3 w-20 rounded-[4px]" />
                  <Bone className="h-7 w-[74px] rounded-full" />
                </div>
              ))}
            </div>
          </SkeletonPanel>
        </div>
      </div>
    </SkeletonPage>
  );
}

/** The PT sheet read test (admin/pt-sheet-view.tsx): the head, the sheet's details, the first tab's table. */
export function PtSheetSkeleton() {
  return (
    <SkeletonPage className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <TextBone className="text-title font-semibold" w="w-52" />
          <TextBone className="mt-0.5 text-body" w="w-96 max-w-full" />
        </div>
        <SkeletonPill className="h-[34px] w-32" />
        <SkeletonPill className="h-[34px] w-28" />
      </div>
      <SkeletonPanel className="shrink-0">
        <SkeletonPanelHeader w="w-14" aside="w-36" />
        <SkeletonRows count={4} row="flex h-[40.25px] gap-6" cells={["w-20", "w-64"]} />
      </SkeletonPanel>
      <SkeletonPanel className="shrink-0">
        <SkeletonPanelHeader w="w-28" aside="w-28" />
        <TextBone className="border-b border-row px-4 py-2 text-body" w="w-96 max-w-full" />
        {/* The table scrolls inside 480px; a full tab fills it. */}
        <div className="h-[480px] overflow-hidden">
          <div className="flex h-[30px] items-center border-b bg-band px-3">
            <Bone className="h-2.5 w-40 rounded-[4px]" />
          </div>
          <SkeletonRows count={15} row="flex h-[33px] gap-6" cells={["w-6", "w-24", "w-16", "w-20", "w-16"]} />
        </div>
        <div className="flex h-9 items-center border-t bg-band-2 px-4">
          <Bone className="h-3 w-56 rounded-[4px]" />
        </div>
      </SkeletonPanel>
    </SkeletonPage>
  );
}
