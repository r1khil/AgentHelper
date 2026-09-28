import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { cashFlows, securities, trades } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/empty-state";
import { Panel, PanelHeader, Pill, StatStrip } from "@/components/app/panel";
import { deleteBenchmarkWeights, voidCashFlow, voidTrade } from "@/lib/actions/ledger";
import { GICS_SECTORS, SECTOR_LABELS, type GicsSector } from "@/lib/attribution/sectors";
import { fmtDate, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BenchmarkWeightsForm } from "./benchmark-weights-form";
import { CashFlowDialog } from "./cash-flow-dialog";
import { ImportDialog } from "./import-dialog";
import { SecurityRowForm } from "./security-row-form";
import { TeamSectorsForm } from "./team-sectors-form";
import { TicketDialog } from "./ticket-dialog";
import { TradeDialog } from "./trade-dialog";
import { VoidMenu } from "./void-menu";

export const LEDGER_TABS = ["trades", "cash", "benchmark", "securities"] as const;
export type LedgerTab = (typeof LEDGER_TABS)[number];
const CASH_LABELS = { deposit: "Deposit", withdrawal: "Withdrawal", fee: "Account fee", interest: "Interest" } as const;

type TradeRow = typeof trades.$inferSelect;
type FlowRow = typeof cashFlows.$inferSelect;
type SecurityRow = typeof securities.$inferSelect;
export type WeightSet = { asOf: string; source: string | null; weights: Partial<Record<GicsSector, number>> };

const num = "text-right font-mono text-[12.5px]";
const voided = "text-muted-foreground line-through";

