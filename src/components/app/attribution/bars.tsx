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
      <div className="flex w-1/2 justify-end">{!positive && width > 0 && <div className="rounded-l-[3px] bg-down/75" style={{ width: `${width}%` }} />}</div>
      <div className="flex w-1/2 border-l border-muted-foreground/40">{positive && width > 0 && <div className="rounded-r-[3px] bg-up/75" style={{ width: `${width}%` }} />}</div>
    </div>
  );
}
