import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// Building blocks for every page. Hairlines, not boxes: a plain panel is a section of the page, set apart by its
// 17px title and the space around it; an outlined panel is an object you act on (a table, an editor), framed by a
// 1px hairline. Rows are split by #F4F4F5 row dividers, headers by #EDEDED section dividers.

export type PanelVariant = "outlined" | "plain";

/**
 * A panel. Outlined (the default) is for something that is its own object: a table whose frame groups its rows,
 * a card you act on, an editor. Plain is for a section of the page that only needs its title.
 * A panel takes its content's height. Only a full-height workspace (a list that scrolls inside the viewport) should
 * add `flex-1 min-h-0` to fill the rest of a column.
 */
export function Panel({ className, children, variant = "outlined", ...props }: React.ComponentProps<"section"> & { variant?: PanelVariant }) {
  return (
    <section data-variant={variant} className={cn("group/panel flex min-w-0 flex-col overflow-hidden", variant === "outlined" ? "panel" : "panel-plain", className)} {...props}>
      {children}
    </section>
  );
}

/** The panel header: a 17px bold title, an optional count, and whatever sits on the right. 44px over a hairline on an outlined panel; on a plain one the title sits flush with the page edge. */
export function PanelHeader({
  title,
  count,
  hot,
  aside,
  className,
  children,
}: {
  title: React.ReactNode;
  count?: React.ReactNode;
  /** The count is something Hoot found or that needs action (pink). */
  hot?: boolean;
  /** Right-aligned: a meta line, a link or a button. */
  aside?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex h-11 shrink-0 items-center gap-2 border-b px-4 group-data-[variant=plain]/panel:h-10 group-data-[variant=plain]/panel:border-b-0 group-data-[variant=plain]/panel:px-0", className)}>
      <h2 className="text-title font-bold tracking-[-0.01em] whitespace-nowrap">{title}</h2>
      {count !== undefined && count !== null && <CountChip hot={hot}>{count}</CountChip>}
      {children}
      <span className="flex-1" />
      {aside && <div className="flex min-w-0 items-center gap-2 text-body whitespace-nowrap text-muted-foreground">{aside}</div>}
    </div>
  );
}

/** A panel's footer band (no divider or fill on a plain panel). */
export function PanelFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex min-h-10 shrink-0 items-center gap-3 border-t px-4 py-2 text-caption text-muted-foreground group-data-[variant=plain]/panel:border-t-0 group-data-[variant=plain]/panel:px-0", className)}>{children}</div>;
}

/** A count beside a title or tab: plain 12px figures, red when something is overdue or needs action, grey otherwise. */
export function CountChip({ hot, className, children }: { hot?: boolean; className?: string; children: React.ReactNode }) {
  return <span className={cn("text-caption font-semibold tabular-nums", hot ? "text-down" : "text-muted-foreground", className)}>{children}</span>;
}

export type StatCell = {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  /** Colors the figure. */
  tone?: "up" | "down" | "hoot" | null;
  /** The cell opens the page it summarises (Overview's stats open their tab). */
  href?: string;
};

/**
 * Dividers for a strip that wraps: two cells a row while narrow (a left rule on the second of each pair, a top rule
 * from the second row on), one row once the strip is 36rem wide. Literal classes, so Tailwind sees each one.
 */
const WRAP_DIVIDERS = {
  left: "shadow-[inset_1px_0_0_var(--border)]",
  topThenLeft: "shadow-[inset_0_1px_0_var(--border)] @min-[36rem]/strip:shadow-[inset_1px_0_0_var(--border)]",
  cornerThenLeft: "shadow-[inset_1px_1px_0_var(--border)] @min-[36rem]/strip:shadow-[inset_1px_0_0_var(--border)]",
} as const;
export const wrapDivider = (i: number) =>
  i === 0 ? undefined : i % 2 === 1 ? (i > 1 ? WRAP_DIVIDERS.cornerThenLeft : WRAP_DIVIDERS.left) : WRAP_DIVIDERS.topThenLeft;

