import { Suspense } from "react";
import type { Team } from "@/db/schema";
import { EmptyState } from "@/components/app/empty-state";
import { attentionFlags, reportsWithin } from "@/components/app/holdings/attention";
import { HoldingsTable, type HoldingListRow, type QuoteCells } from "@/components/app/holdings/holdings-table";
import { HOLDING_FILTERS, HoldingsToolbar, type HoldingFilter } from "@/components/app/holdings/holdings-toolbar";
import { FilterChip, FilterChips } from "@/components/app/panel";
import { LiveMarketLine } from "@/components/app/holdings/team-sections";
import { Skeleton } from "@/components/ui/skeleton";
import { canManageTeam, isFundWide, listAccessibleTeams } from "@/lib/auth";
import { fmtDayMonth } from "@/lib/format";
import { listHoldingSignals, listRecentCloses, listTeamHoldings } from "@/lib/holdings";
import { marketSnapshot } from "@/lib/market";
import { todayNY } from "@/lib/providers/calendar";
import { holdingHref, scopeFor } from "@/lib/scope";
import type { TeamScope } from "@/lib/teams";
import { loadFundBookView, loadTeamBookView, type ScopeBook } from "./book-load";
import { PositionsTable, type PositionGroup } from "./positions-table";
import { PositionsSkeleton } from "./view-skeletons";

type FundScope = Extract<TeamScope, { kind: "fund" }>;
type TeamOnly = Extract<TeamScope, { kind: "team" }>;

/** The whole fund's positions, grouped by team, cash last. */
export async function FundPositions({ scope }: { scope: FundScope }) {
  const teams = await listAccessibleTeams(scope.user);
  return (
    <Suspense fallback={<PositionsSkeleton />}>
      <BookPositions book={loadFundBookView()} teams={teams} scopeSlug={scope.slug} intraday />
    </Suspense>
  );
}

/** The book's positions by team: each group a team's rows, positions no team claims last, then cash. */
async function BookPositions({ book, teams, scopeSlug, intraday }: { book: Promise<ScopeBook | null>; teams: Team[]; scopeSlug: string; intraday: boolean }) {
  const b = await book;
  if (!b) return null;
  const known = new Map(teams.map((t) => [t.id, t]));
  const line = (p: ScopeBook["positions"][number]) => ({
    ticker: p.ticker,
    name: p.name,
    href: holdingHref(scopeSlug, known.get(p.teamId ?? "")?.slug ?? scopeSlug, p.ticker),
    shares: p.shares,
    price: p.price,
    dayPct: p.dayPct,
    dayPnl: p.dayPnl,
    value: p.value,
    weight: p.weight,
    gain: p.gain,
    cost: p.cost,
  });
  const groups: PositionGroup[] = [...teams]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((t) => ({ id: t.id, name: t.name, lines: b.positions.filter((p) => p.teamId === t.id).map(line) }))
    .filter((g) => g.lines.length);
  const orphans = b.positions.filter((p) => !p.teamId || !known.has(p.teamId));
  if (orphans.length) groups.push({ id: "none", name: "No team", lines: orphans.map(line) });
  return <PositionsTable groups={groups} cash={b.cash} asOf={b.session} spxPct={b.spxDayPct} intraday={intraday} />;
}

/**
 * One team, filtered by `?filter=`: for the readers who see sizes (its leads, execs and admins) one table of its
 * positions with each holding's next report and what needs attention; for everyone else the holdings it covers, with
 * the quotes streaming in when Yahoo answers.
 */
