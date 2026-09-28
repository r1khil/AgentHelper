import { Suspense } from "react";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { earnings, holdings, profiles, teams, type Team } from "@/db/schema";
import { canManageTeam, isFundWide, type CurrentUser } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { loadHootFeed } from "@/lib/hoot/nudges";
import { holdingHref } from "@/lib/scope";
import { rememberedScope } from "@/lib/teams";
import type { HootNudge } from "@/lib/hoot/types";
import { marketSnapshot, type MarketSnapshot } from "@/lib/market";
import { todayNY } from "@/lib/providers/calendar";
import { greetingWord, marketLine, monthDay, nextReportByTicker, nextSunday, reportDays, reportsLine, weekdayName, type UpcomingReport } from "@/lib/today";
import { EmptyState } from "@/components/app/empty-state";
import { ComingUp } from "./coming-up";
import { Greeting } from "./greeting";
import { HootList, TodayFeed } from "./hoot-list";
import { EveningBrief, LastSessionCard, LastSessionSkeleton } from "./last-session";
import { loadFundBook, loadTeamBook } from "./load";
import { TeamsPanel } from "./teams-panel";
import type { AgendaItem, Book, TeamRowData } from "./types";

/** Dates listed under Coming up; the rest are counted. */
const AGENDA_DAYS = 5;

/**
 * Today for one reader: Hoot's list, their teams on the last session, the result for the book they may see (the
 * whole fund for execs and admins, a lead's own team, nothing for everyone else), Hoot's brief and what's coming.
 */
export async function TodayView({ user, myTeams }: { user: CurrentUser; myTeams: Team[] }) {
  const firstName = user.fullName.split(" ")[0] || user.fullName;
  const now = new Date();
  if (myTeams.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <header>
          <div className="font-mono text-xs text-muted-foreground">{marketLine(now)}</div>
          <h1 className="mt-0.5 text-[28px] leading-tight font-semibold tracking-[-0.025em]">
            {greetingWord(now)}, {firstName}.
          </h1>
        </header>
        <EmptyState title="You are not on a team yet" hoot="wave">Ask a Fund admin to assign you to a sector team.</EmptyState>
      </div>
    );
  }

  const today = todayNY();
  const fundWide = isFundWide(user);
  const ownTeam = myTeams.find((t) => t.id === user.teamId) ?? null;
  // Position sizes and P&L: the whole fund for fund-wide roles, a lead's own team, nothing for everyone else.
  const bookTeam = !fundWide && ownTeam && canManageTeam(user, ownTeam.id) ? ownTeam : null;
  const teamIds = myTeams.map((t) => t.id);

  const [activeHoldings, upcoming, feed] = await Promise.all([
    db
      .select({ h: holdings, teamSlug: teams.slug, ownerName: profiles.fullName })
      .from(holdings)
      .innerJoin(teams, eq(teams.id, holdings.teamId))
      .leftJoin(profiles, eq(profiles.id, holdings.ownerId))
      .where(and(inArray(holdings.teamId, teamIds), eq(holdings.status, "active")))
      .orderBy(asc(teams.sortOrder), asc(holdings.ticker)),
    db
      .select({ ticker: holdings.ticker, reportDate: earnings.reportDate, reportHour: earnings.reportHour, dateStatus: earnings.dateStatus })
      .from(earnings)
      .innerJoin(holdings, eq(holdings.id, earnings.holdingId))
      .where(and(inArray(holdings.teamId, teamIds), eq(holdings.status, "active"), eq(earnings.status, "upcoming"), gte(earnings.reportDate, today)))
      .orderBy(asc(earnings.reportDate)) as Promise<UpcomingReport[]>,
    loadHootFeed(user).catch((e) => {
      console.error("[today] hoot feed failed", e);
      return { nudges: [] as HootNudge[] };
    }),
  ]);

  // Neither is awaited here: the greeting, list and Coming up render at once, and these stream into their sections.
  const market = marketSnapshot(activeHoldings.map((r) => r.h.ticker));
  const book = fundWide ? loadFundBook() : bookTeam ? loadTeamBook(bookTeam) : null;
  const scopeSlug = fundWide ? FUND_SCOPE_SLUG : (ownTeam ?? myTeams[0]).slug;
  // Holdings open in the scope the member is in when it shows them, so following one doesn't switch scope.
  const teamInput: TeamInput = { teams: myTeams, rows: activeHoldings, upcoming, scope: (await rememberedScope(user)) ?? scopeSlug };

  return (
    <TodayFeed initial={feed.nudges} loadedAt={now.toISOString()}>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Greeting
            hello={greetingWord(now)}
            name={firstName}
            dateLine={marketLine(now)}
            askHref={`/t/${scopeSlug}/agent`}
            analyst={user.role === "associate_analyst"}
            lead={
              book && (
                <Suspense fallback={null}>
                  <BookSentence book={book} />
                </Suspense>
              )
            }
          />
          <HootList />
          <Suspense fallback={<TeamsPanel title="Teams" teams={teamRows(teamInput)} withBook={!!book} live={false} holdingsHref={`/t/${scopeSlug}`} />}>
            <LiveTeams input={teamInput} market={market} book={book} holdingsHref={`/t/${scopeSlug}`} />
          </Suspense>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          {book && (
            <Suspense fallback={<LastSessionSkeleton />}>
              <LastSession book={book} />
            </Suspense>
          )}
          <ComingUp {...agenda(upcoming, today, fundWide)} today={today} calendarHref={`/t/${scopeSlug}/earnings`} />
        </div>
      </div>
    </TodayFeed>
  );
}

