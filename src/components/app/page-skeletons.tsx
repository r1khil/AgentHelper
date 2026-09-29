import { LastSessionSkeleton } from "@/app/(app)/_today/last-session";
import { StressPanelFallback } from "@/components/app/risk/stress-panel";
import { cn } from "@/lib/utils";
import { SkeletonPageHead } from "./page-head";
import { Bone, ReplaySkeleton, SkeletonChart, SkeletonPage, SkeletonPanel, SkeletonPanelHeader, SkeletonPill, SkeletonRows, SkeletonStatStrip, SkeletonTabs, TextBone } from "./skeletons";

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

/* ------------------------------------------------------------------------------------------------ Holdings */

/** components/app/holdings/holdings-table.tsx GRID. */
const HOLDINGS_GRID =
  "grid grid-cols-[64px_minmax(0,1fr)_56px_72px_68px_72px_84px_168px] items-center gap-3 px-4 xl:grid-cols-[64px_minmax(0,1fr)_64px_64px_80px_76px_76px_96px_168px]";
/** The third cell is the 5-day sparkline, which only shows from xl. */
const HOLDING_CELLS = ["w-11", "w-3/5", "hidden w-10 justify-self-end xl:block", "w-10 justify-self-end", "w-12 justify-self-end", "w-10 justify-self-end", "w-10 justify-self-end", "w-16", "h-[22px] w-24 rounded-full"];

