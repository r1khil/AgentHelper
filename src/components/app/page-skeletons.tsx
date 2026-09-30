import { SkeletonPageHead } from "@/components/app/page-head";
import { cn } from "@/lib/utils";
import { Bone, SkeletonPage, SkeletonPanel, SkeletonPanelHeader, SkeletonPill, SkeletonRows, SkeletonTabs, TextBone } from "./skeletons";

// One loading skeleton per page, used by the route's loading.tsx. Each copies its page's outer layout classes
// (grids, column widths, gaps, panel and row heights) from the component named above it, so the page streams in
// on top of it without moving. Update the skeleton when that layout changes.

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/* ------------------------------------------------------------------------------------------------ Calendars */

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
          <div className="flex h-[52px] w-[760px] max-w-full items-center gap-2 rounded-composer border border-border-strong py-2 pr-2 pl-4">
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
