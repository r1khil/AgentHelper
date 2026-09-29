import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { benchmarkSectorWeights, securities, teamSectors } from "@/db/schema";
import { BenchmarkInputs, LEDGER_INPUT_TABS, SecuritiesInputs, type WeightSet } from "@/components/app/attribution/ledger-inputs";
import { CashFlowDialog } from "@/components/app/attribution/cash-flow-dialog";
import { ImportDialog } from "@/components/app/attribution/import-dialog";
import { SheetCheck } from "@/components/app/attribution/sheet-check";
import { TicketDialog } from "@/components/app/attribution/ticket-dialog";
import { TradeDialog } from "@/components/app/attribution/trade-dialog";
import { PageHead } from "@/components/app/page-head";
import { ActivityView } from "@/components/app/portfolio/activity-view";
import { HeldTickets } from "@/components/app/portfolio/held-tickets";
import { Button } from "@/components/ui/button";
import { recordedShares } from "@/lib/pt-sheet/reconcile";
import { latestPositions } from "@/lib/attribution/ledger";
import { loadAttributionSeries } from "@/lib/attribution/load";
import { loadHeldTickets } from "@/lib/attribution/held-tickets";
import type { GicsSector } from "@/lib/attribution/sectors";
import { listAccessibleTeams, requireRole } from "@/lib/auth";
import { fmtDate, fmtDayMonth, fmtPct, fmtUsd } from "@/lib/format";
import { buildActivity, summarizeActivity } from "@/lib/portfolio/activity";
import { loadLedgerRows, reinvestedDividends } from "@/lib/portfolio/activity-load";
import { todayNY } from "@/lib/providers/calendar";

export const metadata: Metadata = { title: "Activity" };
// Recording a trade backfills price history after the response.
export const maxDuration = 300;

const INPUT_TITLES = { benchmark: "Benchmark weights", securities: "Securities and team sectors" } as const;

/**
 * Portfolio · Activity: the tickets Hoot held back for a check, then the ledger's history by day (trades, cash and
 * the dividends it reinvests itself). The inputs the attribution pages need (benchmark weights, each security's
 * sector and team) open from the note under the history, on `?tab=benchmark` and `?tab=securities`.
 */
export default async function LedgerPage({ searchParams }: PageProps<"/attribution/ledger">) {
  const user = await requireRole("exec", "admin");
  const query = await searchParams;
  const input = LEDGER_INPUT_TABS.find((t) => t === query.tab) ?? null;
  const today = todayNY();
  const [rows, weightRows, securityRows, sectorRows, teamList, loaded, held] = await Promise.all([
    loadLedgerRows(),
    db.select().from(benchmarkSectorWeights).orderBy(desc(benchmarkSectorWeights.asOf)),
    db.select().from(securities).orderBy(asc(securities.ticker)),
    db.select().from(teamSectors),
    listAccessibleTeams(user),
    loadAttributionSeries(),
    loadHeldTickets().catch((e) => {
      console.error("[activity] held tickets failed", e);
      return [];
    }),
  ]);
  const positions = latestPositions(loaded.series.portfolio).map((p) => ({ ticker: p.ticker, shares: p.shares }));

  if (input) {
    const sets = new Map<string, WeightSet>();
    for (const w of weightRows) {
      const set = sets.get(w.asOf) ?? { asOf: w.asOf, source: w.source, weights: {} };
      set.weights[w.sector] = Number(w.weightPct);
      sets.set(w.asOf, set);
    }
    return (
      <>
        <PageHead crumbs={[{ label: "Portfolio", href: "/t/fund" }, { label: "Activity", href: "/attribution/ledger" }, { label: INPUT_TITLES[input] }]} tabs="section" />
        <div className="flex flex-col gap-5">
          {input === "benchmark" ? (
            <BenchmarkInputs today={today} weightSets={[...sets.values()]} />
          ) : (
            <SecuritiesInputs securityRows={securityRows} teams={teamList.map((t) => ({ id: t.id, name: t.name }))} assigned={Object.fromEntries(sectorRows.map((r) => [r.sector, r.teamId])) as Partial<Record<GicsSector, string>>} />
          )}
        </div>
      </>
    );
  }

  const dividends = reinvestedDividends(loaded);
  const days = buildActivity({ ...rows, dividends });
  const summary = summarizeActivity({ ...rows, dividends }, loaded.inception);
  const entries = rows.trades.filter((t) => !t.voided).length + rows.flows.filter((f) => !f.voided).length;
  const last = loaded.series.portfolio.at(-1);

  return (
    <>
      <PageHead
        crumbs={[{ label: "Portfolio" }]}
        scope
        asof={loaded.inception ? `Ledger · ${entries} ${entries === 1 ? "entry" : "entries"} since the ${fmtDayMonth(loaded.inception)} open` : "Ledger · nothing recorded yet"}
        actions={<TradeDialog today={today} positions={positions} primary />}
      />
      <div className="flex max-w-[1000px] flex-col">
        {held.length > 0 && (
          <div className="mb-8">
            <HeldTickets tickets={held} today={today} positions={positions} />
          </div>
        )}
        <Suspense fallback={<p className="text-body text-muted-foreground">Checking the ledger against the PT sheet…</p>}>
          <SheetCheck positions={recordedShares(rows.trades.map((t) => ({ tradeDate: t.date, ticker: t.ticker, side: t.side, shares: String(t.shares), voidedAt: t.voided ? new Date() : null })))} />
        </Suspense>
        <ActivityView
          days={days}
          summary={summary}
          position={
            last ? (
              <span>
                <b className="font-semibold text-foreground">{fmtUsd(last.navEnd)}</b> NAV at the {fmtDate(last.date)} close · cash {fmtUsd(last.cashEnd)}
                {last.navEnd ? ` (${fmtPct((last.cashEnd / last.navEnd) * 100)})` : ""} · {positions.length} positions
              </span>
            ) : undefined
          }
          toolbar={
            <>
              <CashFlowDialog today={today} />
              <TicketDialog emailTo={process.env.OPENMAIL_INBOX} />
              <ImportDialog />
            </>
          }
        />
        <p className="mt-[22px] max-w-[760px] text-caption text-muted-foreground">
          <b className="font-semibold text-ink-3">How the ledger works.</b> It&rsquo;s the source of truth for what the fund owns; every share count and weight comes from it. Entries are voided, never deleted. Dividends reinvest on the ex-date and splits apply on their own. Deposits and withdrawals aren&rsquo;t counted as performance.
        </p>
        <p className="mt-3 flex items-center gap-2 text-caption text-muted-foreground">
          Inputs the attribution pages use:
          <Button size="xs" variant="secondary" nativeButton={false} render={<Link href="/attribution/ledger?tab=benchmark" />}>
            Benchmark weights
          </Button>
          <Button size="xs" variant="secondary" nativeButton={false} render={<Link href="/attribution/ledger?tab=securities" />}>
            Securities and team sectors
          </Button>
        </p>
      </div>
    </>
  );
}
