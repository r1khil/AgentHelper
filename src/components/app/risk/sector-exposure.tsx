import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CenterBar, PairBars, Signed } from "@/components/app/portfolio/parts";
import { ETF_BY_SECTOR } from "@/lib/attribution/sectors";
import { fmtChangeBp } from "@/lib/format";
import type { SectorRisk } from "@/lib/risk/model";
import { Tip } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "./explainers";
import { rpct } from "./format";

const head = "text-caption first:pl-0 last:pr-0";

/**
 * Sector weights against the benchmark, and where total and active risk come from. Rows render in the order given.
 * `balance` adds a footer with the sums of over- and underweights (they cancel, which checks the table).
 */
export function SectorExposure({
  sectors,
  benchmarkLabel,
  balance,
  hideRisk = false,
  rowNote,
}: {
  sectors: SectorRisk[];
  benchmarkLabel: string;
  balance?: { overweight: number | null; underweight: number | null };
  /** Drop the risk-share columns (the look-through view: risk is measured on ETFs as held). */
  hideRisk?: boolean;
  /** A short line under a sector's name. */
  rowNote?: (key: SectorRisk["key"]) => string | null;
}) {
  const hasBench = sectors.some((s) => s.benchWeight !== null);
  const maxWeight = Math.max(...sectors.flatMap((s) => [s.weight, s.benchWeight ?? 0]), 0);
  const maxActive = Math.max(...sectors.map((s) => Math.abs(s.active ?? 0)), 0);

  return (
    <div className="overflow-x-auto">
      <Table aria-label="Sector exposure and share of risk">
        <TableHeader>
          <TableRow>
            <TableHead className={head}>Sector</TableHead>
            <TableHead className={head}>
              <Tip label="Weight" side="bottom">{RISK_EXPLAIN.sectorWeight}</Tip>
              {hasBench && <span className="ml-1.5 text-caption font-normal text-muted-foreground">Fund, {benchmarkLabel}</span>}
            </TableHead>
            {hasBench && <TableHead className={`${head} text-right`}><Tip label="Active" side="bottom">{RISK_EXPLAIN.activeWeight}</Tip></TableHead>}
            {!hideRisk && <TableHead className={`${head} text-right`}><Tip label="Share of risk" side="bottom">{RISK_EXPLAIN.riskShare}</Tip></TableHead>}
            {!hideRisk && hasBench && <TableHead className={`${head} text-right`}><Tip label="Share of active risk" side="bottom">{RISK_EXPLAIN.activeRiskShare}</Tip></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sectors.map((s) => {
            const etf = s.key !== "cash" && s.key !== "unclassified" ? ETF_BY_SECTOR[s.key] : null;
            const note = rowNote?.(s.key);
            return (
              <TableRow key={s.key}>
                <TableCell className="font-semibold first:pl-0">
                  {s.label}
                  {etf && <span className="ml-1 text-caption font-normal text-muted-foreground">{etf}</span>}
                  {/* Every holding in the sector, wrapping rather than cut off. */}
                  {s.tickers.length > 0 && <div className="max-w-64 text-caption font-normal whitespace-normal text-muted-foreground">{s.tickers.join(", ")}</div>}
                  {note && <div className="max-w-64 text-caption font-normal text-muted-foreground italic">{note}</div>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <PairBars a={s.benchWeight ?? 0} b={s.weight} max={maxWeight} className="w-24" />
                    <span className="grid text-body leading-4">
                      <span className="font-semibold">{rpct(s.weight)}</span>
                      {s.benchWeight !== null && <span className="text-muted-foreground">{rpct(s.benchWeight)}</span>}
                    </span>
                  </div>
                </TableCell>
                {hasBench && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-2.5">
                      <CenterBar value={s.active} max={maxActive} className="w-16" />
                      <Signed text={s.active === null ? "—" : fmtChangeBp(s.active * 10_000)} className="w-20 text-right font-semibold" />
                    </div>
                  </TableCell>
                )}
                {!hideRisk && <TableCell className="text-right font-semibold">{rpct(s.riskShare)}</TableCell>}
                {!hideRisk && hasBench && <TableCell className="text-right last:pr-0">{rpct(s.activeRiskShare)}</TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
        {hasBench && balance && balance.overweight !== null && (
          <TableFooter className="bg-transparent">
            <TableRow>
              <TableCell className="font-semibold first:pl-0"><Tip label="Over and under">{RISK_EXPLAIN.overUnder}</Tip></TableCell>
              <TableCell className="text-muted-foreground">{rpct(sectors.reduce((s, x) => s + x.weight, 0))}, {rpct(sectors.reduce((s, x) => s + (x.benchWeight ?? 0), 0))}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <div className="grid justify-end gap-0.5">
                  <span>overweights <Signed text={fmtChangeBp(balance.overweight * 10_000)} /></span>
                  <span>underweights <Signed text={fmtChangeBp((balance.underweight ?? 0) * 10_000)} /></span>
                </div>
              </TableCell>
              {!hideRisk && <TableCell />}
              {!hideRisk && <TableCell />}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
