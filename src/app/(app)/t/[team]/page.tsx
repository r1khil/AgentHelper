import type { Metadata } from "next";
import { Suspense } from "react";
import { DateTime } from "luxon";
import { loadScope } from "@/lib/teams";
import { holdingHref, scopeFor } from "@/lib/scope";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { listHoldingSignals, listRecentCloses, listTeamHoldings } from "@/lib/holdings";
import { marketSnapshot, type MarketSnapshot } from "@/lib/market";
import { NY, todayNY } from "@/lib/providers/calendar";
import { EmptyState } from "@/components/app/empty-state";
import { AddHoldingDialog } from "@/components/app/add-holding-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { HoldingsTable, type HoldingGroup, type HoldingListRow, type QuoteCells } from "@/components/app/holdings/holdings-table";
import { HoldingsToolbar, MarketLine, parseHoldingFilter, type HoldingFilter } from "@/components/app/holdings/holdings-toolbar";
import { attentionFlags, reportsWithin } from "@/components/app/holdings/attention";
import { fmtDayMonth } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ team: string }> }): Promise<Metadata> {
  const { team } = await params;
  return { title: team === FUND_SCOPE_SLUG ? "Fund holdings" : team };
}

export default async function TeamHoldingsPage({ params, searchParams }: { params: Promise<{ team: string }>; searchParams: Promise<{ filter?: string | string[] }> }) {
  const [{ team: slug }, sp] = await Promise.all([params, searchParams]);
  const filter = parseHoldingFilter(sp.filter);
  const scope = await loadScope(slug);
  const { team, teamById } = scope;
  const today = todayNY();
  const rows = await listTeamHoldings(scope.teamIds);
  const [signals, closes] = await Promise.all([
    listHoldingSignals(rows.map((r) => r.h.id), today),
    listRecentCloses(rows.map((r) => r.h.ticker), 6).catch(() => new Map<string, number[]>()),
  ]);
  // Not awaited: the holdings render from the database at once and the quotes stream in when Yahoo answers.
  const market = marketSnapshot(rows.map((r) => r.h.ticker));
  const fund = scope.kind === "fund";
  const now = nowMs();

  const listRows: (HoldingListRow & { teamId: string; reporting: boolean })[] = rows.map(({ h }) => {
    const t = teamById.get(h.teamId);
    const s = signals.get(h.id);
    const next = s?.nextReport ?? null;
    return {
      id: h.id,
      teamId: h.teamId,
      ticker: h.ticker,
      company: h.companyName,
      href: holdingHref(slug, t?.slug ?? slug, h.ticker),
      weightPct: h.weightPct == null ? null : Number(h.weightPct),
      shares: h.shares == null ? null : Number(h.shares),
      spark: closes.get(h.ticker) ?? [],
      nextReport: next ? `${fmtDayMonth(next.reportDate)}${next.estimated ? " est." : ""}` : null,
      flags: attentionFlags(
        { openMovement: s?.openMovement ?? null, nextReport: next, modelUpdates: s?.modelUpdates ?? 0, thesisProposed: s?.thesisProposed ?? false },
        // Flags link within the scope in view, like the row itself.
        { teamSlug: scopeFor(slug, t?.slug ?? slug), ticker: h.ticker, today, now },
      ),
      reporting: reportsWithin(next?.reportDate, today),
    };
  });

  const counts: Record<HoldingFilter, number> = {
    all: listRows.length,
    attention: listRows.filter((r) => r.flags.length > 0).length,
    reporting: listRows.filter((r) => r.reporting).length,
  };
  const shown = listRows.filter((r) => (filter === "attention" ? r.flags.length > 0 : filter === "reporting" ? r.reporting : true));

  // Group by team in the teams' own order. Weight is the team's share of NAV across all its holdings, not just the filtered ones.
  const teams = [...teamById.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const groups: HoldingGroup[] = teams.map((t) => {
    const all = listRows.filter((r) => r.teamId === t.id);
    const weights = all.map((r) => r.weightPct).filter((w): w is number => w != null);
    return { id: t.id, name: t.name, navPct: weights.length ? weights.reduce((a, b) => a + b, 0) : null, rows: shown.filter((r) => r.teamId === t.id) };
  });
  const emptyText = filter === "attention" ? "Nothing needs attention right now." : filter === "reporting" ? "No holding reports in the next two weeks." : "No holdings.";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <HoldingsToolbar
        basePath={`/t/${slug}`}
        active={filter}
        counts={counts}
        aside={
          <>
            <Suspense fallback={<Skeleton className="h-4 w-48" />}>
              <LiveMarketLine market={market} today={today} />
            </Suspense>
            {/* Adding needs a team to own the holding, so the fund view leaves it to the sector pages. */}
            {team && <AddHoldingDialog teamId={team.id} />}
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No holdings yet" hoot="wave" className="flex-1">
          {fund ? "Pick a sector team in the sidebar to add its tickers." : "Add the tickers this team covers."} Each one gets live prices, filings, news, and movement alerts.
        </EmptyState>
      ) : (
        <Suspense fallback={<HoldingsTable groups={groups} empty={emptyText} />}>
          <LiveHoldingsTable groups={groups} empty={emptyText} market={market} />
        </Suspense>
      )}
    </div>
  );
}

async function LiveMarketLine({ market, today }: { market: Promise<MarketSnapshot>; today: string }) {
  const { spx, error } = await market;
  if (!spx) return <MarketLine error={error} />;
  const asOf = DateTime.fromISO(spx.asOf).setZone(NY);
  const day = !asOf.isValid || asOf.toISODate() === today ? "today" : asOf.toFormat("cccc");
  return <MarketLine changePct={spx.changePct} day={day} closed={!!spx.marketState && spx.marketState !== "REGULAR"} />;
}

async function LiveHoldingsTable({ market, ...props }: { groups: HoldingGroup[]; empty: string; market: Promise<MarketSnapshot> }) {
  const snap = await market;
  const quotes: QuoteCells = {};
  for (const [ticker, m] of Object.entries(snap.rows)) quotes[ticker] = { price: m.quote?.price, changePct: m.quote?.changePct, relativePp: m.relativePp };
  return <HoldingsTable {...props} quotes={quotes} />;
}

/** Read once per request; a helper so the render stays free of impure calls. */
function nowMs() {
  return Date.now();
}
