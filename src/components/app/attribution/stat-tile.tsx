import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Move } from "../move";

/** One headline figure. `value` is a fraction; shown in percent, or percentage points for effects. */
export function StatTile({ label, value, unit = "%", hint, emphasis }: { label: string; value: number | null; unit?: "%" | "pp"; hint?: string; emphasis?: boolean }) {
  return (
    <Card className={cn("gap-1 p-4", emphasis && "ring-1 ring-foreground/15")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <Move value={value === null ? null : value * 100} unit={unit} digits={2} className={cn("text-xl font-semibold", emphasis && "text-2xl")} />
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