async function BookSentence({ book }: { book: Promise<Book> }) {
  const b = await book;
  return b.kind !== "none" && b.sentence ? <>{b.sentence} </> : null;
}

async function LastSession({ book }: { book: Promise<Book> }) {
  const b = await book;
  return (
    <>
      <LastSessionCard book={b} />
      {b.kind !== "none" && b.brief && <EveningBrief brief={b.brief} />}
    </>
  );
}

/* ----------------------------------------------------------------------------------------------- Teams */

type HoldingListRow = { h: typeof holdings.$inferSelect; teamSlug: string; ownerName: string | null };
type TeamInput = { teams: Team[]; rows: HoldingListRow[]; upcoming: UpcomingReport[]; scope: string };

async function LiveTeams({ input, market, book, holdingsHref }: { input: TeamInput; market: Promise<MarketSnapshot>; book: Promise<Book> | null; holdingsHref: string }) {
  const [m, b] = await Promise.all([market, book]);
  const withBook = !!b && b.kind !== "none";
  const title = b && b.kind !== "none" ? `Teams on ${weekdayName(b.sessionDate)}` : "Teams";
  return <TeamsPanel title={title} teams={teamRows(input, m, b ?? undefined)} withBook={withBook} live holdingsHref={holdingsHref} />;
}

/**
 * Each team's row: last session's return and contribution from attribution, the biggest mover (last session's
 * holding return from attribution; today's live move for readers without the book), and its holdings.
 */
function teamRows({ teams: teamList, rows, upcoming, scope }: TeamInput, market?: MarketSnapshot, book?: Book): TeamRowData[] {
  const next = nextReportByTicker(upcoming);
  const stats = book && book.kind !== "none" ? book : null;
  const change = (t: string) => market?.rows[t]?.quote?.changePct;

  const out = teamList.map((team): TeamRowData => {
    const mine = rows.filter((r) => r.h.teamId === team.id);
    if (market) mine.sort((a, b) => (change(b.h.ticker) ?? -Infinity) - (change(a.h.ticker) ?? -Infinity));
    const s = stats?.teams[team.id] ?? null;

    let mover: TeamRowData["mover"] = null;
    const sessionRows = s ? stats!.holdings.filter((h) => h.teamId === team.id) : [];
    if (sessionRows.length) {
      const top = sessionRows.reduce((a, b) => (Math.abs(b.ret) > Math.abs(a.ret) ? b : a));
      mover = { ticker: top.ticker, pct: top.ret * 100 };
    } else if (market) {
      for (const r of mine) {
        const c = change(r.h.ticker);
        if (c !== undefined && (!mover || Math.abs(c) > Math.abs(mover.pct))) mover = { ticker: r.h.ticker, pct: c };
      }
    }

    return {
      id: team.id,
      name: team.name,
      stats: s,
      mover,
      holdings: mine.map(({ h, teamSlug, ownerName }) => {
        const q = market?.rows[h.ticker];
        const report = next.get(h.ticker);
        return {
          id: h.id,
          ticker: h.ticker,
          href: holdingHref(scope, teamSlug, h.ticker),
          price: q?.quote?.price ?? null,
          currency: q?.quote?.currency ?? null,
          changePct: q?.quote?.changePct ?? null,
          relativePp: q?.relativePp ?? null,
          nextReport: report ? `${monthDay(report.reportDate)}${report.dateStatus === "estimated" ? " est." : ""}` : null,
          owner: ownerName,
        };
      }),
    };
  });
  // With the book, the team that added most leads; otherwise the fund's team order.
  return stats ? out.sort((a, b) => (b.stats?.contribution ?? -Infinity) - (a.stats?.contribution ?? -Infinity)) : out;
}

/* ----------------------------------------------------------------------------------------------- Coming up */

function agenda(upcoming: UpcomingReport[], today: string, weekly: boolean) {
  const { shown, moreCount, lastDate } = reportDays(upcoming, AGENDA_DAYS);
  const items: AgendaItem[] = shown.map((d) => {
    const line = reportsLine(d.reports);
    // "JPM before the open" reads as earnings; a bare ticker list does not.
    return { date: d.date, text: d.reports.some((r) => r.reportHour === "amc" || r.reportHour === "bmo") ? line : `Earnings: ${line}` };
  });
  // The Sunday run builds the weekly pack and emails it out.
  if (weekly) items.push({ date: nextSunday(today), text: "Weekly update pack goes out" });
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { items, moreCount, lastDate };
}
