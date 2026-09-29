import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { benchmarkSectorWeights, securities, teamSectors } from "@/db/schema";
import { BenchmarkInputs, LEDGER_INPUT_TABS, SecuritiesInputs, type WeightSet } from "@/components/app/attribution/ledger-inputs";
import { CashFlowDialog } from "@/components/app/attribution/cash-flow-dialog";
import { ImportDialog } from "@/components/app/attribution/import-dialog";
import { SheetCheck } from "@/components/app/attribution/sheet-check";
import { TicketDialog } from "@/components/app/attribution/ticket-dialog";
import { BackLink } from "@/components/app/panel";
import { ActivityView } from "@/components/app/portfolio/activity-view";
import { HeldTickets } from "@/components/app/portfolio/held-tickets";
import { ViewMeta } from "@/components/app/portfolio/view-meta";
import { Button } from "@/components/ui/button";
import { recordedShares } from "@/lib/pt-sheet/reconcile";
import { latestPositions } from "@/lib/attribution/ledger";
import { loadAttributionSeries } from "@/lib/attribution/load";
import { loadHeldTickets } from "@/lib/attribution/held-tickets";
import type { GicsSector } from "@/lib/attribution/sectors";
import { isFundWide, listAccessibleTeams, requireUser } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { fmtDate, fmtDayMonth, fmtPct, fmtUsd } from "@/lib/format";
import { buildActivity, summarizeActivity } from "@/lib/portfolio/activity";
import { loadLedgerRows, reinvestedDividends } from "@/lib/portfolio/activity-load";
import { todayNY } from "@/lib/providers/calendar";
import { loadScope } from "@/lib/teams";

export const metadata: Metadata = { title: "Activity" };
// Recording a trade backfills price history after the response.
export const maxDuration = 300;

const INPUT_TITLES = { benchmark: "Benchmark weights", securities: "Securities and team sectors" } as const;
const BASE = `/t/${FUND_SCOPE_SLUG}/activity`;

/**
 * Portfolio, Activity: the tickets Hoot held back for a check, then the ledger's history by day (trades, cash and the
 * dividends it reinvests itself). The fund's, for execs and admins only; a team scope has no ledger of its own. The
 * inputs the Performance, Risk and Exposure views need (benchmark weights, each security's sector and team) open from
 * the note under the history, on `?tab=benchmark` and `?tab=securities`.
 */
export default async function ActivityPage({ params, searchParams }: PageProps<"/t/[team]/activity">) {
  const slug = (await params).team;
  const query = await searchParams;
  if (slug !== FUND_SCOPE_SLUG) {
    const user = await requireUser();
    const qs = new URLSearchParams(Object.entries(query).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    redirect(isFundWide(user) ? `${BASE}${qs.size ? `?${qs}` : ""}` : `/t/${slug}`);
  }
  // Anyone who isn't an exec or admin is sent to their own team's Positions.
  const { user } = await loadScope(slug);
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
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <BackLink href={BASE} label="Activity" />
          <h2 className="text-title font-bold tracking-[-0.01em]">{INPUT_TITLES[input]}</h2>
        </div>
        {input === "benchmark" ? (
          <BenchmarkInputs today={today} weightSets={[...sets.values()]} />
        ) : (
          <SecuritiesInputs securityRows={securityRows} teams={teamList.map((t) => ({ id: t.id, name: t.name }))} assigned={Object.fromEntries(sectorRows.map((r) => [r.sector, r.teamId])) as Partial<Record<GicsSector, string>>} />
        )}
      </div>
    );
  }

  const dividends = reinvestedDividends(loaded);
  const days = buildActivity({ ...rows, dividends });
  const summary = summarizeActivity({ ...rows, dividends }, loaded.inception);
  const entries = rows.trades.filter((t) => !t.voided).length + rows.flows.filter((f) => !f.voided).length;
  const last = loaded.series.portfolio.at(-1);

  return (
    <div className="flex max-w-[1000px] flex-col">
      <ViewMeta>{loaded.inception ? `The ledger, ${entries} ${entries === 1 ? "entry" : "entries"} since the ${fmtDayMonth(loaded.inception)} open` : "The ledger, nothing recorded yet"}</ViewMeta>
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
              <b className="font-semibold text-foreground">{fmtUsd(last.navEnd)}</b> NAV at the {fmtDate(last.date)} close, cash {fmtUsd(last.cashEnd)}
              {last.navEnd ? ` (${fmtPct((last.cashEnd / last.navEnd) * 100)})` : ""}, {positions.length} positions
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
        Inputs the Performance, Risk and Exposure views use:
        <Button size="xs" variant="secondary" nativeButton={false} render={<Link href={`${BASE}?tab=benchmark`} />}>
          Benchmark weights
        </Button>
        <Button size="xs" variant="secondary" nativeButton={false} render={<Link href={`${BASE}?tab=securities`} />}>
          Securities and team sectors
        </Button>
      </p>
    </div>
  );
}
