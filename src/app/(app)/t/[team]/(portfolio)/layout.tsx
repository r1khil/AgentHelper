import { Suspense } from "react";
import { AddHoldingDialog } from "@/components/app/add-holding-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { PageHead } from "@/components/app/page-head";
import { TradeDialog } from "@/components/app/attribution/trade-dialog";
import { type HoldingListRow } from "@/components/app/holdings/holdings-table";
import { AskPill } from "@/components/app/portfolio/ask-pill";
import { loadFundBookView, loadTeamBookView } from "@/components/app/portfolio/book-load";
import { PortfolioFrame } from "@/components/app/portfolio/frame";
import { BookMovers, LastSessionCard, MarketMovers, RailCardSkeleton } from "@/components/app/portfolio/rail";
import { loadFundBook, loadTeamBook } from "@/components/app/portfolio/rail-load";
import { BookAsOf, BookHero, BookHeroFallback, BookStats, BookStatsFallback, MarketAsOf, MoveHero } from "@/components/app/portfolio/scope-hero";
import { TeamCard } from "@/components/app/portfolio/team-card";
import { WeeklyButton } from "@/components/app/portfolio/weekly-button";
import { Button } from "@/components/ui/button";
import { agentConfigured } from "@/lib/agent/model";
import { canManageTeam, isFundWide } from "@/lib/auth";
import { listTeamHoldings } from "@/lib/holdings";
import { loadLiveLedger } from "@/lib/portfolio/overview";
import { marketSnapshot } from "@/lib/market";
import { portfolioViews } from "@/lib/nav";
import { todayNY } from "@/lib/providers/calendar";
import { holdingHref } from "@/lib/scope";
import { loadScope } from "@/lib/teams";

// Recording a trade (the header's Record trade) backfills price history after the response.
export const maxDuration = 300;

/**
 * The Portfolio: the book in scope (the whole fund, or one team from "Whole fund ▾") and its six views. This layout
 * draws what every view shares: the header with its actions, the value, chart and five numbers, the view control and,
 * on Positions, the rail. Access is loadScope's: the fund for execs and admins (everyone else is sent to their team),
 * a team for its members. Position sizes and P&L are for execs, admins and the team's leads; everyone else sees the
 * team's move today.
 */
export default async function PortfolioLayout({ children, params }: { children: React.ReactNode; params: Promise<{ team: string }> }) {
  const { team: slug } = await params;
  const scope = await loadScope(slug);
  const { user } = scope;
  const fundWide = isFundWide(user);
  const today = todayNY();
  const base = `/t/${slug}`;
  const team = scope.kind === "team" ? scope.team : null;
  const seesBook = !team || canManageTeam(user, team.id);
  // Not awaited: the header and the view control draw at once and the numbers stream into place.
  const book = !team ? loadFundBookView() : seesBook ? loadTeamBookView(team.id, team.name) : null;
  const views = portfolioViews(team ? { slug } : "fund", { fundWide, seesBook });

  // Holdings open in the scope in view; each position's team gives its link.
  const teamSlugs = new Map([...scope.teamById.values()].map((t) => [t.id, t.slug]));
  const hrefFor = (ticker: string, teamId: string | null) => holdingHref(slug, teamSlugs.get(teamId ?? "") ?? slug, ticker);

  // A reader without the team's book: its holdings and their quotes, for the move today and the movers.
  const covered = team && !seesBook ? await listTeamHoldings(team.id) : [];
  const market = team && !seesBook ? marketSnapshot(covered.map((r) => r.h.ticker)) : null;
  const moveRows: HoldingListRow[] = covered.map(({ h }) => ({
    id: h.id,
    ticker: h.ticker,
    company: h.companyName,
    href: hrefFor(h.ticker, h.teamId),
    weightPct: h.weightPct == null ? null : Number(h.weightPct),
    shares: null,
    spark: [],
    nextReport: null,
    flags: [],
  }));

  const empty = (
    <EmptyState title={team ? `No positions for ${team.name}` : "Nothing in the ledger yet"} hoot="wave">
      {team ? `The ledger shows no current positions for ${team.name}. Its holdings are listed below.` : "The Portfolio is built from the trade ledger and closing prices. Record the opening positions from Activity, or import them from a CSV, and it fills in."}
    </EmptyState>
  );

  const head = (
    <PageHead
      crumbs={[{ label: "Portfolio" }]}
      scope
      tabs={false}
      asof={<Suspense fallback={null}>{book ? <BookAsOf book={book} /> : market ? <MarketAsOf market={market} /> : null}</Suspense>}
      actions={
        <>
          {fundWide && <WeeklyButton />}
          {team && <AddHoldingDialog teamId={team.id} primary={!fundWide} />}
          {fundWide && (
            <Suspense fallback={<Button disabled>Record trade</Button>}>
              <RecordTrade today={today} />
            </Suspense>
          )}
        </>
      }
    />
  );

  const hero = book ? (
    <>
      <Suspense fallback={<BookHeroFallback label={team?.name ?? "Owl Fund"} />}>
        <BookHero book={book} today={today} teamSlug={team?.slug} empty={empty} />
      </Suspense>
      <Suspense fallback={<BookStatsFallback />}>
        <BookStats book={book} base={base} teamId={team?.id ?? null} />
      </Suspense>
    </>
  ) : (
    <Suspense fallback={<BookHeroFallback label={team?.name} />}>
      <MoveHero teamName={team!.name} rows={moveRows} market={market!} />
    </Suspense>
  );

  const rail = (
    <>
      <AskPill teamSlug={team ? slug : null} configured={agentConfigured()} />
      <Suspense fallback={<RailCardSkeleton label="Loading today's moves" />}>
        {book ? (
          <BookMovers book={book} scopeSlug={slug} teamSlugs={Object.fromEntries(teamSlugs)} />
        ) : (
          <MarketMovers market={market!} hrefFor={Object.fromEntries(moveRows.map((r) => [r.ticker, r.href]))} names={Object.fromEntries(moveRows.map((r) => [r.ticker, r.company]))} />
        )}
      </Suspense>
      {seesBook && (
        <Suspense fallback={<RailCardSkeleton rows={4} label="Loading the last session" />}>
          <LastSessionCard book={team ? loadTeamBook(team) : loadFundBook()} />
        </Suspense>
      )}
      {team && (
        <Suspense fallback={<RailCardSkeleton rows={4} label={`Loading ${team.name}`} />}>
          <TeamCard team={team} scopeSlug={slug} today={today} />
        </Suspense>
      )}
    </>
  );

  return (
    <PortfolioFrame head={head} hero={hero} views={views} rail={rail} classicWhatIf={user.hoot?.layouts?.backtesting === "classic"}>
      {children}
    </PortfolioFrame>
  );
}

async function RecordTrade({ today }: { today: string }) {
  const live = await loadLiveLedger();
  return <TradeDialog today={today} positions={(live?.positions ?? []).map((p) => ({ ticker: p.ticker, shares: p.shares }))} primary />;
}
