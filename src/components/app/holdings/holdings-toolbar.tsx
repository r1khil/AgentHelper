import { FilterChip, FilterChips } from "@/components/app/panel";
import { fmtChangePct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const HOLDING_FILTERS = ["all", "attention", "reporting"] as const;
export type HoldingFilter = (typeof HOLDING_FILTERS)[number];

const LABELS: Record<HoldingFilter, string> = {
  all: "All",
  attention: "Needs attention",
  reporting: "Reporting in 2 weeks",
};

export function parseHoldingFilter(v: string | string[] | undefined): HoldingFilter {
  const s = Array.isArray(v) ? v[0] : v;
  return (HOLDING_FILTERS as readonly string[]).includes(s ?? "") ? (s as HoldingFilter) : "all";
}

/** "Holdings", the filter chips (links, `?filter=`) beside it, and the market line on the right. */
export function HoldingsToolbar({ basePath, active, counts, aside }: { basePath: string; active: HoldingFilter; counts: Record<HoldingFilter, number>; aside?: React.ReactNode }) {
  return (
    <div data-tour="holdings-filters" className="mt-[22px] flex shrink-0 flex-wrap items-center gap-1">
      <h2 className="mr-3 text-title font-bold tracking-[-0.01em]">Holdings</h2>
      <FilterChips label="Filter holdings">
        {HOLDING_FILTERS.map((f) => (
          <FilterChip key={f} href={f === "all" ? basePath : `${basePath}?filter=${f}`} active={active === f} count={counts[f]}>
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
      <span className={cn(changePct > 0.005 ? "text-up" : changePct < -0.005 ? "text-down" : "")}>{fmtChangePct(changePct)}</span> {day}
      {closed ? " · market closed" : ""}
    </span>
  );
}
