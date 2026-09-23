import { Card } from "@/components/ui/card";
import { Move } from "../move";
import { EffectColumn } from "./bars";
import { bps, fmtBps } from "./format";
import { InfoTip } from "./info-tip";

export type EffectItem = { label: string; value: number; explain?: string; hint?: string };

/**
 * The active return split into its effects: one column per effect, then the total after a dashed
 * divider. Values are fractions; column heights are proportional to the largest of them.
 */
export function EffectsWaterfall({
  title,
  aside,
  items,
  total,
  empty,
}: {
  title: string;
  aside?: React.ReactNode;
  items: EffectItem[];
  total: EffectItem | null;
  empty?: React.ReactNode;
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), Math.abs(total?.value ?? 0), 0);
  return (
    <Card className="gap-4 p-5 lg:col-span-7">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</div>
        {aside && <div className="text-xs text-muted-foreground">{aside}</div>}
      </div>
      {total === null ? (
        <div className="text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="grid grid-cols-2 items-start gap-4 sm:grid-cols-4">
          {[...items, total].map((item, i) => {
            const isTotal = i === items.length;
            return (
              <div key={item.label} className={isTotal ? "flex flex-col gap-1.5 border-border pl-4 sm:border-l sm:border-dashed" : "flex flex-col gap-1.5"}>
                <EffectColumn value={item.value} max={max} neutral={isTotal} />
                {isTotal ? (
                  <span className="tnum text-lg font-semibold">{fmtBps(item.value, 0)}</span>
                ) : (
                  <Move value={bps(item.value)} unit=" bps" digits={0} className="text-lg font-semibold" />
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {item.label}
                  {item.explain && <InfoTip label={item.label}>{item.explain}</InfoTip>}
                </div>
                {item.hint && <div className="text-[11px] text-muted-foreground/80">{item.hint}</div>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