export async function TeamPositions({ scope, filter }: { scope: TeamOnly; filter: HoldingFilter }) {
  const { team, user, teamById } = scope;
  const slug = scope.slug;
  const book = canManageTeam(user, team.id);
  const today = todayNY();
  const rows = await listTeamHoldings(scope.teamIds);
  const [signals, closes] = await Promise.all([
    listHoldingSignals(rows.map((r) => r.h.id), today),
    listRecentCloses(rows.map((r) => r.h.ticker), 6).catch(() => new Map<string, number[]>()),
  ]);
  // Not awaited: the holdings render from the database at once and the quotes stream in when Yahoo answers.
  const market = marketSnapshot(rows.map((r) => r.h.ticker));
  const now = nowMs();

  const listRows: (HoldingListRow & { reporting: boolean })[] = rows.map(({ h }) => {
    const s = signals.get(h.id);
    const next = s?.nextReport ?? null;
    return {
      id: h.id,
      ticker: h.ticker,
      company: h.companyName,
      href: holdingHref(slug, teamById.get(h.teamId)?.slug ?? slug, h.ticker),
      weightPct: h.weightPct == null ? null : Number(h.weightPct),
      shares: h.shares == null ? null : Number(h.shares),
      spark: closes.get(h.ticker) ?? [],
      nextReport: next ? `${fmtDayMonth(next.reportDate)}${next.estimated ? " (est.)" : ""}` : null,
      flags: attentionFlags(
        { nextReport: next, modelUpdates: s?.modelUpdates ?? 0, thesisProposed: s?.thesisProposed ?? false },
        { teamSlug: scopeFor(slug, team.slug), ticker: h.ticker, today, now },
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
  const emptyText = filter === "attention" ? "Nothing needs attention right now." : filter === "reporting" ? "No holding reports in the next two weeks." : "No holdings.";

  const marketLine = (
    <Suspense fallback={<Skeleton className="h-4 w-48" />}>
      <LiveMarketLine market={market} today={today} />
    </Suspense>
  );

  // Readers who see sizes get one table: the team's positions with each holding's next report and flags.
  if (book) {
    return (
      <Suspense fallback={<PositionsSkeleton rows={Math.max(4, rows.length)} />}>
        <TeamBookTable
          book={loadTeamBookView(team.id, team.name)}
          team={team}
          scopeSlug={slug}
          intraday={isFundWide(user)}
          rows={listRows}
          filter={filter}
          empty={emptyText}
          toolbar={
            <div className="mt-3 flex flex-wrap items-center gap-1">
              <HoldingChips basePath={`/t/${slug}`} active={filter} counts={counts} />
              <span className="flex-1" />
              {marketLine}
            </div>
          }
        />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col">
      <HoldingsToolbar basePath={`/t/${slug}`} active={filter} counts={counts} aside={marketLine} />
      {rows.length === 0 ? (
        <EmptyState title="No holdings yet" hoot="wave" className="mt-4">
          Add the tickers this team covers. Each one gets live prices, filings, and news.
        </EmptyState>
      ) : (
        <Suspense fallback={<HoldingsTable rows={shown} empty={emptyText} showWeight={false} />}>
          <LiveHoldingsTable rows={shown} empty={emptyText} showWeight={false} market={market} />
        </Suspense>
      )}
    </div>
  );
}

const CHIP_LABELS: Record<HoldingFilter, string> = { all: "All", attention: "Needs attention", reporting: "Reporting in 2 weeks" };

/** The team page's filters (`?filter=`), over the one table. */
function HoldingChips({ basePath, active, counts }: { basePath: string; active: HoldingFilter; counts: Record<HoldingFilter, number> }) {
  return (
    <FilterChips label="Filter holdings">
      {HOLDING_FILTERS.map((f) => (
        <FilterChip key={f} href={f === "all" ? basePath : `${basePath}?filter=${f}`} active={active === f} count={counts[f]}>
          {CHIP_LABELS[f]}
        </FilterChip>
      ))}
    </FilterChips>
  );
}

/**
 * A team's one table for readers who see sizes: its positions in the book, then any holding it covers that the ledger
 * doesn't hold, each with its next report and needs-attention flag, narrowed by the filter.
 */
async function TeamBookTable({
  book,
  team,
  scopeSlug,
  intraday,
  rows,
  filter,
  empty,
  toolbar,
}: {
  book: Promise<ScopeBook | null>;
  team: Team;
  scopeSlug: string;
  intraday: boolean;
  rows: (HoldingListRow & { reporting: boolean })[];
  filter: HoldingFilter;
  empty: string;
  toolbar: React.ReactNode;
}) {
  const b = await book;
  const byTicker = new Map(rows.map((r) => [r.ticker, r]));
  const keep = (ticker: string) => {
    const r = byTicker.get(ticker);
    if (filter === "attention") return !!r && r.flags.length > 0;
    if (filter === "reporting") return !!r?.reporting;
    return true;
  };
  const held = new Set((b?.positions ?? []).map((p) => p.ticker));
  const lines = (b?.positions ?? []).filter((p) => keep(p.ticker)).map((p) => ({
    ticker: p.ticker,
    name: p.name,
    href: byTicker.get(p.ticker)?.href ?? holdingHref(scopeSlug, team.slug, p.ticker),
    shares: p.shares,
    price: p.price,
    dayPct: p.dayPct,
    dayPnl: p.dayPnl,
    value: p.value,
    weight: p.weight,
    gain: p.gain,
    cost: p.cost,
  }));
  const unheld = rows.filter((r) => !held.has(r.ticker) && keep(r.ticker)).map((r) => ({ ticker: r.ticker, name: r.company, href: r.href }));
  const notes = Object.fromEntries(rows.map((r) => [r.ticker, { nextReport: r.nextReport, flags: r.flags }]));
  return (
    <PositionsTable
      groups={lines.length ? [{ id: team.id, name: team.name, lines }] : []}
      cash={null}
      asOf={b?.session ?? todayNY()}
      spxPct={b?.spxDayPct ?? null}
      intraday={intraday}
      notes={notes}
      unheld={unheld}
      toolbar={toolbar}
      empty={empty}
    />
  );
}

async function LiveHoldingsTable({ market, ...props }: { rows: HoldingListRow[]; empty: string; showWeight: boolean; market: ReturnType<typeof marketSnapshot> }) {
  const snap = await market;
  const quotes: QuoteCells = {};
  for (const [ticker, m] of Object.entries(snap.rows)) quotes[ticker] = { price: m.quote?.price, changePct: m.quote?.changePct, relativePp: m.relativePp };
  return <HoldingsTable {...props} quotes={quotes} />;
}

/** Read once per request; a helper so the render stays free of impure calls. */
function nowMs() {
  return Date.now();
}
