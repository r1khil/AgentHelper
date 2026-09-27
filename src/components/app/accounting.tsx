import { fmtAccounting } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A number in accounting style, colored by direction. Positives carry a hidden ")" so a column of
 * mixed signs lines up on its digits.
 */
export function Accounting({ value, digits = 2, unit = "", tone = true, className }: { value: number | null | undefined; digits?: number; unit?: string; tone?: boolean; className?: string }) {
  const text = fmtAccounting(value, digits, unit);
  const negative = text.startsWith("(");
  const color = !tone || value === null || value === undefined || text === "—" ? "" : negative ? "text-down" : Number(value.toFixed(digits)) > 0 ? "text-up" : "";
  return (
    <span className={cn("font-mono tnum", color, className)}>
      {text}
      {!negative && text !== "—" && <span className="invisible" aria-hidden>)</span>}
    </span>
  );
}