/** Holdings (`t/[team]/page.tsx`): the filter chips and market line, then the holdings table grouped by team. */
export function HoldingsSkeleton() {
  return (
    <SkeletonPage className="flex flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SkeletonPill className="w-[118px]" />
        <SkeletonPill className="w-[150px]" />
        <SkeletonPill className="w-[178px]" />
        <span className="flex-1" />
        <TextBone className="text-body" w="w-48" />
      </div>
      <section className="panel flex flex-col overflow-hidden">
        <div className="flex min-w-[920px] flex-col">
          <div className={cn(HOLDINGS_GRID, "h-9 shrink-0 border-b")}>
            {HOLDING_CELLS.map((_, i) => (
              <Bone key={i} className={cn("h-2.5 w-10 rounded-[4px]", i > 1 && i < 7 && "justify-self-end", i === 2 && "hidden xl:block")} />
            ))}
          </div>
          {[5, 4].map((rows, g) => (
            <div key={g}>
              <div className="flex h-9 items-center gap-2.5 border-b bg-band px-4">
                <Bone className="h-3 w-28 rounded-[4px]" />
                <Bone className="h-3 w-16 rounded-[4px]" />
              </div>
              {range(rows).map((i) => (
                <div key={i} className={cn(HOLDINGS_GRID, "h-10 border-b border-row")}>
                  {HOLDING_CELLS.map((c, j) => (
                    <Bone key={j} className={cn("h-3 rounded-[4px]", c)} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Holding */

/**
 * A holding's Overview tab (`t/[team]/h/[ticker]/page.tsx`, holdings/holding-header.tsx and tab-panels.tsx): the
 * ticker line and actions, the tabs, then the price chart, thesis and notes beside At a glance and Latest.
 */
export function HoldingSkeleton() {
  return (
    <SkeletonPage className="flex min-h-0 flex-1 flex-col gap-4 md:-mt-1">
      <div className="flex shrink-0 flex-wrap items-end gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <TextBone className="font-mono text-display leading-tight" w="w-20" />
            {/* Company · team, then the price, the day's move and the move against the S&P 500. */}
            <TextBone className="text-emph" w="w-80" />
            <TextBone className="ml-2 font-mono text-title" w="w-16" />
            <TextBone className="text-body" w="w-14" />
            <TextBone className="text-body" w="w-36" />
          </div>
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <SkeletonPill className="h-[34px] w-[150px]" />
          <SkeletonPill className="h-[34px] w-[150px]" />
          <SkeletonPill className="size-9" />
        </div>
      </div>
      <SkeletonTabs widths={["w-16", "w-16", "w-36", "w-16", "w-12"]} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-h-0 min-w-0 flex-col gap-5">
          {/* Price chart */}
          <section className="panel min-w-0 shrink-0 px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
              <TextBone className="text-emph font-semibold" w="w-32" />
              <TextBone className="text-body" w="w-24" />
              <TextBone className="text-body" w="w-24" />
              <span className="flex-1" />
              <TextBone className="text-body" w="w-20" />
              <SkeletonPill className="w-52" />
            </div>
            <SkeletonChart className="mt-2.5 h-[200px]" />
          </section>
          {/* Thesis: a plain section */}
          <section className="panel-plain shrink-0 px-4 py-2">
            <TextBone className="text-emph font-semibold" w="w-16" />
            <div className="mt-2">
              {["w-full", "w-full", "w-11/12", "w-2/3"].map((w, i) => (
                <TextBone key={i} className="text-emph leading-[1.55]" w={w} />
              ))}
            </div>
          </section>
          {/* Team notes: a plain section, no dividers */}
          <SkeletonPanel variant="plain">
            <SkeletonPanelHeader w="w-24" aside="w-48" />
            {range(3).map((i) => (
              <div key={i} className="flex gap-3 px-4 py-2.5">
                <Bone className="size-[26px] shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <TextBone className="text-body" w="w-40" />
                  <TextBone className="mt-0.5 text-body" w="w-4/5" />
                </div>
              </div>
            ))}
          </SkeletonPanel>
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-5">
          {/* At a glance */}
          <SkeletonPanel className="shrink-0">
            <SkeletonRows count={5} row="flex h-[42px] gap-2.5" cells={["w-20", "ml-[28px] w-32"]} />
          </SkeletonPanel>
          {/* Latest: a plain section of 48px rows, no dividers */}
          <SkeletonPanel variant="plain">
            <SkeletonPanelHeader w="w-14" aside="w-36" />
            <div className="flex flex-col">
              {range(7).map((i) => (
                <div key={i} className="flex min-h-[48px] items-center gap-2.5 px-4 py-1.5">
                  <Bone className="h-5 w-[50px] shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <TextBone className="text-body leading-snug" w="w-4/5" />
                    <TextBone className="mt-px text-caption" w="w-24" />
                  </div>
                </div>
              ))}
            </div>
          </SkeletonPanel>
        </div>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Movements */

/**
 * Movements (movements/movements-view.tsx and workspace.tsx), with a movement selected as it nearly always is: the
 * list on the left from xl (a "Movements" button in the title row below it), the title and meta strip, then the
 * write-up as the main column beside the evidence Hoot gathered, one window tall.
 */
export function MovementsSkeleton() {
  return (
    <SkeletonPage className="grid min-h-0 flex-1 gap-5 lg:h-[calc(100dvh-6.5rem)] lg:flex-none lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
      <SkeletonPanel className="hidden xl:flex">
        <div className="shrink-0 border-b px-4 py-3.5">
          <div className="flex items-baseline gap-2">
            <TextBone className="text-emph font-semibold" w="w-24" />
            <span className="flex-1" />
            <TextBone className="font-mono text-caption" w="w-28" />
          </div>
          {["w-full", "w-full", "w-1/2"].map((w, i) => (
            <TextBone key={i} className={cn("text-body leading-[1.45]", i === 0 && "mt-0.5")} w={w} />
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {range(10).map((i) => (
            <div key={i} className="border-b border-row px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Bone className="h-3 w-11 shrink-0 rounded-[4px]" />
                <Bone className="h-3 w-14 rounded-[4px]" />
                <span className="flex-1" />
                <Bone className="h-[22px] w-20 rounded-full" />
              </div>
              <TextBone className="mt-[3px] text-caption" w="w-44" />
            </div>
          ))}
        </div>
      </SkeletonPanel>
      <div className="flex min-h-0 min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-[22rem] items-center gap-4">
            <SkeletonPill className="h-7 w-[178px] xl:hidden" />
            {/* Pieces that wrap like the real title: ticker, "Friday, September 25 · Company", then the three moves. */}
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <TextBone className="font-mono text-display font-semibold" w="w-20" />
              <span className="flex flex-wrap gap-x-1">
                <TextBone className="text-emph" w="w-40" />
                <TextBone className="text-emph" w="w-32" />
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                {["w-20", "w-28", "w-28"].map((w, i) => (
                  <TextBone key={i} className="text-body" w={w} />
                ))}
              </span>
            </div>
          </div>
          <div className="panel flex shrink-0">
            {["w-40", "w-20", "w-28", "w-16"].map((w, i) => (
              <div key={i} className={cn("px-4 py-2", i > 0 && "shadow-[inset_1px_0_0_var(--border)]")}>
                <TextBone className="text-caption" w="w-10" />
                <TextBone className="text-body font-semibold" w={w} />
              </div>
            ))}
          </div>
        </div>
        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_420px]">
          {/* The team's update */}
          <SkeletonPanel>
            <SkeletonPanelHeader w="w-32" aside="w-24" />
            <div className="min-h-40 flex-1 px-4 py-3">
              {["w-full", "w-full", "w-5/6", "w-full", "w-3/4"].map((w, i) => (
                <TextBone key={i} className="text-emph leading-[1.6]" w={w} />
              ))}
            </div>
            <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-t bg-band-2 px-4 py-2">
              <SkeletonPill className="w-44" />
              <SkeletonPill className="w-24" />
              <SkeletonPill className="w-32" />
              <TextBone className="min-w-0 flex-1 basis-64 text-body" w="w-64" />
            </div>
          </SkeletonPanel>
          {/* Evidence Hoot gathered */}
          <div className="flex min-h-0 min-w-0 flex-col gap-3">
            <SkeletonPanel className="min-h-0 flex-1">
              <SkeletonPanelHeader w="w-44" aside="w-24" />
              <div className="min-h-0 flex-1 overflow-hidden">
                {range(9).map((i) => (
                  <div key={i} className="flex gap-2.5 border-b border-row py-2 pr-2 pl-4">
                    <Bone className="mt-px h-[18px] w-[22px] shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <TextBone className="pr-2 text-body leading-[1.45]" w="w-4/5" />
                      <div className="flex min-h-6 items-center">
                        <Bone className="h-2.5 w-32 rounded-[4px]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-3 border-t bg-band-2 px-4 py-2">
                <TextBone className="min-w-0 flex-1 basis-40 text-body" w="w-48" />
                <SkeletonPill className="h-7 w-32" />
              </div>
            </SkeletonPanel>
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Calendars */

/**
 * The earnings and economic calendars (earnings/calendar-view.tsx, economic-calendar/economic-view.tsx): the header with
 * its two tabs, the hero, the controls under a hairline and a table of 40px rows. Both routes share it.
 */
export function CalendarSkeleton() {
  return (
    <>
      <SkeletonPageHead tabs={2} />
      <SkeletonPage className="flex min-h-0 flex-1 flex-col">
        <TextBone className="text-body" w="w-72" />
        <TextBone className="hero-figure" w="w-64" />
        <TextBone className="text-emph" w="w-2/3" />
        <div className="mt-[18px] flex items-center gap-2 border-b pb-3.5">
          <SkeletonPill className="h-7 w-44" />
          <SkeletonPill className="h-7 w-40" />
          <SkeletonPill className="h-7 w-72" />
        </div>
        <div className="mt-1">
          <div className="grid h-[34px] grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1.1fr)_140px_80px_120px_120px] items-center gap-3 border-b">
            <Bone className="h-2.5 w-10 rounded-[4px]" />
          </div>
          {range(8).map((i) => (
            <div key={i} className="grid h-10 grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1.1fr)_140px_80px_120px_120px] items-center gap-3 border-b border-row">
              <Bone className="h-3 w-20 rounded-[4px]" />
              <Bone className="h-3 w-36 rounded-[4px]" />
              <Bone className="h-3 w-28 rounded-[4px]" />
              <Bone className="h-3 w-24 rounded-[4px]" />
              <Bone className="ml-auto h-3 w-10 rounded-[4px]" />
              <Bone className="h-3 w-16 rounded-[4px]" />
              <Bone className="h-3 w-16 rounded-[4px]" />
            </div>
          ))}
        </div>
      </SkeletonPage>
    </>
  );
}

/** One earnings report (`earnings/[id]/page.tsx`): the hero, the three sections in order, the prep pack and timeline beside them. */
export function EarningsReportSkeleton() {
  return (
    <>
      <SkeletonPageHead />
      <SkeletonPage className="flex gap-14">
        <div className="flex min-w-0 flex-1 flex-col">
          <TextBone className="text-body" w="w-96 max-w-full" />
          <TextBone className="hero-figure" w="w-56" />
          <TextBone className="text-emph" w="w-2/3" />
          {[3, 2, 2].map((rows, s) => (
            <div key={s} className="mt-6 border-t pt-[18px]">
              <TextBone className="text-title font-bold" w="w-80 max-w-full" />
              {range(rows).map((i) => (
                <div key={i} className="mt-3.5">
                  <TextBone className="text-body font-semibold" w="w-28" />
                  <div className="mt-1 border-b border-border-strong py-1.5">
                    <TextBone className="text-emph" w="w-full" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <aside className="flex w-[300px] shrink-0 flex-col">
          <TextBone className="text-body font-bold" w="w-24" />
          <div className="mt-1.5">
            {["w-full", "w-full", "w-2/3"].map((w, i) => (
              <TextBone key={i} className="text-body" w={w} />
            ))}
          </div>
          <TextBone className="mt-7 mb-1 text-body font-bold" w="w-20" />
          {range(5).map((i) => (
            <div key={i} className="grid grid-cols-[56px_minmax(0,1fr)] gap-2.5 border-b border-row py-2">
              <Bone className="h-3 w-10 rounded-[4px]" />
              <Bone className="h-3 w-32 rounded-[4px]" />
            </div>
          ))}
        </aside>
      </SkeletonPage>
    </>
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

/** Sell-side calls (sell-side/sell-side-layout.tsx): record a call and the saved calls, the call's brief. */
export function SellSideSkeleton() {
  return (
    <SkeletonPage className="grid min-h-0 flex-1 gap-6 lg:h-[calc(100dvh-104px)] lg:min-h-[600px] lg:flex-none lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-5">
        <div className="shrink-0 rounded-[14px] bg-rail p-3.5">
          <div className="text-emph">
            <span className="inline-block h-[0.7em] w-28 rounded-[4px] bg-rail-2 align-middle" />
          </div>
          <div className="mt-2.5 flex flex-col gap-2">
            <span className="block h-[34px] rounded-[10px] bg-rail-2" />
            <span className="block h-[34px] rounded-[10px] bg-rail-2" />
            <span className="block h-[34px] rounded-full bg-rail-2" />
          </div>
        </div>
        <SkeletonPanel className="min-h-60 flex-1 lg:min-h-0">
          <SkeletonPanelHeader className="px-3.5" w="w-24" aside="w-16" />
          <div className="min-h-0 flex-1 overflow-hidden">
            {range(8).map((i) => (
              <div key={i} className="border-b border-row px-3.5 py-2.5">
                <div className="flex items-baseline gap-2">
                  <TextBone className="font-mono text-body" w="w-10" />
                  <TextBone className="min-w-0 flex-1 text-body" w="w-40" />
                  <TextBone className="text-body" w="w-12" />
                </div>
                <TextBone className="mt-0.5 text-caption" w="w-44" />
              </div>
            ))}
          </div>
        </SkeletonPanel>
      </div>
      <div className="flex min-h-[560px] min-w-0 flex-col lg:min-h-0">
        <SkeletonPanel className="min-h-0 flex-1">
          <div className="shrink-0 px-5 pt-4">
            <TextBone className="text-title leading-tight font-semibold" w="w-80" />
            <TextBone className="mt-1 text-body" w="w-56" />
            <Bone className="mt-3.5 h-9 w-full rounded-[10px]" />
            <SkeletonTabs className="mt-3.5" widths={["w-12", "w-20", "w-20"]} />
          </div>
          <div className="grid min-h-0 flex-1 lg:grid-cols-2">
            {range(2).map((c) => (
              <div key={c} className={cn("min-w-0 px-5 py-3.5", c === 0 ? "lg:border-r" : "border-t lg:border-t-0")}>
                <TextBone className="text-body font-semibold" w="w-40" />
                <div className="mt-1.5">
                  {range(4).map((i) => (
                    <div key={i} className="border-b border-row py-2.5">
                      <TextBone className="text-body" w="w-full" />
                      <TextBone className="text-body" w="w-2/3" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t bg-band-2 px-5 pt-3 pb-3.5">
            <TextBone className="text-body font-semibold" w="w-52" />
            {["w-44", "w-56", "w-40"].map((w, i) => (
              <Bone key={i} className={cn("h-7 rounded-full", w)} />
            ))}
          </div>
        </SkeletonPanel>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Models */

/** models/models-view.tsx GRID. */
const MODELS_GRID = "grid grid-cols-[minmax(140px,1fr)_minmax(0,1.25fr)_96px_100px_minmax(0,150px)_68px] items-center gap-3";

/** Models (models/models-view.tsx): the model list, then the selected model's proposed values. */
export function ModelsSkeleton() {
  return (
    <SkeletonPage className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <SkeletonPanel className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6.5rem)]">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3.5">
          <TextBone className="text-emph font-semibold" w="w-16" />
          <span className="flex-1" />
          <SkeletonPill className="h-7 w-24" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {range(9).map((i) => (
            <div key={i} className="border-b border-row px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <Bone className="h-3 w-11 shrink-0 rounded-[4px]" />
                <TextBone className="min-w-0 flex-1 text-body" w="w-32" />
              </div>
              <TextBone className="mt-0.5 text-caption" w="w-40" />
            </div>
          ))}
        </div>
      </SkeletonPanel>
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <TextBone className="text-title font-semibold" w="w-72" />
            <TextBone className="mt-0.5 text-body" w="w-96 max-w-full" />
            <TextBone className="mt-0.5 text-body" w="w-64" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonPill className="h-[34px] w-28" />
            <SkeletonPill className="h-[34px] w-36" />
          </div>
        </div>
        <SkeletonTabs className="-mb-1" widths={["w-28", "w-20", "w-20"]} />
        <SkeletonPanel>
          <SkeletonPanelHeader w="w-32" />
          <div className="flex flex-col">
            <div className={cn(MODELS_GRID, "h-[34px] shrink-0 border-b px-4")}>
              <Bone className="h-2.5 w-16 rounded-[4px]" />
            </div>
            {range(6).map((i) => (
              <div key={i} className={cn(MODELS_GRID, "min-h-12 border-b border-row px-4 py-1.5")}>
                <Bone className="h-3 w-32 rounded-[4px]" />
                <Bone className="h-3 w-40 rounded-[4px]" />
                <Bone className="h-3 w-14 rounded-[4px]" />
                <Bone className="h-3 w-16 justify-self-end rounded-[4px]" />
                <Bone className="h-3 w-24 rounded-[4px]" />
                <Bone className="h-7 w-16 justify-self-end rounded-full" />
              </div>
            ))}
          </div>
          <div className="flex min-h-10 shrink-0 items-center gap-3 border-t bg-band-2 px-4 py-2">
            <TextBone className="flex-1 text-body" w="w-48" />
            <SkeletonPill className="h-7 w-32" />
          </div>
        </SkeletonPanel>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Attribution */

const ATTRIBUTION_GRID = "grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]";

/** An attribution table (sectors, teams): a 36px column header, fixed 40px rows, a 40px footer band. */
function AttributionTable({ rows }: { rows: number }) {
  return (
    <SkeletonPanel>
      <div className="flex h-9 shrink-0 items-center border-b px-4">
        <Bone className="h-2.5 w-14 rounded-[4px]" />
      </div>
      {range(rows).map((i) => (
        <div key={i} className="flex h-10 items-center gap-2.5 border-b border-row px-4">
          <Bone className="h-3 w-36 rounded-[4px]" />
          <span className="flex-1" />
          <Bone className="h-3 w-12 rounded-[4px]" />
          <Bone className="h-3 w-14 rounded-[4px]" />
        </div>
      ))}
      <div className="flex min-h-10 shrink-0 items-center bg-band-2 px-4">
        <Bone className="h-3 w-56 rounded-[4px]" />
      </div>
    </SkeletonPanel>
  );
}

/**
 * Fund and team attribution (attribution/attribution-views.tsx): the period toolbar, the headline strip, the
 * cumulative chart beside where it came from, then two columns of tables and sections at their own height.
 */
export function AttributionSkeleton() {
  return (
    <SkeletonPage className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-col gap-4">
        <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2">
          <SkeletonPill className="w-[460px]" />
          <TextBone className="text-body" w="w-72" />
        </div>
        <SkeletonStatStrip cells={4} />
        <div className={cn(ATTRIBUTION_GRID, "lg:min-h-[252px]")}>
          <section className="panel-plain flex min-w-0 flex-col px-4 pt-2 pb-3">
            <div className="flex min-h-7 shrink-0 items-center gap-3.5">
              <TextBone className="text-emph font-semibold" w="w-32" />
              <TextBone className="text-body" w="w-20" />
              <TextBone className="text-body" w="w-24" />
            </div>
            <div className="mt-2.5 flex min-h-0 flex-1 flex-col">
              <SkeletonChart className="h-full min-h-44" />
            </div>
          </section>
          <section className="panel-plain flex min-w-0 flex-col px-4 pt-2 pb-3.5">
            <div className="flex min-h-7 shrink-0 items-center gap-3.5">
              <TextBone className="text-emph font-semibold" w="w-36" />
            </div>
            <div className="mt-3.5 mb-3 flex flex-1 flex-col gap-3.5">
              {range(4).map((i) => (
                <div key={i} className="grid grid-cols-[92px_minmax(0,1fr)_48px] items-center gap-2.5 text-body">
                  <TextBone w="w-20" />
                  <Bone className="h-[18px] rounded-[6px]" />
                  <Bone className="h-3 w-10 justify-self-end rounded-[4px]" />
                </div>
              ))}
            </div>
            <TextBone className="text-body leading-normal" w="w-4/5" />
          </section>
        </div>
        {/* Two columns at their own height: sectors over holdings, teams over the effect chart and the method. */}
        <div className={cn(ATTRIBUTION_GRID, "lg:items-start")}>
          <div className="flex min-w-0 flex-col gap-5">
            <AttributionTable rows={12} />
            <SkeletonPanel>
              <SkeletonPanelHeader w="w-44" aside="w-40" />
              <div className="grid gap-6 px-4 py-3 sm:grid-cols-2">
                {range(2).map((c) => (
                  <div key={c} className="grid content-start">
                    <div className="flex h-8 items-center border-b">
                      <Bone className="h-2.5 w-28 rounded-[4px]" />
                    </div>
                    <SkeletonRows count={5} row="flex min-h-10 gap-3 px-0" cells={["w-11", "h-2 flex-1 rounded-[2px]", "w-8"]} />
                  </div>
                ))}
              </div>
            </SkeletonPanel>
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <AttributionTable rows={6} />
            <SkeletonPanel variant="plain">
              <SkeletonPanelHeader w="w-36" aside="w-32" />
              <div className="grid gap-2 px-4 py-3">
                {range(12).map((i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-2.5 text-body">
                    <TextBone w="w-28" />
                    <Bone className="ml-auto h-2.5 w-1/3 rounded-[2px]" />
                    <Bone className="h-3 w-6 justify-self-end rounded-[4px]" />
                  </div>
                ))}
              </div>
            </SkeletonPanel>
            <SkeletonPanel variant="plain">
              <SkeletonPanelHeader w="w-40" />
              <div className="px-4 py-3">
                {/* Five lines in a wide window, seven in a narrow one. */}
                {["w-full", "w-full", "w-full", "w-full", "w-full", "w-full", "w-2/3"].map((w, i) => (
                  <TextBone key={i} className={cn("text-body leading-relaxed", i >= 4 && i < 6 && "xl:hidden")} w={w} />
                ))}
              </div>
            </SkeletonPanel>
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}

/** The ledger (attribution/ledger-view.tsx, Trades tab): the title line, the strip, the PT sheet check, the tabs, the trades table. */
export function LedgerSkeleton() {
  return (
    <SkeletonPage className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <TextBone className="text-title font-semibold" w="w-16" />
        <TextBone className="text-body" w="w-72" />
      </div>
      <SkeletonStatStrip cells={4} />
      <TextBone className="text-body" w="w-72" />
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <SkeletonTabs widths={["w-12", "w-10", "w-32", "w-16"]} />
        <SkeletonPanel className="flex-1">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
            <TextBone className="text-emph font-semibold" w="w-16" />
            <span className="flex-1" />
            <SkeletonPill className="h-7 w-20" />
            <SkeletonPill className="h-7 w-20" />
            <SkeletonPill className="h-7 w-28" />
          </div>
          <SkeletonRows
            count={11}
            row="grid h-10 grid-cols-[96px_64px_80px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_64px_minmax(0,1.5fr)] gap-3"
            cells={["w-20", "w-12", "w-12", "w-14 justify-self-end", "w-14 justify-self-end", "w-16 justify-self-end", "w-10 justify-self-end", "w-40"]}
          />
        </SkeletonPanel>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Risk and exposure */

/** risk/risk-view.tsx and exposure/exposure-view.tsx FIRST_SCREEN: the panels take their content's height. */
const FIRST_SCREEN = "flex flex-col gap-4";

/** Risk (risk/risk-view.tsx): lookback and context, the five headline numbers, where the risk comes from and the stress tests. */
export function RiskSkeleton() {
  return (
    <SkeletonPage className={FIRST_SCREEN}>
      <div className="flex min-w-0 shrink-0 items-center gap-2.5">
        <SkeletonPill className="w-[132px]" />
        <TextBone className="min-w-0 text-body" w="w-96 max-w-full" />
        <span className="flex-1" />
        <SkeletonPill className="w-[118px]" />
      </div>
      <SkeletonStatStrip cells={5} />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* Where the risk comes from: a plain section, ten 40px rows. */}
        <SkeletonPanel variant="plain">
          <SkeletonPanelHeader w="w-48" aside="w-32" />
          <div className="flex h-8 shrink-0 items-center px-4">
            <Bone className="h-2.5 w-14 rounded-[4px]" />
          </div>
          {range(10).map((i) => (
            <div key={i} className="flex h-10 items-center gap-3 border-t border-row px-4">
              <Bone className="h-3 w-12 rounded-[4px]" />
              <span className="flex-1" />
              <Bone className="h-3 w-10 rounded-[4px]" />
              <Bone className="h-2.5 w-24 rounded-[3px]" />
              <Bone className="h-3 w-12 rounded-[4px]" />
            </div>
          ))}
        </SkeletonPanel>
        <StressPanelFallback />
      </div>
    </SkeletonPage>
  );
}

/** Exposure (exposure/exposure-view.tsx): sector view and lookback, four headline numbers, sectors beside active bets and factor tilts. */
export function ExposureSkeleton() {
  return (
    <SkeletonPage className={FIRST_SCREEN}>
      <div className="flex min-w-0 shrink-0 items-center gap-2.5">
        <SkeletonPill className="w-[236px]" />
        <TextBone className="min-w-0 text-body" w="w-80 max-w-full" />
        <span className="flex-1" />
        <SkeletonPill className="w-[132px]" />
      </div>
      <SkeletonStatStrip cells={4} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <SkeletonPanel>
          <SkeletonPanelHeader w="w-32" aside="w-28" />
          <div className="flex h-[30px] shrink-0 items-center px-4">
            <Bone className="h-2.5 w-14 rounded-[4px]" />
          </div>
          {range(11).map((i) => (
            <div key={i} className="flex min-h-9 items-center gap-3 border-t border-row px-4">
              <Bone className="h-3 w-40 rounded-[4px]" />
              <Bone className="h-2 flex-1 rounded-[2px]" />
              <Bone className="h-3 w-12 rounded-[4px]" />
            </div>
          ))}
        </SkeletonPanel>
        <div className="flex flex-col gap-5">
          <SkeletonPanel>
            <SkeletonPanelHeader w="w-36" aside="w-24" />
            <SkeletonRows count={6} row="flex min-h-10 gap-3" cells={["w-12", "w-32", "ml-auto w-10", "w-10", "w-12"]} />
          </SkeletonPanel>
          {/* Factor tilts: a plain section */}
          <SkeletonPanel variant="plain" className="shrink-0">
            <SkeletonPanelHeader w="w-24" aside="w-36" />
            <SkeletonRows count={7} row="grid h-9 shrink-0 grid-cols-[110px_minmax(0,1fr)_52px] gap-3" cells={["w-20", "h-2.5 w-full rounded-[3px]", "w-10 justify-self-end"]} />
          </SkeletonPanel>
        </div>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Backtesting */

/** backtesting/redesign/backtesting-redesign.tsx: the weights table on the left; the strip, replay and saved scenarios. */
export function BacktestingSkeleton() {
  return (
    <SkeletonPage className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[480px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col max-lg:h-[720px] lg:sticky lg:top-20 lg:h-[calc(100dvh-6.5rem)] lg:self-start">
        <div className="panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-col gap-3 px-4 pt-4 pb-3">
            <div className="flex items-center gap-2.5">
              <TextBone className="flex-1 text-title font-semibold" w="w-72" />
              <SkeletonPill className="h-7 w-32" />
            </div>
            <div className="grid grid-cols-[1fr_1fr_110px] gap-2">
              {range(3).map((i) => (
                <Bone key={i} className="h-[34px] rounded-lg" />
              ))}
            </div>
            <div className="flex h-7 items-center gap-1">
              <Bone className="h-3 w-64 rounded-[4px]" />
              <span className="flex-1" />
              <SkeletonPill className="h-7 w-16" />
            </div>
          </div>
          <div className="flex h-[34px] shrink-0 items-center border-y px-4">
            <Bone className="h-2.5 w-16 rounded-[4px]" />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <SkeletonRows
              count={16}
              row="grid h-11 grid-cols-[minmax(0,1fr)_72px_92px_70px] gap-2.5 last:border-b"
              cells={["w-24", "w-10 justify-self-end", "h-[26px] w-[66px] rounded-[8px]", "w-10 justify-self-end"]}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t bg-band-2 px-4 py-3">
            <Bone className="h-3 w-40 rounded-[4px]" />
            <span className="flex-1" />
            <SkeletonPill className="size-9" />
            <SkeletonPill className="h-[34px] w-28" />
            <SkeletonPill className="h-[34px] w-20" />
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <SkeletonStatStrip cells={4} wrap />
        <SkeletonPanel className="flex-1 px-4 pt-3.5 pb-4">
          <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1">
            <TextBone className="text-emph font-semibold" w="w-44" />
            <TextBone className="text-body" w="w-16" />
            <TextBone className="text-body" w="w-24" />
          </div>
          {/* A plain open replays today's weights as the page loads, so the panel is chart-shaped from the start. */}
          <ReplaySkeleton />
        </SkeletonPanel>
        <SkeletonPanel className="shrink-0">
          <SkeletonPanelHeader w="w-36" aside="w-40" />
          <SkeletonRows count={2} row="flex h-10 gap-2.5" cells={["w-48", "ml-auto w-24", "w-[74px]"]} />
        </SkeletonPanel>
        <div className="flex h-11 shrink-0 items-center rounded-[14px] bg-band-2 px-4 shadow-[0_0_0_1px_var(--border)]">
          <TextBone className="text-body font-medium" w="w-36" />
        </div>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Weekly */

/** The weekly update (weekly/weekly-view.tsx, Summary tab): the packs beside the pack's hero, tabs, performers and sections. */
export function WeeklySkeleton() {
  return (
    <SkeletonPage fullBleed className="flex min-h-0 flex-1 flex-col">
      <SkeletonPageHead />
      <div className="flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 border-r pt-[18px] pr-4 pl-10">
          {range(4).map((i) => (
            <div key={i} className="flex flex-col border-b border-row py-[9px]">
              <TextBone className="text-body" w="w-28" />
              <TextBone className="text-caption" w="w-32" />
            </div>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col px-8 pt-6 pb-24">
          <TextBone className="text-body" w="w-96 max-w-full" />
          <TextBone className="hero-figure" w="w-40" />
          <TextBone className="text-emph" w="w-2/3" />
          <SkeletonTabs className="mt-5" widths={["w-16", "w-12", "w-16", "w-14", "w-14"]} />
          <div className="mt-5 grid grid-cols-2 gap-10 border-t pt-4">
            {range(2).map((c) => (
              <div key={c}>
                <TextBone className="text-body font-bold" w="w-28" />
                {range(3).map((i) => (
                  <div key={i} className="flex min-h-[34px] items-center justify-between gap-3 border-b border-row py-1">
                    <Bone className="h-3 w-24 rounded-[4px]" />
                    <Bone className="h-3 w-12 rounded-[4px]" />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-5">
            <TextBone className="text-body font-bold" w="w-20" />
            {range(3).map((i) => (
              <div key={i} className="flex min-h-[34px] items-center border-b border-row py-1">
                <Bone className="h-3 w-44 rounded-[4px]" />
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-10">
            {range(3).map((c) => (
              <div key={c}>
                <TextBone className="text-body font-bold" w="w-28" />
                {range(3).map((i) => (
                  <div key={i} className="flex min-h-[34px] items-center justify-between gap-3 border-b border-row py-1">
                    <Bone className="h-3 w-24 rounded-[4px]" />
                    <Bone className="h-3 w-8 rounded-[4px]" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Changelog */

/** The changelog (changelog/changelog-view.tsx): the count, then the changes grouped by day. */
export function ChangelogSkeleton() {
  return (
    <>
      <SkeletonPageHead />
      <SkeletonPage className="flex max-w-[900px] flex-col">
        <TextBone className="text-body" w="w-40" />
        <TextBone className="hero-figure" w="w-64" />
        <TextBone className="text-emph" w="w-full" />
        {range(2).map((g) => (
          <div key={g}>
            <div className="border-b pt-[22px] pb-1.5">
              <TextBone className="text-caption font-semibold" w="w-24" />
            </div>
            {range(g === 0 ? 4 : 3).map((i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b border-row py-3">
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <TextBone className="text-emph font-semibold" w="w-96 max-w-full" />
                  <TextBone className="text-body" w="w-full" />
                  <TextBone className="text-caption" w="w-28" />
                </div>
                <Bone className="h-3 w-10 rounded-[4px]" />
              </div>
            ))}
          </div>
        ))}
      </SkeletonPage>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------ Admin */

/** admin/members-panel.tsx GRID. */
const MEMBERS_GRID = "grid grid-cols-[minmax(0,1.3fr)_170px_minmax(0,1fr)_90px_140px_150px] items-center gap-3";

/**
 * Admin (admin/admin-view.tsx), on its Members tab, which /admin opens on: the hero, the search and filters, and a 46px
 * row per member. The Jobs and connections tab (`?tab=jobs`) shares the route's loading state and the head and hero.
 */
export function AdminSkeleton() {
  return (
    <>
      <SkeletonPageHead tabs={3} />
      <SkeletonPage className="flex min-h-0 flex-1 flex-col">
        <TextBone className="text-body" w="w-72" />
        <TextBone className="hero-figure" w="w-56" />
        <TextBone className="text-emph" w="w-2/3" />
        <div className="mt-5 flex items-center gap-2">
          <Bone className="h-8 w-[280px] rounded-none" />
          <span className="flex-1" />
          <SkeletonPill className="h-7 w-72" />
        </div>
        <div className="mt-3">
          <div className={cn(MEMBERS_GRID, "h-8 border-b")}>
            <Bone className="h-2.5 w-12 rounded-[4px]" />
          </div>
          {range(8).map((i) => (
            <div key={i} className={cn(MEMBERS_GRID, "h-[46px] border-b border-row")}>
              <div className="flex min-w-0 flex-col gap-1">
                <Bone className="h-3 w-32 rounded-[4px]" />
                <Bone className="h-2.5 w-24 rounded-[4px]" />
              </div>
              <Bone className="h-7 w-28 rounded-lg" />
              <Bone className="h-3 w-24 rounded-[4px]" />
              <Bone className="h-3 w-14 rounded-[4px]" />
              <Bone className="h-3 w-16 rounded-[4px]" />
              <span />
            </div>
          ))}
        </div>
      </SkeletonPage>
    </>
  );
}

/** The PT sheet read test (admin/pt-sheet-view.tsx): the head, the hero, the sheet's details, the first tab's table. */
export function PtSheetSkeleton() {
  return (
    <>
      <SkeletonPageHead tabs={3} />
      <SkeletonPage className="flex min-h-0 flex-1 flex-col">
        <TextBone className="text-body" w="w-72" />
        <TextBone className="hero-figure" w="w-64" />
        <TextBone className="text-emph" w="w-2/3" />
        <div className="mt-6 flex flex-col gap-6">
          <SkeletonPanel variant="plain" className="shrink-0">
            <SkeletonPanelHeader w="w-14" aside="w-36" />
            <SkeletonRows count={4} row="flex h-[40.25px] gap-6 border-t px-0" cells={["w-20", "w-64"]} divided />
          </SkeletonPanel>
          <SkeletonPanel variant="plain" className="shrink-0">
            <SkeletonPanelHeader w="w-28" aside="w-28" />
            <TextBone className="border-t border-row py-2 text-body" w="w-96 max-w-full" />
            {/* The table scrolls inside 480px; a full tab fills it. */}
            <div className="h-[480px] overflow-hidden">
              <div className="flex h-[30px] items-center border-b bg-band px-3">
                <Bone className="h-2.5 w-40 rounded-[4px]" />
              </div>
              <SkeletonRows count={15} row="flex h-[33px] gap-6" cells={["w-6", "w-24", "w-16", "w-20", "w-16"]} />
            </div>
          </SkeletonPanel>
        </div>
      </SkeletonPage>
    </>
  );
}