/** Trades, cash, benchmark weights and security classification behind the attribution pages. */
export function LedgerView({
  tab,
  summary,
  sheetCheck,
  tradeRows,
  flowRows,
  weightSets,
  securityRows,
  teams,
  assigned,
  today,
  positions,
  emailTo,
}: {
  tab: LedgerTab;
  summary: { navEnd: number; cashEnd: number; positions: number; date: string } | null;
  /** The PT sheet check, streamed in by the page. */
  sheetCheck: React.ReactNode;
  tradeRows: TradeRow[];
  flowRows: FlowRow[];
  /** Newest first. */
  weightSets: WeightSet[];
  securityRows: SecurityRow[];
  teams: { id: string; name: string }[];
  assigned: Partial<Record<GicsSector, string>>;
  today: string;
  positions: { ticker: string; shares: number }[];
  emailTo?: string;
}) {
  const liveTrades = tradeRows.filter((t) => !t.voidedAt).length;
  const liveFlows = flowRows.filter((f) => !f.voidedAt).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Button nativeButton={false} variant="outline" render={<Link href="/attribution" />}>
          <ArrowLeft />
          Attribution
        </Button>
        <h1 className="text-[17px] font-semibold tracking-[-0.015em]">Ledger</h1>
        <span className="text-[13px] text-muted-foreground">Trades, cash and benchmark inputs behind the attribution pages.</span>
      </div>

      {summary && (
        <StatStrip
          cells={[
            { label: "NAV", value: `$${fmtMoney(summary.navEnd)}`, note: `As of ${fmtDate(summary.date)} close` },
            { label: "Cash", value: `$${fmtMoney(summary.cashEnd)}`, note: summary.navEnd ? `${((summary.cashEnd / summary.navEnd) * 100).toFixed(1)}% of NAV` : undefined },
            { label: "Positions", value: summary.positions, note: "Held at the latest close" },
            { label: "Entries", value: liveTrades + liveFlows, note: `${liveTrades} trades · ${liveFlows} cash` },
          ]}
        />
      )}

      {sheetCheck}

      <Tabs defaultValue={tab} className="flex min-h-0 flex-1 flex-col gap-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="cash">Cash</TabsTrigger>
          <TabsTrigger value="benchmark">Benchmark weights</TabsTrigger>
          <TabsTrigger value="securities">Securities</TabsTrigger>
        </TabsList>

        <TabsContent value="trades" className="flex min-h-0 flex-1 flex-col">
          <Panel className="flex-1">
            <PanelHeader
              title="Trades"
              count={tradeRows.length}
              aside={
                <>
                  <ImportDialog />
                  <TicketDialog emailTo={emailTo} />
                  <TradeDialog today={today} positions={positions} />
                </>
              }
            />
            {tradeRows.length === 0 ? (
              <EmptyState title="No trades recorded" className="m-4">
                Record each buy and sell as executed, upload its trade ticket, or import a CSV of past trades. Positions, weights and returns are derived from this list.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Date</TableHead>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Fees</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="pr-4" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tradeRows.map((t) => (
                      <TableRow key={t.id} className={t.voidedAt ? voided : undefined}>
                        <TableCell className="pl-4 font-mono text-[12.5px] whitespace-nowrap">{fmtDate(t.tradeDate)}</TableCell>
                        <TableCell className="font-mono font-semibold">{t.ticker}</TableCell>
                        <TableCell>
                          {t.kind === "opening" ? (
                            <Pill>Opening</Pill>
                          ) : (
                            <span className={cn("font-medium", !t.voidedAt && (t.side === "buy" ? "text-up" : "text-down"))}>{t.side === "buy" ? "Buy" : "Sell"}</span>
                          )}
                        </TableCell>
                        <TableCell className={num}>{Number(t.shares).toLocaleString("en-US", { maximumFractionDigits: 4 })}</TableCell>
                        <TableCell className={num}>{fmtMoney(t.price)}</TableCell>
                        <TableCell className={num}>{fmtMoney(Number(t.shares) * Number(t.price))}</TableCell>
                        <TableCell className={cn(num, "text-muted-foreground")}>{Number(t.fees) ? fmtMoney(t.fees) : ""}</TableCell>
                        <TableCell className="max-w-56 truncate text-muted-foreground">{t.note}</TableCell>
                        <TableCell className="pr-4 text-right no-underline">
                          {t.voidedAt ? (
                            <Pill>Void</Pill>
                          ) : (
                            <VoidMenu
                              id={t.id}
                              action={voidTrade}
                              entry={`${t.kind === "opening" ? "the opening position of" : t.side === "buy" ? "BUY" : "SELL"} ${Number(t.shares)} ${t.ticker} @ ${fmtMoney(t.price)} on ${fmtDate(t.tradeDate)}`}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="cash" className="flex min-h-0 flex-1 flex-col">
          <Panel className="flex-1">
            <PanelHeader title="Cash" count={flowRows.length} aside={<CashFlowDialog today={today} />} />
            {flowRows.length === 0 ? (
              <EmptyState title="No cash recorded" className="m-4">Start with a deposit for the Fund&apos;s opening balance.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="pr-4" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flowRows.map((f) => {
                      const inflow = f.kind === "deposit" || f.kind === "interest";
                      return (
                        <TableRow key={f.id} className={f.voidedAt ? voided : undefined}>
                          <TableCell className="pl-4 font-mono text-[12.5px] whitespace-nowrap">{fmtDate(f.flowDate)}</TableCell>
                          <TableCell>{CASH_LABELS[f.kind]}</TableCell>
                          <TableCell className={cn(num, !f.voidedAt && (inflow ? "text-up" : "text-down"))}>{inflow ? "" : "−"}${fmtMoney(f.amount)}</TableCell>
                          <TableCell className="max-w-72 truncate text-muted-foreground">{f.note}</TableCell>
                          <TableCell className="pr-4 text-right">
                            {f.voidedAt ? (
                              <Pill>Void</Pill>
                            ) : (
                              <VoidMenu id={f.id} action={voidCashFlow} entry={`the ${CASH_LABELS[f.kind].toLowerCase()} of $${fmtMoney(f.amount)} on ${fmtDate(f.flowDate)}`} />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="benchmark" className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="S&P 500 sector weights" aside="Takes effect the session after the as-of date, then drifts with sector returns" />
            <div className="p-4">
              <BenchmarkWeightsForm today={today} initial={weightSets[0]?.weights ?? {}} />
            </div>
          </Panel>
          {weightSets.length > 0 && (
            <Panel>
              <PanelHeader title="Saved sets" count={weightSets.length} />
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">As of</TableHead>
                      {GICS_SECTORS.map((s) => (
                        <TableHead key={s} className="text-right font-mono" title={SECTOR_LABELS[s]}>
                          {SECTOR_LABELS[s].split(" ").map((w) => w[0]).join("")}
                        </TableHead>
                      ))}
                      <TableHead>Source</TableHead>
                      <TableHead className="pr-4" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weightSets.map((set) => (
                      <TableRow key={set.asOf}>
                        <TableCell className="pl-4 font-mono text-[12.5px] whitespace-nowrap">{fmtDate(set.asOf)}</TableCell>
                        {GICS_SECTORS.map((s) => <TableCell key={s} className={num}>{(set.weights[s] ?? 0).toFixed(1)}</TableCell>)}
                        <TableCell className="max-w-48 truncate text-muted-foreground">{set.source}</TableCell>
                        <TableCell className="pr-4 text-right">
                          <form action={deleteBenchmarkWeights}>
                            <input type="hidden" name="asOf" value={set.asOf} />
                            <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground">Remove</Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>
          )}
        </TabsContent>

        <TabsContent value="securities" className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="Classification" count={securityRows.length} aside="Sector drives fund attribution; team drives the team tabs" />
            {securityRows.length === 0 ? (
              <EmptyState title="No securities yet" className="m-4">A security is added the first time it is traded.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Ticker</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Sector and team</TableHead>
                      <TableHead className="pr-4">Sector source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {securityRows.map((s) => (
                      <TableRow key={s.ticker}>
                        <TableCell className="pl-4 font-mono font-semibold">{s.ticker}</TableCell>
                        <TableCell className="max-w-64 truncate text-ink-2">{s.name}</TableCell>
                        <TableCell><SecurityRowForm ticker={s.ticker} sector={s.sector} teamId={s.teamId} teams={teams} /></TableCell>
                        <TableCell className="pr-4">
                          <Pill tone={s.sectorSource === "manual" || s.sectorSource === "yahoo" || s.sectorSource === "default" ? "neutral" : "caution"}>
                            {s.sectorSource === "manual" ? "Set by hand" : s.sectorSource === "yahoo" ? `Yahoo: ${s.yahooSector}` : s.sectorSource === "default" ? "ETF default" : "None"}
                          </Pill>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
          <Panel>
            <PanelHeader title="Team sectors" aside="Defines each team's benchmark on its Attribution tab" />
            <div className="p-4">
              <TeamSectorsForm teams={teams} assigned={assigned} />
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
