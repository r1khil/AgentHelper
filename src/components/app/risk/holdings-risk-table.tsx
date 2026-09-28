import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HoldingRisk } from "@/lib/risk/model";
import { MagnitudeBar } from "../attribution/bars";
import { Explained } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "./explainers";
import { rnum, rpct } from "./format";
import { tickerName } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";

export type TeamNames = Map<string, { name: string; slug: string }>;

/** Holdings ranked by their share of portfolio risk, beside their share of its value. */
export function HoldingsRiskTable({ rows, teams, totals, showActive }: { rows: HoldingRisk[]; teams: TeamNames; totals: { weight: number; vol: number; riskRows: number }; showActive: boolean }) {
  const maxShare = Math.max(...rows.flatMap((h) => [Math.abs(h.riskShare), h.weight]), 0);
  return (
    <Card className="overflow-x-auto p-0">
      <Table aria-label="Holdings by share of risk">
        <TableHeader>
          <TableRow>
            <TableHead>Holding</TableHead>
            <TableHead>
              <Explained label="Weight vs share of risk">{RISK_EXPLAIN.riskShare}</Explained>
            </TableHead>
            <TableHead className="text-right"><Explained align="right" label="Contribution">{RISK_EXPLAIN.contribution}</Explained></TableHead>
            <TableHead className="text-right"><Explained align="right" label="Volatility">{RISK_EXPLAIN.holdingVol}</Explained></TableHead>
            <TableHead className="text-right"><Explained align="right" label="Beta">{RISK_EXPLAIN.holdingBeta}</Explained></TableHead>
            <TableHead className="text-right"><Explained align="right" label="Corr. to Fund">{RISK_EXPLAIN.corr}</Explained></TableHead>
            {showActive && <TableHead className="text-right"><Explained align="right" label="Active risk">{RISK_EXPLAIN.activeRiskShare}</Explained></TableHead>}
            <TableHead className="text-right"><Explained align="right" label="What if">Opens Backtesting with this holding trimmed by 2 percentage points into cash, so you can see how performance and risk would change. Adjust the trade there before running.</Explained></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((h) => {
            const team = h.teamId ? teams.get(h.teamId) : undefined;
            return (
              <TableRow key={h.ticker}>
                <TableCell>
                  {team ? <RowLink cover="cell" owner={team.slug} path={`/h/${encodeURIComponent(h.ticker)}`} aria-label={tickerName(h.ticker, h.name)} className="font-mono font-semibold hover:underline">{h.ticker}</RowLink> : <span className="font-mono font-semibold">{h.ticker}</span>}
                  {h.source !== "own" && (
                    <span className="ml-1.5 rounded border px-1 py-px text-[10px] text-muted-foreground" title={h.source === "proxy" ? `Too little price history; modeled with ${h.proxy}` : "No price history or sector; treated as riskless"}>
                      {h.source === "proxy" ? `via ${h.proxy}` : "not modeled"}
                      <span className="sr-only">: {h.source === "proxy" ? `too little price history; modeled with ${h.proxy}` : "no price history or sector; treated as riskless"}</span>
                    </span>
                  )}
                  <div className="max-w-44 truncate text-[11px] text-muted-foreground">{team?.name ?? h.name}</div>
                </TableCell>
                <TableCell>
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2" title="Share of value">
                      <MagnitudeBar value={h.weight} max={maxShare} color="var(--muted-foreground)" className="h-1.5 w-24" />
                      <span className="w-12 font-mono text-xs text-muted-foreground">{rpct(h.weight)}</span>
                    </div>
                    <div className="flex items-center gap-2" title="Share of risk">
                      <MagnitudeBar value={h.riskShare} max={maxShare} color={h.riskShare < 0 ? "var(--down)" : "var(--series-1)"} className="h-1.5 w-24" />
                      <span className="w-12 font-mono text-xs font-medium">{rpct(h.riskShare)}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-[12.5px]">{rpct(h.contribution, 2)}</TableCell>
                <TableCell className="text-right font-mono text-[12.5px]">{rpct(h.vol)}</TableCell>
                <TableCell className="text-right font-mono text-[12.5px]">{rnum(h.beta)}</TableCell>
                <TableCell className="text-right font-mono text-[12.5px]">{rnum(h.corrToPortfolio)}</TableCell>
                {showActive && <TableCell className="text-right font-mono text-[12.5px]">{rpct(h.activeRiskShare)}</TableCell>}
                <TableCell className="text-right">
                  <Link href={`/backtesting?trade=${encodeURIComponent(`${h.ticker}:-2:cash`)}`} aria-label={`Trim ${h.ticker} by 2 percentage points`} className="text-xs whitespace-nowrap text-muted-foreground hover:text-foreground hover:underline">
                    Trim 2 pp →
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {rows.length === totals.riskRows && (
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">All holdings</TableCell>
              <TableCell className="font-mono text-xs">{rpct(totals.weight)} of value · 100.0% of risk</TableCell>
              <TableCell className="text-right font-mono text-[12.5px] font-medium">{rpct(totals.vol, 2)}</TableCell>
              <TableCell colSpan={showActive ? 5 : 4} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </Card>
  );
}
