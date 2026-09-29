import { fmtPct } from "@/lib/format";

/** A tiny 64×18 line of the last few closes, green when the stretch is up and vermilion when it's down. */
export function Sparkline({ values, className, period }: { values: number[]; className?: string; /** What the values span, for the accessible name: "5-day" by default, or "Intraday". */ period?: string }) {
  if (values.length < 2) return <span className="text-muted-foreground">—</span>;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // A floor on the range (4% of the level) keeps a quiet week looking quiet instead of stretching noise to full height.
  const mid = (hi + lo) / 2;
  const span = Math.max(hi - lo, Math.abs(mid) * 0.04) || 1;
  const floor = mid - span / 2;
  const step = 64 / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(16 - ((v - floor) / span) * 14).toFixed(1)}`).join(" ");
  const change = values.at(-1)! / values[0] - 1;
  const stroke = change > 0 ? "var(--up-line)" : change < 0 ? "var(--down-line)" : "var(--muted-foreground)";
  return (
    <svg viewBox="0 0 64 18" className={className ?? "h-[18px] w-16"} role="img" aria-label={`${period ?? `${values.length}-day`} change ${fmtPct(change * 100, 1)}`}>
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
