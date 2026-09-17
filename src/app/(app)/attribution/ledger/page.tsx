import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { benchmarkSectorWeights, cashFlows, securities, teamSectors, trades } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { BenchmarkWeightsForm } from "@/components/app/attribution/benchmark-weights-form";
import { CashFlowDialog } from "@/components/app/attribution/cash-flow-dialog";
import { SecurityRowForm } from "@/components/app/attribution/security-row-form";
import { TeamSectorsForm } from "@/components/app/attribution/team-sectors-form";
import { TradeDialog } from "@/components/app/attribution/trade-dialog";
import { VoidButton } from "@/components/app/attribution/void-button";
import { deleteBenchmarkWeights, voidCashFlow, voidTrade } from "@/lib/actions/ledger";
import { latestPositions } from "@/lib/attribution/ledger";
import { loadAttributionSeries } from "@/lib/attribution/load";
import { GICS_SECTORS, SECTOR_LABELS, type GicsSector } from "@/lib/attribution/sectors";
import { listAccessibleTeams, requireRole } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { todayNY } from "@/lib/providers/calendar";

export const metadata: Metadata = { title: "Ledger" };
// Recording a trade backfills price history after the response.
export const maxDuration = 300;

const TABS = ["trades", "cash", "benchmark", "securities"] as const;
const CASH_LABELS = { deposit: "Deposit", withdrawal: "Withdrawal", fee: "Account fee", interest: "Interest" } as const;

