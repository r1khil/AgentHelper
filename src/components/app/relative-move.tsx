import { cn } from "@/components/utils";

/**
 * Colour is never the only channel here: the explicit +/- sign carries the
 * same information for anyone who cannot distinguish the two hues, or is
 * reading a printout. Do not remove the sign.
 */
export function RelativeMove({
  value,
  unit,
  className,
}: {
  value: string | number;
  unit?: string;
  className?: string;
}) {
  const n = Number(value);
  const tone =
    n > 0 ? "text-move-up" : n < 0 ? "text-move-down" : "text-move-flat";

  return (
    <span className={cn("font-serif tabular-nums", tone, className)}>
      {n > 0 ? "+" : ""}
      {n.toFixed(2)}
      {unit && (
        <span className="text-muted-foreground ml-1 text-[11px] font-sans">
          {unit}
        </span>
      )}
    </span>
  );
}
