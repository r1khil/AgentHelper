import Link from "next/link";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HoldingRisk } from "@/lib/risk/model";
import { PairBars } from "@/components/app/portfolio/parts";
import { Tip } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "./explainers";
import { rnum, rpct } from "./format";
import { tickerName } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";

export type TeamNames = Map<string, { name: string; slug: string }>;

const head = "text-caption first:pl-0 last:pr-0";

/** Holdings ranked by their share of portfolio risk, beside their share of its value, with a trim what-if on each. */
export function HoldingsRiskTable({ rows, teams, totals, showActive }: { rows: HoldingRisk[]; teams: TeamNames; totals: { weight: number; vol: number; riskRows: number }; showActive: boolean }) {
  const maxShare = Math.max(...rows.flatMap((h) => [Math.abs(h.riskShare), h.weight]), 0);
  return (
    <div className="overflow-x-auto">
      <Table aria-label="Holdings by share of risk">
        <TableHeader>
          <TableRow>
            <TableHead className={head}>Holding</TableHead>
            <TableHead className={head}>
              <Tip label="Weight vs share of risk" side="bottom">{RISK_EXPLAIN.riskShare}</Tip>
            </TableHead>
            <TableHead className={`${head} text-right`}><Tip label="Contribution" side="bottom">{RISK_EXPLAIN.contribution}</Tip></TableHead>
            <TableHead className={`${head} text-right`}><Tip label="Volatility" side="bottom">{RISK_EXPLAIN.holdingVol}</Tip></TableHead>
            <TableHead className={`${head} text-right`}><Tip label="Beta" side="bottom">{RISK_EXPLAIN.holdingBeta}</Tip></TableHead>
            <TableHead className={`${head} text-right`}><Tip label="Corr. to Fund" side="bottom">{RISK_EXPLAIN.corr}</Tip></TableHead>
            {showActive && <TableHead className={`${head} text-right`}><Tip label="Active risk" side="bottom">{RISK_EXPLAIN.activeRiskShare}</Tip></TableHead>}
            <TableHead className={`${head} text-right`}><Tip label="What if" side="bottom">Opens Backtesting with this holding trimmed by 2 percentage points into cash, so you can see how performance and risk would change. Adjust the trade there before running.</Tip></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((h) => {
            const team = h.teamId ? teams.get(h.teamId) : undefined;
            return (
              <TableRow key={h.ticker}>
                <TableCell className="first:pl-0">
                  {team ? <RowLink cover="cell" owner={team.slug} path={`/h/${encodeURIComponent(h.ticker)}`} aria-label={tickerName(h.ticker, h.name)} className="font-semibold hover:underline">{h.ticker}</RowLink> : <span className="font-semibold">{h.ticker}</span>}
                  {h.source !== "own" && (
                    <span className="ml-1.5 text-caption font-semibold text-caution-foreground" title={h.source === "proxy" ? `Too little price history; modeled with ${h.proxy}` : "No price history or sector; treated as riskless"}>
                      {h.source === "proxy" ? `via ${h.proxy}` : "not modeled"}
                      <span className="sr-only">: {h.source === "proxy" ? `too little price history; modeled with ${h.proxy}` : "no price history or sector; treated as riskless"}</span>
                    </span>
                  )}
                  <div className="max-w-44 text-caption whitespace-normal text-muted-foreground">{team?.name ?? h.name}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <PairBars a={h.weight} b={Math.abs(h.riskShare)} max={maxShare} className="w-24" />
                    <span className="grid text-body leading-4">
                      <span className="text-muted-foreground" title="Share of value">{rpct(h.weight)}</span>
                      <span className="font-semibold" title="Share of risk">{rpct(h.riskShare)}</span>
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">{rpct(h.contribution, 2)}</TableCell>
                <TableCell className="text-right">{rpct(h.vol)}</TableCell>
                <TableCell className="text-right">{rnum(h.beta)}</TableCell>
                <TableCell className="text-right">{rnum(h.corrToPortfolio)}</TableCell>
                {showActive && <TableCell className="text-right">{rpct(h.activeRiskShare)}</TableCell>}
                <TableCell className="text-right last:pr-0">
                  <Link href={`/backtesting?trade=${encodeURIComponent(`${h.ticker}:-2:cash`)}`} aria-label={`Trim ${h.ticker} by 2 percentage points`} className="text-body whitespace-nowrap text-muted-foreground hover:text-foreground hover:underline">
                    Trim 2 pp →
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {rows.length === totals.riskRows && (
          <TableFooter className="bg-transparent">
            <TableRow>
              <TableCell className="font-semibold first:pl-0">All holdings</TableCell>
              <TableCell>{rpct(totals.weight)} of value, 100.0% of risk</TableCell>
              <TableCell className="text-right font-semibold">{rpct(totals.vol, 2)}</TableCell>
              <TableCell colSpan={showActive ? 5 : 4} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
