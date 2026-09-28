import { Acct } from "@/components/app/accounting";
import { fmtAccounting } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A figure in accounting style, colored by direction: "1.2%" in green, "(40 bp)" in red, a zero muted. `unit` goes
 * inside the parentheses (e.g. " bp" or "%"). `align` keeps a right-aligned column of mixed signs on its digits.
 */
export function Move({ value, unit = "", digits = 1, align = false, className }: { value: number | string | null | undefined; unit?: string; digits?: number; align?: boolean; className?: string }) {
  if (value === null || value === undefined || value === "") return <span className={cn("text-muted-foreground", className)}>—</span>;
  // Color from the figure as shown, so a value that rounds to zero is never green or red.
  const text = fmtAccounting(value, digits);
  const tone = text.startsWith("(") ? "text-down" : /[1-9]/.test(text) ? "text-up" : "text-muted-foreground";
  return (
    <span className={cn("font-mono tnum", tone, className)}>
      <Acct value={value} digits={digits} unit={unit} align={align} />
    </span>
  );
}
