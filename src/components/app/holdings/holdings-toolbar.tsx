import { FilterChip, FilterChips } from "@/components/app/panel";
import { fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const HOLDING_FILTERS = ["all", "attention", "reporting"] as const;
export type HoldingFilter = (typeof HOLDING_FILTERS)[number];

const LABELS: Record<HoldingFilter, string> = {
  all: "All holdings",
  attention: "Needs attention",
  reporting: "Reporting in 2 weeks",
};

export function parseHoldingFilter(v: string | string[] | undefined): HoldingFilter {
  const s = Array.isArray(v) ? v[0] : v;
  return (HOLDING_FILTERS as readonly string[]).includes(s ?? "") ? (s as HoldingFilter) : "all";
}

/** Filter chips (links, `?filter=`) on the left; the market line and "Add holding" on the right. */
export function HoldingsToolbar({ basePath, active, counts, aside }: { basePath: string; active: HoldingFilter; counts: Record<HoldingFilter, number>; aside?: React.ReactNode }) {
  return (
    <div data-tour="holdings-filters" className="flex shrink-0 flex-wrap items-center gap-2">
      <FilterChips label="Filter holdings">
        {HOLDING_FILTERS.map((f) => (
          <FilterChip
            key={f}
            href={f === "all" ? basePath : `${basePath}?filter=${f}`}
            active={active === f}
            count={<span className={cn(f === "attention" && active !== f && counts.attention > 0 && "text-hoot-foreground")}>{counts[f]}</span>}
          >
            {LABELS[f]}
          </FilterChip>
        ))}
      </FilterChips>
      <span className="flex-1" />
      {aside}
    </div>
  );
}

/** "S&P 500 0.59% Friday · market closed". */
export function MarketLine({ changePct, day, closed, error }: { changePct?: number; day?: string; closed?: boolean; error?: string }) {
  if (changePct == null) return <span className="text-body whitespace-nowrap text-muted-foreground">{error ?? "S&P 500 quote unavailable"}</span>;
  return (
    <span className="text-body whitespace-nowrap text-muted-foreground">
      S&amp;P 500{" "}
      <span className={cn("font-mono", changePct > 0.005 ? "text-up" : changePct < -0.005 ? "text-down" : "")}>
        {fmtPct(changePct)}
      </span>{" "}
      {day}
      {closed ? " · market closed" : ""}
    </span>
  );
}
