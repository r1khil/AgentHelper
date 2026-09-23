import { cn } from "@/lib/utils";

/** Left-anchored magnitude bar. `value` and `max` share a unit; the width is their ratio. */
export function MagnitudeBar({ value, max, color = "var(--series-1)", align = "start", className }: { value: number | null; max: number; color?: string; align?: "start" | "end"; className?: string }) {
  const width = value === null || max <= 0 ? 0 : Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div className={cn("flex h-2 overflow-hidden rounded-full bg-muted", align === "end" && "justify-end", className)} aria-hidden>
      <div className="rounded-full" style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

/** Bar drawn either side of a centre line: positive grows right in the up colour, negative left in the down colour. */
export function DivergingBar({ value, max, className }: { value: number | null; max: number; className?: string }) {
  const width = value === null || max <= 0 ? 0 : Math.min(100, (Math.abs(value) / max) * 100);
  const positive = (value ?? 0) > 0;
  return (
    <div className={cn("flex h-2 items-stretch", className)} aria-hidden>
      <div className="flex w-1/2 justify-end">{!positive && width > 0 && <div className="rounded-l-sm bg-down" style={{ width: `${width}%` }} />}</div>
      <div className="flex w-1/2 border-l border-border">{positive && width > 0 && <div className="rounded-r-sm bg-up" style={{ width: `${width}%` }} />}</div>
    </div>
  );
}

/** Column in the effects waterfall: height is proportional to the value, colour to its sign. */
export function EffectColumn({ value, max, neutral, className }: { value: number | null; max: number; neutral?: boolean; className?: string }) {
  const height = value === null || max <= 0 ? 0 : Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div className={cn("flex h-16 flex-col justify-end", className)} aria-hidden>
      <div
        className={cn("rounded-t-md", neutral ? "bg-foreground" : (value ?? 0) < 0 ? "bg-down" : "bg-up")}
        style={{ height: `${Math.max(height, value === null ? 0 : 2)}%` }}
      />
    </div>
  );
}