export default async function LedgerPage({ searchParams }: PageProps<"/attribution/ledger">) {
  const user = await requireRole("exec", "admin");
  const [query, tradeRows, flowRows, weightRows, securityRows, sectorRows, teamList, loaded] = await Promise.all([
    searchParams,
    db.select().from(trades).orderBy(desc(trades.tradeDate), desc(trades.createdAt)),
    db.select().from(cashFlows).orderBy(desc(cashFlows.flowDate), desc(cashFlows.createdAt)),
    db.select().from(benchmarkSectorWeights).orderBy(desc(benchmarkSectorWeights.asOf)),
    db.select().from(securities).orderBy(asc(securities.ticker)),
    db.select().from(teamSectors),
    listAccessibleTeams(user),
    loadAttributionSeries(),
  ]);
  const tab = TABS.find((t) => t === query.tab) ?? "trades";
  const today = todayNY();
  const positions = latestPositions(loaded.series.portfolio);
  const last = loaded.series.portfolio.at(-1);
  const teams = teamList.map((t) => ({ id: t.id, name: t.name }));

  const weightSets = new Map<string, { source: string | null; weights: Partial<Record<GicsSector, number>> }>();
  for (const w of weightRows) {
    const set = weightSets.get(w.asOf) ?? { source: w.source, weights: {} };
    set.weights[w.sector] = Number(w.weightPct);
    weightSets.set(w.asOf, set);
  }
  const latestWeights = [...weightSets.values()][0]?.weights ?? {};
  const assigned = Object.fromEntries(sectorRows.map((r) => [r.sector, r.teamId])) as Partial<Record<GicsSector, string>>;

  return (
    <>
      <PageHeader
        title="Ledger"
        description={
          last
            ? `NAV $${fmtMoney(last.navEnd)} · cash $${fmtMoney(last.cashEnd)} · ${positions.length} positions · as of ${fmtDate(last.date)} close`
            : "Trades, cash and benchmark inputs behind the attribution pages."
        }
        actions={
          <Button variant="outline" size="sm" render={<Link href="/attribution" />}>
            <ArrowLeft />
            Attribution
          </Button>
        }
      />

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="cash">Cash</TabsTrigger>
          <TabsTrigger value="benchmark">Benchmark weights</TabsTrigger>
          <TabsTrigger value="securities">Securities</TabsTrigger>
        </TabsList>

        <TabsContent value="trades" className="mt-4">
          <SectionTitle aside={<TradeDialog today={today} positions={positions.map((p) => ({ ticker: p.ticker, shares: p.shares }))} />}>Trades</SectionTitle>
          {tradeRows.length === 0 ? (
            <EmptyState title="No trades recorded">Record each buy and sell as executed. Positions, weights and returns are derived from this list.</EmptyState>
          ) : (
            <Card className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tradeRows.map((t) => (
                    <TableRow key={t.id} className={t.voidedAt ? "text-muted-foreground line-through" : undefined}>
                      <TableCell className="tnum whitespace-nowrap">{fmtDate(t.tradeDate)}</TableCell>
                      <TableCell className="font-medium">{t.ticker}</TableCell>
                      <TableCell>{t.kind === "opening" ? "Opening" : t.side === "buy" ? "Buy" : "Sell"}</TableCell>
                      <TableCell className="tnum text-right">{Number(t.shares).toLocaleString("en-US", { maximumFractionDigits: 4 })}</TableCell>
                      <TableCell className="tnum text-right">{fmtMoney(t.price)}</TableCell>
                      <TableCell className="tnum text-right">{fmtMoney(Number(t.shares) * Number(t.price))}</TableCell>
                      <TableCell className="tnum text-right">{Number(t.fees) ? fmtMoney(t.fees) : ""}</TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground">{t.note}</TableCell>
                      <TableCell className="text-right no-underline">
                        {t.voidedAt ? <Badge variant="outline">Void</Badge> : <VoidButton id={t.id} action={voidTrade} what={`${t.side === "buy" ? "Buy" : "Sell"} ${Number(t.shares)} ${t.ticker} on ${fmtDate(t.tradeDate)}.`} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cash" className="mt-4">
          <SectionTitle aside={<CashFlowDialog today={today} />}>Cash</SectionTitle>
          {flowRows.length === 0 ? (
            <EmptyState title="No cash recorded">Start with a deposit for the Fund&apos;s opening balance.</EmptyState>
          ) : (
            <Card className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flowRows.map((f) => (
                    <TableRow key={f.id} className={f.voidedAt ? "text-muted-foreground line-through" : undefined}>
                      <TableCell className="tnum whitespace-nowrap">{fmtDate(f.flowDate)}</TableCell>
                      <TableCell>{CASH_LABELS[f.kind]}</TableCell>
                      <TableCell className="tnum text-right">{f.kind === "deposit" || f.kind === "interest" ? "" : "−"}${fmtMoney(f.amount)}</TableCell>
                      <TableCell className="max-w-72 truncate text-muted-foreground">{f.note}</TableCell>
                      <TableCell className="text-right">
                        {f.voidedAt ? <Badge variant="outline">Void</Badge> : <VoidButton id={f.id} action={voidCashFlow} what={`${CASH_LABELS[f.kind]} of $${fmtMoney(f.amount)} on ${fmtDate(f.flowDate)}.`} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="benchmark" className="mt-4 grid gap-6">
          <div>
            <SectionTitle aside="Takes effect the session after the as-of date, then drifts with sector returns">S&amp;P 500 sector weights</SectionTitle>
            <Card className="p-4">
              <BenchmarkWeightsForm today={today} initial={latestWeights} />
            </Card>
          </div>
          {weightSets.size > 0 && (
            <div>
              <SectionTitle>Saved sets</SectionTitle>
              <Card className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>As of</TableHead>
                      {GICS_SECTORS.map((s) => <TableHead key={s} className="text-right" title={SECTOR_LABELS[s]}>{SECTOR_LABELS[s].split(" ").map((w) => w[0]).join("")}</TableHead>)}
                      <TableHead>Source</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...weightSets.entries()].map(([asOf, set]) => (
                      <TableRow key={asOf}>
                        <TableCell className="tnum whitespace-nowrap">{fmtDate(asOf)}</TableCell>
                        {GICS_SECTORS.map((s) => <TableCell key={s} className="tnum text-right">{(set.weights[s] ?? 0).toFixed(1)}</TableCell>)}
                        <TableCell className="max-w-48 truncate text-muted-foreground">{set.source}</TableCell>
                        <TableCell className="text-right">
                          <form action={deleteBenchmarkWeights}>
                            <input type="hidden" name="asOf" value={asOf} />
                            <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground">Remove</Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="securities" className="mt-4 grid gap-6">
          <div>
            <SectionTitle aside="Sector drives fund attribution; team drives the team tabs">Classification</SectionTitle>
            {securityRows.length === 0 ? (
              <EmptyState title="No securities yet">A security is added the first time it is traded.</EmptyState>
            ) : (
              <Card className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Sector and team</TableHead>
                      <TableHead>Sector source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {securityRows.map((s) => (
                      <TableRow key={s.ticker}>
                        <TableCell className="font-medium">{s.ticker}</TableCell>
                        <TableCell className="max-w-64 truncate text-muted-foreground">{s.name}</TableCell>
                        <TableCell><SecurityRowForm ticker={s.ticker} sector={s.sector} teamId={s.teamId} teams={teams} /></TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {s.sectorSource === "manual" ? "Set by hand" : s.sectorSource === "yahoo" ? `Yahoo: ${s.yahooSector}` : s.sectorSource === "default" ? "ETF default" : "None"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
          <div>
            <SectionTitle aside="Defines each team's benchmark on its Attribution tab">Team sectors</SectionTitle>
            <Card className="p-4">
              <TeamSectorsForm teams={teams} assigned={assigned} />
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