/** The grid classes and style for a strip of `count` equal cells; `wrap` goes two a row below 36rem (see wrapDivider). */
export function stripGrid(count: number, wrap?: boolean) {
  const cols = `repeat(${count}, minmax(0, 1fr))`;
  return wrap
    ? { className: "grid-cols-2 @min-[36rem]/strip:grid-cols-(--strip-cols)", style: { "--strip-cols": cols } as React.CSSProperties }
    : { className: undefined, style: { gridTemplateColumns: cols } };
}

/**
 * A strip of equal cells between two hairlines: a grey label, a 17px figure, a grey note. No boxes and no dividers
 * between cells. The cells share their three rows (subgrid), so a two-line label keeps every figure on one line.
 * `wrap` (an even number of cells) puts two cells a row while the strip is narrower than 36rem.
 */
export function StatStrip({ cells, className, wrap, ...props }: { cells: StatCell[]; className?: string; wrap?: boolean } & Omit<React.ComponentProps<"section">, "children">) {
  const grid = stripGrid(cells.length, wrap);
  const strip = (
    <section className={cn("grid shrink-0 gap-x-4 border-y py-[18px]", grid.className, className)} style={grid.style} {...props}>
      {cells.map((c, i) => {
        const cls = cn("row-span-3 grid min-w-0 grid-rows-subgrid gap-y-[3px]", c.href && "group/cell rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring");
        const body = (
          <>
            <div className="self-end text-caption text-muted-foreground group-hover/cell:text-foreground">{c.label}</div>
            <div className={cn("figure truncate text-title", c.tone === "up" && "text-up", c.tone === "down" && "text-down", c.tone === "hoot" && "text-hoot-foreground")}>{c.value}</div>
            {c.note && <div className="text-caption text-muted-foreground">{c.note}</div>}
          </>
        );
        return c.href ? (
          <Link key={i} href={c.href} className={cls}>
            {body}
          </Link>
        ) : (
          <div key={i} className={cls}>
            {body}
          </div>
        );
      })}
    </section>
  );
  return wrap ? <div className="@container/strip min-w-0 shrink-0">{strip}</div> : strip;
}

/*
 * The page controls. Each has one job, and one look wherever it's used:
 * - Tabs (`tabs.tsx`): move between views of one thing (a section's pages, a holding's sections, the ledger's tables).
 * - Segmented: switch the mode or period of the same data (1D/1W/…, Week/Month/List, Top & bottom 5 / All).
 * - FilterChip: narrow a list to the rows that match (Holdings' and Research's filters, release importance).
 * - BackLink: the one way up from a page about one item or a sub-page to the list or page it belongs to.
 */

export type Segment = {
  key: string;
  label: React.ReactNode;
  /** A link segment (the choice lives in the URL); otherwise a button calling `onClick`. */
  href?: string;
  onClick?: () => void;
  active: boolean;
  title?: string;
  /** Names an icon-only segment. */
  ariaLabel?: string;
  /** Shown but not choosable; `title` should say why. */
  disabled?: boolean;
};

/** One segment's look, for a segment that has to be its own element (a popover trigger). */
export function segmentClass(active: boolean, mono?: boolean) {
  return cn(
    "flex h-7 items-center rounded-lg px-2.5 text-body font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    mono && "tabular-nums",
    active ? "bg-primary text-primary-foreground" : "text-ink-3 hover:bg-secondary hover:text-foreground",
  );
}

/**
 * A row of range buttons (1D 1W 1M 3M 1Y All): one choice out of a few that changes how the same data is shown. The
 * chosen one is filled ink; the rest are bare words. Link segments mark the chosen one `aria-current`; button segments
 * are toggle buttons (`aria-pressed`). `children` go after the segments, for a segment that opens something.
 */
