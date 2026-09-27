import Link from "next/link";
import { cn } from "@/lib/utils";

// Building blocks for the redesigned pages. A panel is card-colored with a 1px ring, radius 14, no shadow;
// its header is 44px with a divider; rows are split by lighter row dividers. See the design handoff README.

/** A panel. Add `flex-1 min-h-0` to let it fill the rest of a column. */
export function Panel({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("panel flex min-w-0 flex-col overflow-hidden", className)} {...props}>
      {children}
    </section>
  );
}

/** The 44px panel header: a 14.5px title, an optional count, and whatever sits on the right. */
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
    <div className={cn("flex h-11 shrink-0 items-center gap-2 border-b px-4", className)}>
      <h2 className="text-[14.5px] font-semibold whitespace-nowrap">{title}</h2>
      {count !== undefined && count !== null && <CountChip hot={hot}>{count}</CountChip>}
      {children}
      <span className="flex-1" />
      {aside && <div className="flex min-w-0 items-center gap-2 text-[12.5px] whitespace-nowrap text-muted-foreground">{aside}</div>}
    </div>
  );
}

/** A panel's footer band. */
export function PanelFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex min-h-10 shrink-0 items-center gap-3 border-t bg-band-2 px-4 py-2 text-[12.5px] text-muted-foreground", className)}>{children}</div>;
}

/** A small mono count chip: pink when it's Hoot's or needs action, neutral otherwise. */
export function CountChip({ hot, className, children }: { hot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-full px-[7px] py-px font-mono text-[11px] font-medium", hot ? "bg-hoot text-hoot-foreground" : "bg-muted text-muted-foreground", className)}>
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
export function StatStrip({ cells, className, size = "md" }: { cells: StatCell[]; className?: string; size?: "md" | "lg" }) {
  return (
    <section className={cn("panel grid shrink-0 overflow-hidden", className)} style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
      {cells.map((c, i) => (
        <div key={i} className={cn("min-w-0 px-[18px] py-3.5", i > 0 && "shadow-[inset_1px_0_0_var(--border)]")}>
          <div className="truncate text-[12.5px] text-muted-foreground">{c.label}</div>
          <div
            className={cn(
              "figure mt-1 truncate leading-tight",
              size === "lg" ? "text-[26px]" : "text-2xl",
              c.tone === "up" && "text-up",
              c.tone === "down" && "text-down",
              c.tone === "hoot" && "text-hoot-foreground",
            )}
          >
            {c.value}
          </div>
          {c.note && <div className="mt-1 truncate text-xs text-muted-foreground">{c.note}</div>}
        </div>
      ))}
    </section>
  );
}

export type Segment = { key: string; label: React.ReactNode; href?: string; onClick?: () => void; active: boolean; title?: string };

/** A round segmented control. Segments are links (period switches) or buttons. */
export function Segmented({ segments, className, mono, label }: { segments: Segment[]; className?: string; mono?: boolean; label?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex shrink-0 items-center rounded-full bg-muted p-0.5", className)}>
      {segments.map((s) => {
        const cls = cn(
          "flex h-7 items-center rounded-full px-3 text-[13px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          mono && "font-mono text-xs",
          s.active ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(60,40,20,.08)]" : "text-muted-foreground hover:text-foreground",
        );
        return s.href ? (
          <Link key={s.key} href={s.href} aria-current={s.active ? "true" : undefined} title={s.title} className={cls} scroll={false}>
            {s.label}
          </Link>
        ) : (
          <button key={s.key} type="button" aria-pressed={s.active} title={s.title} onClick={s.onClick} className={cls}>
            {s.label}
          </button>
        );
      })}
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
    <span title={title} className={cn("inline-flex h-[22px] shrink-0 items-center rounded-full px-[9px] text-xs font-medium whitespace-nowrap", PILL[tone], className)}>
      {children}
    </span>
  );
}

/** A filter chip button with a count, e.g. "Needs attention 5". The active one is primary. */
export function FilterChip({ href, active, count, children }: { href: string; active: boolean; count?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13.5px] font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-card text-foreground shadow-[0_0_0_1px_var(--border)] hover:shadow-[0_0_0_1px_var(--border-strong)]",
      )}
    >
      {children}
      {count !== undefined && <span className={cn("font-mono text-[11px]", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>}
    </Link>
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
