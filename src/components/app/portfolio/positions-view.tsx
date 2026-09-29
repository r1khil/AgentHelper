import { Suspense } from "react";
import type { Team } from "@/db/schema";
import { EmptyState } from "@/components/app/empty-state";
import { attentionFlags, reportsWithin } from "@/components/app/holdings/attention";
import { HoldingsTable, type HoldingListRow, type QuoteCells } from "@/components/app/holdings/holdings-table";
import { HoldingsToolbar, type HoldingFilter } from "@/components/app/holdings/holdings-toolbar";
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
 * One team: its positions in the book (for the readers who see sizes: its leads, execs and admins), then the holdings
 * it covers with what needs attention, filtered by `?filter=`. The holdings come from the database at once and the
 * quotes stream in when Yahoo answers.
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
        { openMovement: s?.openMovement ?? null, nextReport: next, modelUpdates: s?.modelUpdates ?? 0, thesisProposed: s?.thesisProposed ?? false },
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

  return (
    <div className="flex flex-col">
      {book && (
        <Suspense fallback={<PositionsSkeleton rows={4} />}>
          <BookPositions book={loadTeamBookView(team.id, team.name)} teams={[team]} scopeSlug={slug} intraday={isFundWide(user)} />
        </Suspense>
      )}
      <HoldingsToolbar basePath={`/t/${slug}`} active={filter} counts={counts} aside={<Suspense fallback={<Skeleton className="h-4 w-48" />}><LiveMarketLine market={market} today={today} /></Suspense>} />
      {rows.length === 0 ? (
        <EmptyState title="No holdings yet" hoot="wave" className="mt-4">
          Add the tickers this team covers. Each one gets live prices, filings, news, and movement alerts.
        </EmptyState>
      ) : (
        <Suspense fallback={<HoldingsTable rows={shown} empty={emptyText} showWeight={book} />}>
          <LiveHoldingsTable rows={shown} empty={emptyText} showWeight={book} market={market} />
        </Suspense>
      )}
    </div>
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
