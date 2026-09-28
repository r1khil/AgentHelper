import type { Metadata } from "next";
import { Suspense } from "react";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { benchmarkSectorWeights, cashFlows, securities, teamSectors, trades } from "@/db/schema";
import { LEDGER_TABS, LedgerView, type WeightSet } from "@/components/app/attribution/ledger-view";
import { SheetCheck } from "@/components/app/attribution/sheet-check";
import { recordedShares } from "@/lib/pt-sheet/reconcile";
import { latestPositions } from "@/lib/attribution/ledger";
import { loadAttributionSeries } from "@/lib/attribution/load";
import type { GicsSector } from "@/lib/attribution/sectors";
import { listAccessibleTeams, requireRole } from "@/lib/auth";
import { todayNY } from "@/lib/providers/calendar";

export const metadata: Metadata = { title: "Ledger" };
// Recording a trade backfills price history after the response.
export const maxDuration = 300;

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
  const tab = LEDGER_TABS.find((t) => t === query.tab) ?? "trades";
  const positions = latestPositions(loaded.series.portfolio);
  const last = loaded.series.portfolio.at(-1);

  const sets = new Map<string, WeightSet>();
  for (const w of weightRows) {
    const set = sets.get(w.asOf) ?? { asOf: w.asOf, source: w.source, weights: {} };
    set.weights[w.sector] = Number(w.weightPct);
    sets.set(w.asOf, set);
  }

  return (
    <LedgerView
      tab={tab}
      summary={last ? { navEnd: last.navEnd, cashEnd: last.cashEnd, positions: positions.length, date: last.date } : null}
      sheetCheck={
        <Suspense fallback={<p className="text-body text-muted-foreground">Checking the ledger against the PT sheet…</p>}>
          <SheetCheck positions={recordedShares(tradeRows)} />
        </Suspense>
      }
      tradeRows={tradeRows}
      flowRows={flowRows}
      weightSets={[...sets.values()]}
      securityRows={securityRows}
      teams={teamList.map((t) => ({ id: t.id, name: t.name }))}
      assigned={Object.fromEntries(sectorRows.map((r) => [r.sector, r.teamId])) as Partial<Record<GicsSector, string>>}
      today={todayNY()}
      positions={positions.map((p) => ({ ticker: p.ticker, shares: p.shares }))}
      emailTo={process.env.OPENMAIL_INBOX}
    />
  );
}
