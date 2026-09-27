import { cn } from "@/lib/utils";

/** Signed number colored by direction. `unit` is appended (e.g. "pp" or "%"). */
export function Move({ value, unit = "", digits = 1, className }: { value: number | string | null | undefined; unit?: string; digits?: number; className?: string }) {
  if (value === null || value === undefined || value === "") return <span className={cn("text-muted-foreground", className)}>—</span>;
  const n = Number(value);
  const tone = n > 0.005 ? "text-up" : n < -0.005 ? "text-down" : "text-muted-foreground";
  return (
    <span className={cn("font-mono tnum", tone, className)}>
      {n > 0 ? "+" : ""}
      {n.toFixed(digits)}
      {unit}
    </span>
  );
}
