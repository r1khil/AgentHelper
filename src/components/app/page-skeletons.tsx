import { LastSessionSkeleton } from "@/app/(app)/_today/last-session";
import { StressPanelFallback } from "@/components/app/risk/stress-panel";
import { cn } from "@/lib/utils";
import { Bone, SkeletonChart, SkeletonPage, SkeletonPanel, SkeletonPanelHeader, SkeletonPill, SkeletonRows, SkeletonStatStrip, TextBone } from "./skeletons";

// One loading skeleton per page, used by the route's loading.tsx. Each copies its page's outer layout classes
// (grids, column widths, gaps, panel and row heights) from the component named above it, so the page streams in
// on top of it without moving. Update the skeleton when that layout changes.

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/* ------------------------------------------------------------------------------------------------ Today */

/**
 * Today (`_today/today-view.tsx`): the greeting, Hoot's list and Teams on the left; the last session, the evening
 * brief and Coming up on the right. The last-session card is only for readers who see a book (execs, admins, leads)
 * and the brief only for the fund's book, so those follow the reader's role, which the shell sets on <main>.
 */
export function TodaySkeleton() {
  return (
    <SkeletonPage className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-5">
        {/* Greeting */}
        <div className="flex h-[84px] shrink-0 items-center gap-4">
          <Bone className="size-[84px] shrink-0 rounded-full" />
          <div className="min-w-0">
            <TextBone className="font-mono text-xs" w="w-56" />
            <TextBone className="mt-0.5 text-[28px] leading-tight" w="w-60" />
            <TextBone className="mt-0.5 text-[15px]" w="w-80" />
          </div>
        </div>
        {/* Hoot's list */}
        <SkeletonPanel className="shrink-0">
          <SkeletonPanelHeader w="w-36" aside="w-52" />
          <SkeletonRows
            count={3}
            row="grid h-[58px] grid-cols-[32px_minmax(0,1fr)_150px_116px_20px] gap-3"
            cells={["size-8 rounded-full", "w-3/5", "w-20", "h-7 w-20 justify-self-end rounded-full", ""]}
          />
        </SkeletonPanel>
        {/* Teams: a 52px row per team under a divider, as tall as its rows. */}
        <SkeletonPanel>
          <SkeletonPanelHeader w="w-32" aside="w-16" />
          <div className="flex h-8 shrink-0 items-center px-4">
            <Bone className="h-2.5 w-10 rounded-[4px]" />
          </div>
          {range(6).map((i) => (
            <div key={i} className="border-t border-row">
              <div className="flex h-[52px] items-center gap-3 px-4">
                <Bone className="h-3 w-32 rounded-[4px]" />
                <span className="flex-1" />
                <Bone className="h-3 w-24 rounded-[4px]" />
              </div>
            </div>
          ))}
        </SkeletonPanel>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <div className="hidden in-data-[role=admin]:block in-data-[role=exec]:block in-data-[role^=lead]:block">
          <LastSessionSkeleton />
        </div>
        {/* Hoot's evening brief comes with the fund's book only; a plain section. */}
        <section className="panel-plain hidden shrink-0 px-[18px] py-2 in-data-[role=admin]:block in-data-[role=exec]:block">
          <div className="flex items-center">
            <TextBone className="text-[14.5px] leading-5 font-semibold" w="w-36" />
          </div>
          <div className="mt-2">
            {["w-full", "w-full", "w-full", "w-3/5"].map((w, i) => (
              <TextBone key={i} className="text-[14.5px] leading-[1.55]" w={w} />
            ))}
          </div>
          <TextBone className="mt-2 text-[13px]" w="w-32" />
        </section>
        {/* Coming up: a plain section of 38px rows; execs and admins also get the Sunday weekly pack. */}
        <SkeletonPanel variant="plain">
          <SkeletonPanelHeader className="px-[18px]" w="w-24" aside="w-20" />
          <div className="flex flex-col pb-1">
            {range(6).map((i) => (
              <div key={i} className={cn("grid h-[38px] grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-2.5 px-[18px]", i === 5 && "hidden in-data-[role=admin]:grid in-data-[role=exec]:grid")}>
                <Bone className="h-3 w-14 rounded-[4px]" />
                <Bone className="h-3 w-3/5 rounded-[4px]" />
                <Bone className="h-3 w-12 rounded-[4px]" />
              </div>
            ))}
          </div>
        </SkeletonPanel>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Holdings */

/** components/app/holdings/holdings-table.tsx GRID. */
const HOLDINGS_GRID = "grid grid-cols-[64px_minmax(0,1fr)_64px_64px_80px_76px_76px_96px_168px] items-center gap-3 px-4";
const HOLDING_CELLS = ["w-11", "w-3/5", "w-10 justify-self-end", "w-10 justify-self-end", "w-12 justify-self-end", "w-10 justify-self-end", "w-10 justify-self-end", "w-16", "h-[22px] w-24 rounded-full"];

/** Holdings (`t/[team]/page.tsx`): the filter chips and market line, then the holdings table grouped by team. */
export function HoldingsSkeleton() {
  return (
    <SkeletonPage className="flex flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SkeletonPill className="w-[118px]" />
        <SkeletonPill className="w-[150px]" />
        <SkeletonPill className="w-[178px]" />
        <span className="flex-1" />
        <TextBone className="text-[13px]" w="w-48" />
      </div>
      <section className="panel flex flex-col overflow-hidden">
        <div className="flex min-w-[920px] flex-col">
          <div className={cn(HOLDINGS_GRID, "h-9 shrink-0 border-b")}>
            {HOLDING_CELLS.map((_, i) => (
              <Bone key={i} className={cn("h-2.5 w-10 rounded-[4px]", i > 1 && i < 7 && "justify-self-end")} />
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
            <TextBone className="font-mono text-[28px] leading-tight" w="w-20" />
            {/* Company · team, then the price, the day's move and the move against the S&P 500. */}
            <TextBone className="text-base" w="w-80" />
            <TextBone className="ml-2 font-mono text-lg" w="w-16" />
            <TextBone className="text-sm" w="w-14" />
            <TextBone className="text-[13px]" w="w-36" />
          </div>
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <SkeletonPill className="h-[34px] w-[150px]" />
          <SkeletonPill className="h-[34px] w-[150px]" />
          <SkeletonPill className="size-9" />
        </div>
      </div>
      <div className="flex shrink-0 gap-[22px] border-b">
        {["w-16", "w-16", "w-36", "w-16", "w-12"].map((w, i) => (
          <TextBone key={i} className="pb-2.5 text-sm" w={w} />
        ))}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-h-0 min-w-0 flex-col gap-5">
          {/* Price chart */}
          <section className="panel min-w-0 shrink-0 px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
              <TextBone className="text-[14.5px] font-semibold" w="w-32" />
              <TextBone className="text-xs" w="w-24" />
              <TextBone className="text-xs" w="w-24" />
              <span className="flex-1" />
              <TextBone className="text-xs" w="w-20" />
              <Bone className="h-[28.5px] w-40 rounded-full" />
            </div>
            <SkeletonChart className="mt-2.5 h-[200px]" />
          </section>
          {/* Thesis: a plain section */}
          <section className="panel-plain shrink-0 px-4 py-2">
            <TextBone className="text-[14.5px] font-semibold" w="w-16" />
            <div className="mt-2">
              {["w-full", "w-full", "w-11/12", "w-2/3"].map((w, i) => (
                <TextBone key={i} className="text-[14.5px] leading-[1.55]" w={w} />
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
                  <TextBone className="text-[12.5px]" w="w-40" />
                  <TextBone className="mt-0.5 text-sm" w="w-4/5" />
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
                    <TextBone className="text-[13.5px] leading-snug" w="w-4/5" />
                    <TextBone className="mt-px text-xs" w="w-24" />
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
            <TextBone className="text-[14.5px] font-semibold" w="w-24" />
            <span className="flex-1" />
            <TextBone className="font-mono text-[11px]" w="w-28" />
          </div>
          {["w-full", "w-full", "w-1/2"].map((w, i) => (
            <TextBone key={i} className={cn("text-[12.5px] leading-[1.45]", i === 0 && "mt-0.5")} w={w} />
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
              <TextBone className="mt-[3px] text-xs" w="w-44" />
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
              <TextBone className="font-mono text-2xl font-semibold" w="w-20" />
              <span className="flex flex-wrap gap-x-1">
                <TextBone className="text-[15px]" w="w-40" />
                <TextBone className="text-[15px]" w="w-32" />
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                {["w-20", "w-28", "w-28"].map((w, i) => (
                  <TextBone key={i} className="text-[13.5px]" w={w} />
                ))}
              </span>
            </div>
          </div>
          <div className="panel flex shrink-0">
            {["w-40", "w-20", "w-28", "w-16"].map((w, i) => (
              <div key={i} className={cn("px-4 py-2", i > 0 && "shadow-[inset_1px_0_0_var(--border)]")}>
                <TextBone className="text-[11.5px]" w="w-10" />
                <TextBone className="text-[13.5px] font-semibold" w={w} />
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
                <TextBone key={i} className="text-[14.5px] leading-[1.6]" w={w} />
              ))}
            </div>
            <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-t bg-band-2 px-4 py-2">
              <SkeletonPill className="w-44" />
              <SkeletonPill className="w-24" />
              <SkeletonPill className="w-32" />
              <TextBone className="min-w-0 flex-1 basis-64 text-xs" w="w-64" />
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
                      <TextBone className="pr-2 text-[13.5px] leading-[1.45]" w="w-4/5" />
                      <div className="flex min-h-6 items-center">
                        <Bone className="h-2.5 w-32 rounded-[4px]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-3 border-t bg-band-2 px-4 py-2">
                <TextBone className="min-w-0 flex-1 basis-40 text-[12.5px]" w="w-48" />
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
            <TextBone className="flex-1 text-[14.5px] font-semibold" w="w-32" />
            <Bone className="size-6 rounded-full" />
            <Bone className="size-6 rounded-full" />
          </div>
          <div className="mt-2.5 grid grid-cols-7 gap-y-0.5 text-center font-mono text-[11.5px]">
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
          <TextBone className="text-[14.5px] font-semibold" w="w-12" />
          <div className="mt-2.5 flex flex-col gap-2.5 text-[13.5px]">
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
          <TextBone className="text-[14.5px] font-semibold" w="w-44" />
          <TextBone className="mt-0.5 text-[12.5px]" w="w-52" />
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
                <TextBone key={i} className="text-[12px] leading-[18px]" w={w} />
              ))}
            </div>
            <TextBone className="text-[12px] leading-5" w="w-40" />
          </div>
        </SkeletonPanel>
      </div>
      {/* The week */}
      <SkeletonPanel className="min-h-[520px]">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b px-5">
          <TextBone className="text-[17px] font-semibold" w="w-48" />
          <TextBone className="text-[13px]" w="w-56" />
          <span className="flex-1" />
          <SkeletonPill className="w-44" />
        </div>
        <div className="flex flex-1 flex-col">
          {[2, 1, 2, 1, 2].map((rows, d) => (
            <div key={d} className="flex flex-1 flex-col border-b pb-2 last:border-b-0">
              <div className="px-5 pt-2.5 pb-1">
                <TextBone className="font-mono text-[12.5px] font-semibold" w="w-20" />
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
      <TextBone className="text-[14.5px] font-semibold" w="w-64" />
      <span className="flex-1" />
      <Bone className="h-[22px] w-20 rounded-full" />
    </div>
  );
  return (
    <SkeletonPage className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <TextBone className="font-mono text-[28px] leading-none" w="w-20" />
          <TextBone className="text-[15px]" w="w-40" />
          <TextBone className="font-mono text-[13px]" w="w-36" />
          <Bone className="h-[22px] w-20 rounded-full" />
        </div>
        <TextBone className="text-[13px]" w="w-80" />
      </div>
      <SkeletonPanel className="flex-row items-center gap-3 px-4 py-3">
        <TextBone className="flex-1 text-[13px]" w="w-96" />
      </SkeletonPanel>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2">
        <SkeletonPanel>
          {header}
          <div className="grid gap-3 p-4">
            {range(3).map((i) => (
              <div key={i} className="grid gap-1.5">
                <TextBone className="text-sm" w="w-40" />
                <Bone className="h-[76px] w-full rounded-lg" />
              </div>
            ))}
          </div>
        </SkeletonPanel>
        <SkeletonPanel>
          {header}
          <div className="p-4">
            <TextBone className="text-[13.5px]" w="w-3/4" />
          </div>
        </SkeletonPanel>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Research */

/** agent/research-columns.tsx ListColumn with the conversation list (agent/conversation-list.tsx). */
function ConversationColumn() {
  return (
    <div className="flex min-h-0 flex-col gap-4 border-b px-3 py-4 lg:border-r lg:border-b-0">
      <div className="flex shrink-0 gap-2">
        <Bone className="h-[34px] min-w-0 flex-1 rounded-full" />
        <Bone className="h-[34px] w-[74px] rounded-full" />
      </div>
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-1 pt-px pb-1">
        {[4, 6].map((rows, g) => (
          <div key={g}>
            <TextBone className="px-2.5 pb-1.5 font-mono text-[10.5px]" w="w-24" />
            {range(rows).map((i) => (
              <div key={i} className="px-2.5 py-2">
                <TextBone className="text-[13.5px]" w={i % 2 ? "w-40" : "w-48"} />
                <TextBone className="mt-px text-xs" w="w-32" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** chat/thread-parts.tsx ComposerBox: an empty box with the send button. */
function ComposerSkeleton({ rows = 1 }: { rows?: 1 | 2 }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-background px-3.5 py-3 shadow-[0_0_0_1px_var(--border)]">
      <div className={rows === 2 ? "h-11" : "h-[22px]"} />
      <div className="flex items-center gap-2">
        <span className="flex-1" />
        <Bone className="size-8 rounded-full" />
      </div>
    </div>
  );
}

/**
 * A Hoot conversation (`hoot/[chatId]`, chat/chat-panel.tsx ChatWorkspace) and a holding's research board
 * (`agent/h/[ticker]`, agent/holding-board.tsx): full-bleed conversations, thread and composer, sources.
 */
export function ResearchWorkspaceSkeleton() {
  return (
    <SkeletonPage
      fullBleed
      className="grid min-h-0 flex-1 grid-cols-1 lg:h-[calc(100dvh-3.5rem)] lg:flex-none lg:grid-cols-[288px_minmax(0,1fr)_312px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden"
    >
      <ConversationColumn />
      <section className="flex min-h-[560px] min-w-0 flex-col bg-card lg:min-h-0">
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b px-7">
          <TextBone className="text-sm font-semibold" w="w-48" />
          <TextBone className="text-[12.5px]" w="w-40" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="flex flex-col gap-4 px-6 py-6 xl:px-14">
            <div className="flex justify-end">
              <Bone className="h-10 w-[min(360px,70%)] rounded-[16px_16px_4px_16px]" />
            </div>
            <div className="max-w-[700px]">
              {["w-full", "w-full", "w-11/12", "w-4/5", "w-full", "w-2/3"].map((w, i) => (
                <TextBone key={i} className="text-[15px] leading-[1.65]" w={w} />
              ))}
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t px-6 pt-3.5 pb-[18px] xl:px-14">
          <ComposerSkeleton />
        </div>
      </section>
      <aside className="flex min-h-0 min-w-0 flex-col border-t px-3.5 py-4 lg:border-t-0 lg:border-l">
        <TextBone className="text-sm font-semibold" w="w-16" />
        <div className="-mx-1 mt-2.5 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-1 pt-px pb-1">
          {range(3).map((i) => (
            <Bone key={i} className="h-[72px] w-full rounded-[10px]" />
          ))}
        </div>
      </aside>
    </SkeletonPage>
  );
}

/** agent/research-boards.tsx ROW. */
const BOARD_ROW =
  "grid grid-cols-[minmax(140px,1fr)_84px_minmax(104px,150px)_118px_minmax(110px,160px)_12px] items-center gap-x-3 px-4 xl:grid-cols-[minmax(200px,1fr)_128px_128px_128px_150px_minmax(150px,210px)_16px] xl:gap-x-4";

/** Research (`agent/page.tsx`, agent/hoot-home.tsx): conversations, then the ask panel over the research boards. */
export function ResearchHomeSkeleton() {
  return (
    <SkeletonPage
      fullBleed
      className="grid min-h-0 flex-1 grid-cols-1 lg:h-[calc(100dvh-3.5rem)] lg:flex-none lg:grid-cols-[248px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[288px_minmax(0,1fr)]"
    >
      <ConversationColumn />
      <div className="flex min-h-0 min-w-0 flex-col gap-4 p-5 xl:gap-5 xl:p-6">
        {/* Ask Hoot */}
        <SkeletonPanel className="shrink-0">
          <div className="grid gap-x-8 gap-y-3 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)] xl:p-5">
            <div className="flex min-w-0 gap-4">
              <Bone className="-mt-1 size-14 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <TextBone className="text-[17px] font-semibold" w="w-64" />
                <TextBone className="mt-1 text-[13.5px] leading-relaxed" w="w-full" />
                <TextBone className="text-[13.5px] leading-relaxed xl:hidden" w="w-1/3" />
                <div className="mt-3.5">
                  <ComposerSkeleton rows={2} />
                </div>
              </div>
            </div>
            <div className="min-w-0">
              <TextBone className="label-mono pb-1.5" w="w-20" />
              <div className="-mx-1 flex gap-1.5 overflow-hidden px-1 pb-1 xl:mx-0 xl:flex-col xl:gap-0 xl:px-0 xl:pb-0">
                {range(5).map((i) => (
                  <div key={i} className="shrink-0 rounded-full bg-band px-3 py-1.5 text-[12.5px] leading-snug xl:rounded-[8px] xl:bg-transparent xl:px-2 xl:py-[7px] xl:text-[13px]">
                    <TextBone w="w-40 xl:w-60" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SkeletonPanel>
        {/* Research boards */}
        <SkeletonPanel className="min-h-[420px] flex-1 lg:min-h-0">
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5">
            <TextBone className="text-[14.5px] font-semibold" w="w-32" />
            <SkeletonPill className="ml-2 w-[400px] max-w-full" />
            <span className="flex-1" />
            <SkeletonPill className="w-24" />
            <SkeletonPill className="w-44" />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className={cn(BOARD_ROW, "h-9 border-b bg-band")}>
              <Bone className="h-2.5 w-14 rounded-[4px]" />
            </div>
            {range(10).map((i) => (
              <div key={i} className={cn(BOARD_ROW, "min-h-[54px] border-b border-row py-2")}>
                <div>
                  <TextBone className="font-mono text-[13.5px]" w="w-12" />
                  <TextBone className="text-xs" w="w-28" />
                </div>
                <Bone className="h-3 w-14 justify-self-end rounded-[4px]" />
                <Bone className="h-3 w-20 rounded-[4px]" />
                <Bone className="hidden h-3 w-20 rounded-[4px] xl:block" />
                <Bone className="h-3 w-24 rounded-[4px]" />
                <Bone className="h-[22px] w-20 rounded-full" />
              </div>
            ))}
          </div>
        </SkeletonPanel>
      </div>
    </SkeletonPage>
  );
}

/* ------------------------------------------------------------------------------------------------ Sell-side */

/** Sell-side calls (sell-side/sell-side-layout.tsx): record a call and the saved calls, the call's brief. */
export function SellSideSkeleton() {
  return (
    <SkeletonPage className="grid min-h-0 flex-1 gap-6 lg:h-[calc(100dvh-104px)] lg:min-h-[600px] lg:flex-none lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-5">
        <div className="shrink-0 rounded-[14px] bg-rail p-3.5">
          <div className="text-[14.5px]">
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
                  <TextBone className="font-mono text-[12.5px]" w="w-10" />
                  <TextBone className="min-w-0 flex-1 text-[13.5px]" w="w-40" />
                  <TextBone className="text-xs" w="w-12" />
                </div>
                <TextBone className="mt-0.5 text-xs" w="w-44" />
              </div>
            ))}
          </div>
        </SkeletonPanel>
      </div>
      <div className="flex min-h-[560px] min-w-0 flex-col lg:min-h-0">
        <SkeletonPanel className="min-h-0 flex-1">
          <div className="shrink-0 px-5 pt-4">
            <TextBone className="text-[19px] leading-tight font-semibold" w="w-80" />
            <TextBone className="mt-1 text-[13px]" w="w-56" />
            <Bone className="mt-3.5 h-9 w-full rounded-[10px]" />
            <div className="mt-3.5 flex gap-[22px] border-b">
              {["w-12", "w-20", "w-20"].map((w, i) => (
                <TextBone key={i} className="pb-2.5 text-sm" w={w} />
              ))}
            </div>
          </div>
          <div className="grid min-h-0 flex-1 lg:grid-cols-2">
            {range(2).map((c) => (
              <div key={c} className={cn("min-w-0 px-5 py-3.5", c === 0 ? "lg:border-r" : "border-t lg:border-t-0")}>
                <TextBone className="text-[13.5px] font-semibold" w="w-40" />
                <div className="mt-1.5">
                  {range(4).map((i) => (
                    <div key={i} className="border-b border-row py-2.5">
                      <TextBone className="text-[13.5px]" w="w-full" />
                      <TextBone className="text-[13.5px]" w="w-2/3" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t bg-band-2 px-5 pt-3 pb-3.5">
            <TextBone className="text-[13.5px] font-semibold" w="w-52" />
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
          <TextBone className="text-[14.5px] font-semibold" w="w-16" />
          <span className="flex-1" />
          <SkeletonPill className="h-7 w-24" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {range(9).map((i) => (
            <div key={i} className="border-b border-row px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <Bone className="h-3 w-11 shrink-0 rounded-[4px]" />
                <TextBone className="min-w-0 flex-1 text-[13.5px]" w="w-32" />
              </div>
              <TextBone className="mt-0.5 text-xs" w="w-40" />
            </div>
          ))}
        </div>
      </SkeletonPanel>
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <TextBone className="text-[19px] font-semibold" w="w-72" />
            <TextBone className="mt-0.5 text-[13px]" w="w-96 max-w-full" />
            <TextBone className="mt-0.5 text-[13px]" w="w-64" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonPill className="h-[34px] w-28" />
            <SkeletonPill className="h-[34px] w-36" />
          </div>
        </div>
        <div className="-mb-1 flex gap-5 border-b">
          {["w-28", "w-20", "w-20"].map((w, i) => (
            <div key={i} className="flex h-9 items-center">
              <TextBone className="text-sm" w={w} />
            </div>
          ))}
        </div>
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
            <TextBone className="flex-1 text-[12.5px]" w="w-48" />
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
          <TextBone className="text-[13px]" w="w-72" />
        </div>
        <SkeletonStatStrip cells={4} size="lg" />
        <div className={cn(ATTRIBUTION_GRID, "lg:min-h-[252px]")}>
          <section className="panel-plain flex min-w-0 flex-col px-4 pt-2 pb-3">
            <div className="flex min-h-7 shrink-0 items-center gap-3.5">
              <TextBone className="text-[14.5px] font-semibold" w="w-32" />
              <TextBone className="text-xs" w="w-20" />
              <TextBone className="text-xs" w="w-24" />
            </div>
            <div className="mt-2.5 flex min-h-0 flex-1 flex-col">
              <SkeletonChart className="h-full min-h-44" />
            </div>
          </section>
          <section className="panel-plain flex min-w-0 flex-col px-4 pt-2 pb-3.5">
            <div className="flex min-h-7 shrink-0 items-center gap-3.5">
              <TextBone className="text-[14.5px] font-semibold" w="w-36" />
            </div>
            <div className="mt-3.5 mb-3 flex flex-1 flex-col gap-3.5">
              {range(4).map((i) => (
                <div key={i} className="grid grid-cols-[92px_minmax(0,1fr)_48px] items-center gap-2.5 text-[13.5px]">
                  <TextBone w="w-20" />
                  <Bone className="h-[18px] rounded-[6px]" />
                  <Bone className="h-3 w-10 justify-self-end rounded-[4px]" />
                </div>
              ))}
            </div>
            <TextBone className="text-[12.5px] leading-normal" w="w-4/5" />
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
                  <div key={i} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-2.5 text-[13px]">
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
                  <TextBone key={i} className={cn("text-[13px] leading-relaxed", i >= 4 && i < 6 && "xl:hidden")} w={w} />
                ))}
              </div>
            </SkeletonPanel>
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}

/** The ledger (attribution/ledger-view.tsx, Trades tab): the toolbar, the strip, the PT sheet check, the trades table. */
export function LedgerSkeleton() {
  return (
    <SkeletonPage className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <SkeletonPill className="w-[118px]" />
        <TextBone className="text-[17px] font-semibold" w="w-16" />
        <TextBone className="text-[13px]" w="w-72" />
      </div>
      <SkeletonStatStrip cells={4} />
      <TextBone className="text-xs" w="w-72" />
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <SkeletonPill className="w-[340px]" />
        <SkeletonPanel className="flex-1">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
            <TextBone className="text-[14.5px] font-semibold" w="w-16" />
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
        <TextBone className="min-w-0 text-[13px]" w="w-96 max-w-full" />
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
        <TextBone className="min-w-0 text-[13px]" w="w-80 max-w-full" />
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
              <TextBone className="flex-1 text-[17px] font-semibold" w="w-72" />
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
        <SkeletonStatStrip cells={4} />
        <SkeletonPanel className="flex-1 px-4 pt-3.5 pb-4">
          <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1">
            <TextBone className="text-[14.5px] font-semibold" w="w-44" />
            <TextBone className="text-xs" w="w-16" />
            <TextBone className="text-xs" w="w-24" />
          </div>
          <div className="grid flex-1 place-items-center py-10">
            <div className="flex w-full max-w-md flex-col items-center gap-2">
              <TextBone className="text-[14.5px]" w="w-56" />
              <TextBone className="text-[13px]" w="w-80 max-w-full" />
              <TextBone className="text-[13px]" w="w-72 max-w-full" />
            </div>
          </div>
        </SkeletonPanel>
        <SkeletonPanel className="shrink-0">
          <SkeletonPanelHeader w="w-36" aside="w-40" />
          <SkeletonRows count={2} row="flex h-10 gap-2.5" cells={["w-48", "ml-auto w-24", "w-[74px]"]} />
        </SkeletonPanel>
      </div>
    </SkeletonPage>
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
                <TextBone className="text-[13.5px] font-medium" w="w-36" />
                <TextBone className="mt-px text-xs" w="w-24" />
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
              <TextBone className="text-[19px] font-semibold" w="w-80 max-w-full" />
              <TextBone className="mt-0.5 text-[13px]" w="w-64" />
              {/* Beside the actions the built-and-sent line wraps once in a narrow window. */}
              <TextBone className="text-[13px] xl:hidden" w="w-12" />
            </div>
            <SkeletonPill className="h-[34px] w-24" />
            <SkeletonPill className="h-[34px] w-32" />
            <SkeletonPill className="size-9" />
          </div>
          <SkeletonStatStrip cells={4} notes={false} />
          <div className="-mt-1 flex shrink-0 gap-5 border-b">
            {["w-16", "w-16", "w-14", "w-16", "w-14"].map((w, i) => (
              <div key={i} className="flex h-9 items-center">
                <TextBone className="text-sm" w={w} />
              </div>
            ))}
          </div>
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
                <div key={i} className="flex h-[37px] items-center gap-4 px-4 text-[13.5px]">
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
          <TextBone className="flex-1 text-[14.5px] font-semibold" w="w-80 max-w-full" />
          <TextBone className="text-[12.5px]" w="w-32" />
          <SkeletonPill className="h-[30px] w-24" />
        </div>
        <div className="flex flex-1 flex-col">
          {range(8).map((i) => (
            <div key={i} className="grid min-h-[76px] flex-1 grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-4 border-b border-row px-5 py-3 last:border-b-0">
              <div className="min-w-0">
                <TextBone className="font-mono text-xs" w="w-12" />
                <TextBone className="mt-0.5 text-[11.5px]" w="w-16" />
              </div>
              <div className="min-w-0">
                <TextBone className="text-[15px] font-semibold" w="w-72 max-w-full" />
                <TextBone className="mt-0.5 text-[13px] leading-[1.45]" w="w-full" />
                {i % 2 === 0 && <TextBone className="text-[13px] leading-[1.45]" w="w-1/2" />}
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
                <div className="figure text-[28px]">
                  <span className="inline-block h-[0.7em] w-10 rounded-[4px] bg-rail-2 align-middle" />
                </div>
                <div className="text-[12.5px]">
                  <span className="inline-block h-[0.7em] w-24 rounded-[3px] bg-rail-2 align-middle" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <SkeletonPanel className="min-h-0 flex-1 gap-3 px-[18px] py-4">
          <TextBone className="text-[14.5px] font-semibold" w="w-44" />
          <div>
            {["w-full", "w-full", "w-11/12", "w-2/3"].map((w, i) => (
              <TextBone key={i} className="text-[13.5px] leading-[1.55]" w={w} />
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
            <TextBone className="text-[14.5px] font-semibold" w="w-20" />
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
                    <TextBone className="text-[13.5px] font-semibold" w="w-40" />
                    <TextBone className="text-xs" w="w-56 max-w-full" />
                    <TextBone className="text-xs" w="w-32" />
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
          <TextBone className="text-[19px] font-semibold" w="w-52" />
          <TextBone className="mt-0.5 text-[13px]" w="w-96 max-w-full" />
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
        <TextBone className="border-b border-row px-4 py-2 text-[12.5px]" w="w-96 max-w-full" />
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