export function Segmented({ segments, className, mono, label, children }: { segments: Segment[]; className?: string; mono?: boolean; label: string; children?: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex shrink-0 items-center gap-0.5", className)}>
      {segments.map((s) => {
        const cls = segmentClass(s.active, mono);
        // Disabled, or the only choice there is: shown, not a control.
        if (s.disabled || (!s.href && !s.onClick)) {
          return (
            <span
              key={s.key}
              aria-disabled={s.disabled || undefined}
              aria-current={s.active ? "true" : undefined}
              aria-label={s.ariaLabel}
              title={s.title}
              className={cn(cls, s.disabled && "cursor-not-allowed text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground/60")}
            >
              {s.label}
            </span>
          );
        }
        return s.href ? (
          <Link key={s.key} href={s.href} aria-current={s.active ? "true" : undefined} aria-label={s.ariaLabel} title={s.title} className={cls} scroll={false}>
            {s.label}
          </Link>
        ) : (
          <button key={s.key} type="button" aria-pressed={s.active} aria-label={s.ariaLabel} title={s.title} onClick={s.onClick} className={cls}>
            {s.label}
          </button>
        );
      })}
      {children}
    </div>
  );
}

export type PillTone = "hoot" | "caution" | "good" | "neutral" | "ink" | "info";

const PILL: Record<PillTone, string> = {
  hoot: "text-down",
  caution: "text-caution-foreground",
  good: "text-muted-foreground",
  neutral: "text-ink-2",
  ink: "text-foreground",
  info: "text-foreground",
};

/**
 * A status word, never a colour alone and never a filled shape: 12px semibold. Red (`hoot`) is overdue for the
 * reader and nothing else; amber (`caution`) is check this: stale, held, missing, failed; grey for done, locked,
 * estimated and everything else.
 */
export function Pill({ tone = "neutral", className, children, title }: { tone?: PillTone; className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex shrink-0 items-center text-caption font-semibold whitespace-nowrap", PILL[tone], className)}>
      {children}
    </span>
  );
}

/**
 * A filter, e.g. "Needs attention · 3": narrows a list. The chosen one is filled ink, the rest are bare words, the
 * same look as the range buttons. A link chip (the filter lives in the URL) marks itself `aria-current`; a button chip
 * is a toggle button (`aria-pressed`). A row of them goes in a `FilterChips` group.
 */
export function FilterChip({ href, onClick, active, count, title, children }: { href?: string; onClick?: () => void; active: boolean; count?: React.ReactNode; title?: string; children: React.ReactNode }) {
  const cls = segmentClass(active);
  const body = (
    <>
      {children}
      {count !== undefined && count !== null && <span className="ml-1 tabular-nums">· {count}</span>}
    </>
  );
  return href ? (
    <Link href={href} scroll={false} title={title} aria-current={active ? "true" : undefined} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" title={title} aria-pressed={active} onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

/** A labelled row of filter chips. */
export function FilterChips({ label, className, children, ...props }: { label: string; className?: string; children: React.ReactNode } & Omit<React.ComponentProps<"div">, "children">) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-1", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * The way up from a page about one item or a sub-page: "← Holdings". Pages in the new look say where they are with
 * PageHead's breadcrumbs instead; this remains for a page that has not moved to PageHead yet.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <Link href={href} className="group flex items-center gap-1.5 text-body whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:underline focus-visible:outline-none">
        <ArrowLeft className="size-3.5" />
        <span className="sr-only">Back to </span>
        {label}
      </Link>
    </nav>
  );
}

/** Small uppercase mono label, e.g. MON 28 SEP. */
export function MonoLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("label-mono text-muted-foreground", className)}>{children}</div>;
}

/** A column that fills the content area under the header; children with `flex-1 min-h-0` stretch to the bottom. */
export function PageFill({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex min-h-0 flex-1 flex-col gap-5", className)}>{children}</div>;
}
