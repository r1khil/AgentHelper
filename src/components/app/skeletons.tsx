import { cn } from "@/lib/utils";

// Loading-skeleton parts for the page-shaped fallbacks in page-skeletons.tsx. Each part keeps the outer geometry of
// its counterpart in panel.tsx (same padding, header and row heights, same text classes for line boxes), so the
// page lands on the skeleton without moving. Quiet on purpose: flat blocks with a slow pulse, none with reduced
// motion, and no titles (the header already names the page).

/** A flat placeholder block. */
export function Bone({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-md bg-muted motion-safe:animate-pulse", className)} />;
}

/**
 * One line of text: pass the real element's text classes (size, leading, margins) so the line box is the same
 * height, and a width for the bar.
 */
export function TextBone({ className, w = "w-24" }: { className?: string; w?: string }) {
  return (
    <div aria-hidden className={cn("truncate", className)}>
      <span className={cn("inline-block h-[0.7em] rounded-[4px] bg-muted align-middle motion-safe:animate-pulse", w)} />
    </div>
  );
}

/** The page wrapper: announces loading once and carries the page's own outer classes. */
export function SkeletonPage({ className, children, fullBleed }: { className?: string; children: React.ReactNode; fullBleed?: boolean }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" data-full-bleed={fullBleed || undefined} className={className}>
      {children}
    </div>
  );
}

/** A panel (card background, 1px ring). Add `flex-1 min-h-0` to fill a column, as on the real page. */
export function SkeletonPanel({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <section className={cn("panel flex min-w-0 flex-col overflow-hidden", className)}>{children}</section>;
}

/** PanelHeader's 44px band (or pass `className="h-[42px]"`, `h-12`… where the real header differs). */
export function SkeletonPanelHeader({ className, w = "w-36", aside }: { className?: string; w?: string; aside?: string | false }) {
  return (
    <div className={cn("flex h-11 shrink-0 items-center gap-2 border-b px-4", className)}>
      <TextBone className="text-[14.5px] font-semibold" w={w} />
      <span className="flex-1" />
      {aside && <Bone className={cn("h-3 rounded-[4px]", aside)} />}
    </div>
  );
}

/** StatStrip with placeholder cells: same grid, padding and line boxes. */
export function SkeletonStatStrip({ cells, size = "md", notes = true, className }: { cells: number; size?: "md" | "lg"; notes?: boolean; className?: string }) {
  return (
    <section className={cn("panel grid shrink-0 overflow-hidden", className)} style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}>
      {Array.from({ length: cells }, (_, i) => (
        <div key={i} className={cn("min-w-0 px-[18px] py-3.5", i > 0 && "shadow-[inset_1px_0_0_var(--border)]")}>
          <TextBone className="text-[12.5px]" w="w-20" />
          <TextBone className={cn("figure mt-1 leading-tight", size === "lg" ? "text-[26px]" : "text-2xl")} w="w-24" />
          {notes && <TextBone className="mt-1 text-xs" w="w-28" />}
        </div>
      ))}
    </section>
  );
}

/**
 * Table-ish rows split by row dividers. `row` sets each row's height and grid (copy the real row's classes);
 * `cells` are the bars' widths, one per column ("" leaves a column empty).
 */
export function SkeletonRows({ count, row, cells, className }: { count: number; row: string; cells: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-col", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn("items-center border-b border-row px-4 last:border-b-0", row)}>
          {cells.map((w, j) => (w ? <Bone key={j} className={cn("h-3 rounded-[4px]", w)} /> : <span key={j} />))}
        </div>
      ))}
    </div>
  );
}

/** A chart's plot area: faint gridlines, no pulse, so a big empty chart doesn't flash. */
export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex min-h-0 flex-col justify-between py-1", className)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="block border-t border-row" />
      ))}
    </div>
  );
}

/** A round pill: FilterChip, Segmented, Button and Pill all use `rounded-full`; pass their height and a width. */
export function SkeletonPill({ className }: { className?: string }) {
  return <Bone className={cn("h-8 shrink-0 rounded-full", className)} />;
}
