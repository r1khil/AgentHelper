import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ETF_BY_SECTOR } from "@/lib/attribution/sectors";
import type { SectorRisk } from "@/lib/risk/model";
import { DivergingBar, MagnitudeBar } from "../attribution/bars";
import { Explained } from "../attribution/info-tip";
import { Move } from "../move";
import { RISK_EXPLAIN } from "./explainers";
import { rpct } from "./format";

/**
 * Sector weights against the benchmark, and where total and active risk come from. Rows render in the order given.
 * `activeFirst` puts the active-weight column beside the sector name (so it stays on screen on a phone), and
 * `balance` adds a footer with the sums of over- and underweights (they cancel, which checks the table).
 */
export function SectorExposure({ sectors, benchmarkLabel, activeFirst = false, balance }: {
  sectors: SectorRisk[];
  benchmarkLabel: string;
  activeFirst?: boolean;
  balance?: { overweight: number | null; underweight: number | null };
}) {
  const hasBench = sectors.some((s) => s.benchWeight !== null);
  const maxWeight = Math.max(...sectors.flatMap((s) => [s.weight, s.benchWeight ?? 0]), 0);
  const maxActive = Math.max(...sectors.map((s) => Math.abs(s.active ?? 0)), 0);
  const maxRisk = Math.max(...sectors.map((s) => Math.abs(s.riskShare)), 0);

  const weightHead = (
    <TableHead key="weight">
      <Explained label="Weight">{RISK_EXPLAIN.sectorWeight}</Explained>
      {hasBench && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">Fund · {benchmarkLabel}</span>}
    </TableHead>
  );
  const activeHead = hasBench && <TableHead key="active" className="text-right"><Explained align="right" label="Active">{RISK_EXPLAIN.activeWeight}</Explained></TableHead>;
  const weightCell = (s: SectorRisk) => (
    <TableCell key="weight">
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <MagnitudeBar value={s.weight} max={maxWeight} className="h-1.5 w-20" />
          <span className="tnum w-12 text-xs">{rpct(s.weight)}</span>
        </div>
        {s.benchWeight !== null && (
          <div className="flex items-center gap-2">
            <MagnitudeBar value={s.benchWeight} max={maxWeight} color="var(--muted-foreground)" className="h-1.5 w-20" />
            <span className="tnum w-12 text-xs text-muted-foreground">{rpct(s.benchWeight)}</span>
          </div>
        )}
      </div>
    </TableCell>
  );
  const activeCell = (s: SectorRisk) =>
    hasBench && (
      <TableCell key="active">
        <div className="flex items-center justify-end gap-2.5">
          <DivergingBar value={s.active} max={maxActive} className="w-12" />
          <Move value={s.active === null ? null : s.active * 100} unit=" pp" digits={1} className="w-16 text-right" />
        </div>
      </TableCell>
    );
  const order = <T,>(weight: T, active: T) => (activeFirst ? [active, weight] : [weight, active]);

  return (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sector</TableHead>
            {order(weightHead, activeHead)}
            <TableHead className="text-right"><Explained align="right" label="Share of risk">{RISK_EXPLAIN.riskShare}</Explained></TableHead>
            {hasBench && <TableHead className="text-right"><Explained align="right" label="Share of active risk">{RISK_EXPLAIN.activeRiskShare}</Explained></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sectors.map((s) => {
            const etf = s.key !== "cash" && s.key !== "unclassified" ? ETF_BY_SECTOR[s.key] : null;
            return (
              <TableRow key={s.key}>
                <TableCell className="font-medium">
                  {s.label}
                  {etf && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{etf}</span>}
                  {s.tickers.length > 0 && <div className="max-w-64 truncate text-[11px] font-normal text-muted-foreground" title={s.tickers.join(", ")}>{s.tickers.join(" · ")}</div>}
                </TableCell>
                {order(weightCell(s), activeCell(s))}
                <TableCell>
                  <div className="flex items-center justify-end gap-2.5">
                    <MagnitudeBar value={s.riskShare} max={maxRisk} color={s.riskShare < 0 ? "var(--down)" : "var(--series-1)"} className="h-1.5 w-14" />
                    <span className="tnum w-12 text-right text-sm">{rpct(s.riskShare)}</span>
                  </div>
                </TableCell>
                {hasBench && <TableCell className="tnum text-right text-sm">{rpct(s.activeRiskShare)}</TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
        {hasBench && balance && balance.overweight !== null && (
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium"><Explained label="Over and under">{RISK_EXPLAIN.overUnder}</Explained></TableCell>
              {order(
                <TableCell key="weight" className="tnum text-xs text-muted-foreground">{rpct(sectors.reduce((s, x) => s + x.weight, 0))} · {rpct(sectors.reduce((s, x) => s + (x.benchWeight ?? 0), 0))}</TableCell>,
                <TableCell key="active" className="text-right text-xs">
                  <div className="grid justify-end gap-0.5 whitespace-nowrap">
                    <span>overweights <Move value={balance.overweight * 100} unit=" pp" digits={1} /></span>
                    <span>underweights <Move value={(balance.underweight ?? 0) * 100} unit=" pp" digits={1} /></span>
                  </div>
                </TableCell>,
              )}
              <TableCell />
              <TableCell />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </Card>
  );
}
