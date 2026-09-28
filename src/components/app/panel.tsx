import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// Building blocks for the redesigned pages. An outlined panel is card-colored with a 1px ring, radius 14, no
// shadow; its header is 44px with a divider. A plain panel is a section of the page: no ring, no fill, no header
// divider, set apart by its title and the space around it. Rows in dense tables are split by row dividers.

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

/** The panel header: a text-emph (15px) title, an optional count, and whatever sits on the right. 44px over a divider on an outlined panel, 40px and no divider on a plain one. */
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
    <div className={cn("flex h-11 shrink-0 items-center gap-2 border-b px-4 group-data-[variant=plain]/panel:h-10 group-data-[variant=plain]/panel:border-b-0", className)}>
      <h2 className="text-emph font-semibold whitespace-nowrap">{title}</h2>
      {count !== undefined && count !== null && <CountChip hot={hot}>{count}</CountChip>}
      {children}
      <span className="flex-1" />
      {aside && <div className="flex min-w-0 items-center gap-2 text-body whitespace-nowrap text-muted-foreground">{aside}</div>}
    </div>
  );
}

/** A panel's footer band (no divider or fill on a plain panel). */
export function PanelFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex min-h-10 shrink-0 items-center gap-3 border-t bg-band-2 px-4 py-2 text-body text-muted-foreground group-data-[variant=plain]/panel:border-t-0 group-data-[variant=plain]/panel:bg-transparent", className)}>{children}</div>;
}

/** A small mono count chip: pink when it's Hoot's or needs action, neutral otherwise. */
export function CountChip({ hot, className, children }: { hot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-full px-[7px] py-px font-mono text-caption font-medium", hot ? "bg-hoot text-hoot-foreground" : "bg-muted text-muted-foreground", className)}>
      {children}
    </span>
  );
}

export type StatCell = {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  /** Colors the figure. */
  tone?: "up" | "down" | "hoot" | null;
};

/** One panel split into equal cells: label, a big mono figure, a note. */
export function StatStrip({ cells, className, ...props }: { cells: StatCell[]; className?: string } & Omit<React.ComponentProps<"section">, "children">) {
  return (
    <section className={cn("panel grid shrink-0 overflow-hidden", className)} style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }} {...props}>
      {cells.map((c, i) => (
        <div key={i} className={cn("min-w-0 px-[18px] py-3.5", i > 0 && "shadow-[inset_1px_0_0_var(--border)]")}>
          <div className="truncate text-body text-muted-foreground">{c.label}</div>
          <div
            className={cn(
              "figure mt-1 truncate text-display leading-tight",
              c.tone === "up" && "text-up",
              c.tone === "down" && "text-down",
              c.tone === "hoot" && "text-hoot-foreground",
            )}
          >
            {c.value}
          </div>
          {c.note && <div className="mt-1 truncate text-caption text-muted-foreground">{c.note}</div>}
        </div>
      ))}
    </section>
  );
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
    "flex h-7 items-center rounded-full px-3 text-body whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    mono && "font-mono text-body",
    active ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(60,40,20,.08)]" : "text-muted-foreground hover:text-foreground",
  );
}

/**
 * A round segmented control: one choice out of a few that changes how the same data is shown. Link segments mark the
 * chosen one `aria-current`; button segments are toggle buttons (`aria-pressed`). `children` go after the segments,
 * for a segment that opens something (Custom period).
 */
export function Segmented({ segments, className, mono, label, children }: { segments: Segment[]; className?: string; mono?: boolean; label: string; children?: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex shrink-0 items-center rounded-full bg-muted p-0.5", className)}>
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
              className={cn(cls, s.disabled && "cursor-not-allowed text-muted-foreground/60 hover:text-muted-foreground/60")}
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
  hoot: "bg-hoot text-hoot-foreground",
  caution: "bg-caution text-caution-foreground",
  good: "bg-good text-good-foreground",
  neutral: "bg-muted text-ink-2",
  ink: "bg-primary text-primary-foreground",
  info: "bg-[color-mix(in_oklch,var(--series-1)_16%,var(--card))] text-series-1",
};

/**
 * A status pill: 22px, fully round. Pink is only for something Hoot found or wrote, or that is overdue for the
 * reader; caution for due/missing; good for done; neutral for everything else.
 */
export function Pill({ tone = "neutral", className, children, title }: { tone?: PillTone; className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex h-[22px] shrink-0 items-center rounded-full px-[9px] text-caption font-medium whitespace-nowrap", PILL[tone], className)}>
      {children}
    </span>
  );
}

/**
 * A filter chip with a count, e.g. "Needs attention 5": narrows a list. The chosen one is primary. A link chip (the
 * filter lives in the URL) marks itself `aria-current`; a button chip is a toggle button (`aria-pressed`). A row of
 * them goes in a `FilterChips` group.
 */
export function FilterChip({ href, onClick, active, count, title, children }: { href?: string; onClick?: () => void; active: boolean; count?: React.ReactNode; title?: string; children: React.ReactNode }) {
  const cls = cn(
    "inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-body font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    active ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-card text-foreground shadow-[0_0_0_1px_var(--border)] hover:shadow-[0_0_0_1px_var(--border-strong)]",
  );
  const body = (
    <>
      {children}
      {count !== undefined && count !== null && <span className={cn("font-mono text-caption", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>}
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
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-2", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * The way up: "← Holdings", "← Calendar", "← Attribution". It sits in the app header in place of the section title
 * (nav.ts backFor), so a page shows at most one, always in the same spot.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <Link href={href} className="group flex items-center gap-1.5 text-title font-semibold tracking-[-0.015em] whitespace-nowrap focus-visible:underline focus-visible:outline-none">
        <ArrowLeft className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
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
