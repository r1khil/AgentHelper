import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { InfoTip } from "../attribution/info-tip";

/** A headline risk number: label with its explainer, the value, a one-line reading, and (in transparency mode) its working. */
export function StatCard({ label, explain, value, caption, working, className }: { label: string; explain: string; value: React.ReactNode; caption?: React.ReactNode; working?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-2 p-4", className)}>
      <div className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
        <InfoTip label={label}>{explain}</InfoTip>
      </div>
      <div className="tnum text-3xl font-semibold tracking-tight">{value}</div>
      {caption && <div className="text-sm text-muted-foreground">{caption}</div>}
      {working && <div className="mt-auto pt-1">{working}</div>}
    </Card>
  );
}

/** A secondary number in the strip under the headline cards. */
export function MiniStat({ label, explain, value, caption }: { label: string; explain: string; value: React.ReactNode; caption?: React.ReactNode }) {
  return (
    <div className="grid content-start gap-0.5 px-4 py-3">
      <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {label}
        <InfoTip label={label}>{explain}</InfoTip>
      </div>
      <div className="tnum text-lg font-semibold">{value}</div>
      {caption && <div className="text-xs text-muted-foreground">{caption}</div>}
    </div>
  );
}
