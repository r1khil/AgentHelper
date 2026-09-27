import { Move } from "../move";
import { DivergingBar } from "./bars";

export type SectorEffectPoint = { sector: string; allocation: number; selection: number; interaction: number; total: number };

/**
 * Total effect per sector in basis points, as a diverging bar list sorted from most helpful to
 * least. Values arrive already in basis points from `sectorEffectPoints`.
 */
export function SectorEffectsList({ data }: { data: SectorEffectPoint[] }) {
  if (!data.length) return <div className="text-sm text-muted-foreground">No effects for this period.</div>;
  const rows = [...data].sort((a, b) => b.total - a.total);
  const max = Math.max(...rows.map((r) => Math.abs(r.total)), 0);
  return (
    <ul className="grid gap-2">
      {rows.map((r) => (
        <li key={r.sector} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-2.5 text-[13px]">
          <span className="truncate text-ink-2" title={r.sector}>{r.sector}</span>
          <DivergingBar value={r.total} max={max} className="h-2.5" />
          <Move value={r.total} unit="" digits={0} className="text-right text-[12.5px] font-semibold" />
        </li>
      ))}
    </ul>
  );
}
