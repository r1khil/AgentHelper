import { Card } from "@/components/ui/card";
import { Move } from "../move";
import { MagnitudeBar } from "./bars";
import { bps, pct } from "./format";
import { InfoTip } from "./info-tip";

export type ReturnBar = { label: string; value: number | null; color?: string };

/**
 * Headline card: the active return in basis points, with the two returns behind it drawn to the
 * same scale. `active` and the bar values are fractions; a null value keeps the Move dash.
 */
export function ActiveReturnCard({ title, chip, active, explain, comparison = "the benchmark", bars }: { title: string; chip?: string; active: number | null; explain?: string; comparison?: string; bars: ReturnBar[] }) {
  const max = Math.max(...bars.map((b) => Math.abs(b.value ?? 0)), 0);
  const caption = active === null ? null : active > 0 ? `ahead of ${comparison}` : active < 0 ? `behind ${comparison}` : `level with ${comparison}`;
  return (
    <Card className="gap-4 p-5 lg:col-span-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
          {explain && <InfoTip label={title}>{explain}</InfoTip>}
        </div>
        {chip && <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">{chip}</span>}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <Move value={bps(active)} unit=" bps" digits={0} className="text-4xl font-semibold tracking-tight" />
        {caption && <span className="text-sm text-muted-foreground">{caption}</span>}
      </div>
      <div className="grid gap-2">
        {bars.map((b) => (
          <div key={b.label} className="grid grid-cols-[minmax(0,7rem)_1fr_4.5rem] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground">{b.label}</span>
            <MagnitudeBar value={b.value} max={max} color={b.color} className="h-2.5" />
            <Move value={pct(b.value)} unit="%" digits={2} className="text-right font-semibold" />
          </div>
        ))}
      </div>
    </Card>
  );
}
