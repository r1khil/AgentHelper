import { Suspense } from "react";
import Link from "next/link";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { earnings, holdings, teams, type Team } from "@/db/schema";
import { canManageTeam, isFundWide, type CurrentUser } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { loadHootFeed } from "@/lib/hoot/nudges";
import { boardHref, holdingHref } from "@/lib/scope";
import { rememberedScope } from "@/lib/teams";
import { effectiveRunStatus, listGeneralChats, listRecentHoldingChats } from "@/lib/chats";
import type { HootNudge } from "@/lib/hoot/types";
import { agentConfigured } from "@/lib/agent/model";
import { liveScopeFor, loadLiveSnapshot } from "@/lib/attribution/live-load";
import type { LiveSnapshot } from "@/lib/attribution/live";
import { marketSnapshot, type MarketSnapshot } from "@/lib/market";
import { fmtBp, fmtChangePct, fmtDayMonth } from "@/lib/format";
import { todayNY } from "@/lib/providers/calendar";
import { greetingWord, marketLine, monthDay, nextReportByTicker, nextSunday, plusDays, reportDays, reportsLine, weekdayName, type UpcomingReport } from "@/lib/today";
import { EmptyState } from "@/components/app/empty-state";
import { AskComposer, PromptChips, type AskScope } from "@/components/app/agent/ask-composer";
import { NoPageHead } from "@/components/app/page-head";
import { ComingUp } from "./coming-up";
import { HomeGreeting, HomeTopLine } from "./greeting";
import { NeedsYou, TodayFeed } from "./hoot-list";
import { EveningBrief, LastSessionCard, LastSessionSkeleton } from "./last-session";
import { loadFundBook, loadTeamBook } from "./load";
import { Movers, MoversSkeleton, type MoverRow } from "./movers";
import { TeamsPanel } from "./teams-panel";
import type { AgendaItem, Book, TeamRowData } from "./types";

/** Movers listed under "Moving the book today". */
const MOVERS = 5;
/** Days "This week" looks ahead. */
const WEEK_DAYS = 6;

const LEARNING_BOUNDARY = "Hoot finds and cites the evidence. The analysis and the write-ups stay yours.";

/**
 * Home for one reader: the greeting and one sentence on the book, the question box with starter questions and the chats
 * to pick up, then what needs them, what is moving the book today and what is coming this week. Below: the last
 * session, Hoot's evening brief and the teams. The book (position sizes and P&L) is the whole fund for execs and
 * admins, a lead's own team, and nothing for everyone else, who see today's moves in their holdings without sizes.
 */
export async function TodayView({ user, myTeams }: { user: CurrentUser; myTeams: Team[] }) {
  const firstName = user.fullName.split(" ")[0] || user.fullName;
  const now = new Date();
  if (myTeams.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-5 pt-10">
        <NoPageHead />
        <h1 className="text-center font-serif text-hero font-normal tracking-[-0.02em]">
          Good {greetingWord(now).toLowerCase()}, {firstName}.
        </h1>
        <EmptyState title="You are not on a team yet" hoot="wave">
          Ask a Fund admin to assign you to a sector team.
        </EmptyState>
      </div>
    );
  }

  const today = todayNY();
  const fundWide = isFundWide(user);
  const ownTeam = myTeams.find((t) => t.id === user.teamId) ?? null;
  // Position sizes and P&L: the whole fund for fund-wide roles, a lead's own team, nothing for everyone else.
  const bookTeam = !fundWide && ownTeam && canManageTeam(user, ownTeam.id) ? ownTeam : null;
  const teamIds = myTeams.map((t) => t.id);
  const viewer = { fundWide };

  const [activeHoldings, upcoming, feed, generalChats, holdingChats] = await Promise.all([
    db
      .select({ h: holdings, teamSlug: teams.slug })
      .from(holdings)
      .innerJoin(teams, eq(teams.id, holdings.teamId))
      .where(and(inArray(holdings.teamId, teamIds), eq(holdings.status, "active")))
      .orderBy(asc(teams.sortOrder), asc(holdings.ticker)),
    db
      .select({ ticker: holdings.ticker, reportDate: earnings.reportDate, reportHour: earnings.reportHour, dateStatus: earnings.dateStatus })
      .from(earnings)
      .innerJoin(holdings, eq(holdings.id, earnings.holdingId))
      .where(and(inArray(holdings.teamId, teamIds), eq(holdings.status, "active"), eq(earnings.status, "upcoming"), gte(earnings.reportDate, today)))
      .orderBy(asc(earnings.reportDate)) as Promise<UpcomingReport[]>,
    loadHootFeed(user).catch((e) => {
      console.error("[home] hoot feed failed", e);
      return { nudges: [] as HootNudge[] };
    }),
    listGeneralChats(teamIds, viewer, 3).catch(() => []),
    listRecentHoldingChats(teamIds, viewer, 3).catch(() => []),
  ]);

  // None of these is awaited here: the greeting, the box and the lists render at once, and each streams into its place.
  const market = marketSnapshot(activeHoldings.map((r) => r.h.ticker));
  const book = fundWide ? loadFundBook() : bookTeam ? loadTeamBook(bookTeam) : null;
  const live: Promise<LiveSnapshot | null> | null =
    fundWide || bookTeam
      ? (async () => {
          const scope = await liveScopeFor(user, fundWide ? null : bookTeam!.slug);
          return scope ? loadLiveSnapshot(scope) : null;
        })().catch((e) => {
          console.error("[home] live snapshot failed", e);
          return null;
        })
      : null;
  const scopeSlug = fundWide ? FUND_SCOPE_SLUG : (ownTeam ?? myTeams[0]).slug;
  // Holdings open in the scope the member is in when it shows them, so following one doesn't switch scope.
  const linkScope = (await rememberedScope(user)) ?? scopeSlug;
  const teamInput: TeamInput = { teams: myTeams, rows: activeHoldings, upcoming, scope: linkScope };
  const holdingLink = new Map(activeHoldings.map((r) => [r.h.ticker, holdingHref(linkScope, r.teamSlug, r.h.ticker)]));

  const configured = agentConfigured();
  const scopes: AskScope[] = fundWide ? [{ label: "Whole fund", slug: null }, ...myTeams.map((t) => ({ label: t.name, slug: t.slug }))] : myTeams.map((t) => ({ label: t.name, slug: t.slug }));
  const askSlug = fundWide ? null : (ownTeam ?? myTeams[0]).slug;
  const thesisTicker = activeHoldings.find((r) => r.h.thesis?.trim())?.h.ticker ?? null;
  const recent = [
    ...generalChats.map(({ c }) => ({ id: c.id, title: c.title, href: `/hoot/${c.id}`, at: c.updatedAt.getTime(), running: effectiveRunStatus(c) === "running" })),
    ...holdingChats.map(({ c, ticker, teamSlug }) => ({ id: c.id, title: `${ticker} · ${c.title}`, href: boardHref(linkScope, teamSlug, ticker, c.id), at: c.updatedAt.getTime(), running: effectiveRunStatus(c) === "running" })),
  ]
    .filter((c) => c.title !== "New chat")
    .sort((a, b) => b.at - a.at)
    .slice(0, 3);
  const week = weekAgenda(upcoming, today, fundWide);

  return (
    <TodayFeed initial={feed.nudges} loadedAt={now.toISOString()}>
      <NoPageHead />
      <div className="-mx-10 -mt-8">
        <HomeTopLine dateLine={marketLine(now)} />
      </div>
      <div className="mx-auto flex w-full max-w-[760px] flex-col pt-10">
        <HomeGreeting
          hello={greetingWord(now)}
          name={firstName}
          analyst={user.role === "associate_analyst"}
          lead={
            live && (
              <Suspense fallback={null}>
                <BookLine live={live} name={fundWide ? "The fund" : bookTeam!.name} today={today} />
              </Suspense>
            )
          }
        />
        <div className="mt-[26px]">
          <AskComposer scopes={scopes} defaultScope={askSlug} placeholder="Ask about the book, a holding, a filing, or the tape…" note="Looks in the book, the team Drive, SEC filings and the web" configured={configured} />
        </div>
        {!configured && <p className="mt-2.5 text-center text-body font-medium text-caution-foreground">Hoot isn&rsquo;t set up yet: an admin needs to turn it on.</p>}
        <p className="mt-2.5 text-center text-caption text-muted-foreground">{LEARNING_BOUNDARY}</p>
        <div className="mt-[18px]">
          <Suspense fallback={<PromptChips prompts={starterChips({ live: null, mover: null, thesisTicker })} teamSlug={askSlug} configured={configured} />}>
            <Chips live={live} market={market} thesisTicker={thesisTicker} teamSlug={askSlug} configured={configured} />
          </Suspense>
        </div>
        {recent.length > 0 && (
          <div className="mt-3.5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
            <span>Pick up where you left off</span>
            {recent.map((c) => (
              <Link key={c.id} href={c.href} className="max-w-[220px] truncate text-ink-3 hover:text-foreground hover:underline">
                {c.running ? "Answering… " : ""}
                {c.title === "New chat" ? "New conversation" : c.title}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mx-auto mt-12 grid w-full max-w-[1048px] grid-cols-3 items-start gap-10">
        <NeedsYou />
        <Suspense fallback={<MoversSkeleton />}>
          <MoversColumn live={live} market={market} holdingLink={holdingLink} portfolioHref={fundWide ? `/t/${FUND_SCOPE_SLUG}` : `/t/${scopeSlug}`} />
        </Suspense>
        <ComingUp {...week} today={today} calendarHref={`/t/${scopeSlug}/earnings`} />
      </div>

      {book && (
        <div className="mx-auto mt-14 grid w-full max-w-[1048px] grid-cols-2 items-start gap-10">
          <Suspense fallback={<LastSessionSkeleton />}>
            <LastSession book={book} />
          </Suspense>
        </div>
      )}
      <div className="mx-auto mt-12 w-full max-w-[1048px]">
        <Suspense fallback={<TeamsPanel title="Teams" teams={teamRows(teamInput)} withBook={!!book} live={false} holdingsHref={`/t/${scopeSlug}`} />}>
          <LiveTeams input={teamInput} market={market} book={book} holdingsHref={`/t/${scopeSlug}`} />
        </Suspense>
      </div>
    </TodayFeed>
  );
}

/** The sentence's first half, from today's live numbers: "The fund is +0.39% today, 12 bp ahead of its benchmark." */
async function BookLine({ live, name, today }: { live: Promise<LiveSnapshot | null>; name: string; today: string }) {
  const s = await live;
  if (!s) return null;
  const ret = s.ret * 100;
  const diff = s.result.activeReturn === null ? null : Math.round(s.result.activeReturn * 10_000);
  const tone = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-foreground");
  const when = s.session === today ? "today" : `on ${weekdayName(s.session)}`;
  return (
    <>
      {name} {s.session === today ? "is" : "was"} <b className={`font-semibold ${tone(ret)}`}>{fmtChangePct(ret)}</b> {when}
      {diff === null ? "" : diff === 0 ? ", in line with its benchmark" : <>, <b className={`font-semibold ${tone(diff)}`}>{fmtBp(Math.abs(diff))}</b> {diff > 0 ? "ahead of" : "behind"} its benchmark</>}.{" "}
    </>
  );
}

/** The holdings that moved the book most today; for readers without the book, the biggest moves among their holdings. */
async function MoversColumn({ live, market, holdingLink, portfolioHref }: { live: Promise<LiveSnapshot | null> | null; market: Promise<MarketSnapshot>; holdingLink: Map<string, string>; portfolioHref: string }) {
  const s = live ? await live : null;
  if (s) {
    const rows: MoverRow[] = [...s.holdings]
      .filter((h) => !h.etf || h.contribution !== 0)
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, MOVERS)
      .map((h) => ({ ticker: h.ticker, name: h.name, pct: h.ret * 100, bp: h.contribution * 10_000, href: holdingLink.get(h.ticker) }));
    const note = s.status === "final" ? undefined : s.status === "live" ? "Prices are live during market hours." : "Market closed; priced from closing quotes.";
    return <Movers rows={rows} portfolioHref={portfolioHref} note={s.session ? note : undefined} />;
  }
  const m = await market;
  const rows: MoverRow[] = Object.entries(m.rows)
    .flatMap(([ticker, r]) => (r.quote?.changePct === undefined ? [] : [{ ticker, name: "", pct: r.quote.changePct, bp: null, href: holdingLink.get(ticker) }]))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, MOVERS);
  return <Movers rows={rows} portfolioHref={portfolioHref} note={rows.length === 0 ? "Quotes are unavailable right now." : "Prices are live during market hours."} />;
}

/** The starter questions, made from what is happening: the biggest mover, the book against its benchmark. */
function starterChips({ live, mover, thesisTicker }: { live: LiveSnapshot | null; mover: { ticker: string; date: string } | null; thesisTicker: string | null }) {
  const diff = live?.result.activeReturn ?? null;
  return [
    diff === null || diff === 0 ? "What moved the market today, and what touches our holdings?" : `Why are we ${diff > 0 ? "ahead of" : "behind"} the benchmark today?`,
    mover ? `Pull the news on ${mover.ticker}’s ${fmtDayMonth(mover.date)} move` : null,
    "What’s on the calendar that touches the book?",
    thesisTicker ? `What changed on ${thesisTicker} since the thesis?` : null,
  ].filter((q): q is string => !!q);
}

async function Chips({ live, market, thesisTicker, teamSlug, configured }: { live: Promise<LiveSnapshot | null> | null; market: Promise<MarketSnapshot>; thesisTicker: string | null; teamSlug: string | null; configured: boolean }) {
  const s = live ? await live : null;
  let mover: { ticker: string; date: string } | null = null;
  if (s) {
    const top = [...s.holdings].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0];
    if (top) mover = { ticker: top.ticker, date: s.session };
  } else {
    const m = await market;
    const top = Object.entries(m.rows)
      .flatMap(([ticker, r]) => (r.quote?.changePct === undefined ? [] : [{ ticker, pct: r.quote.changePct }]))
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
    if (top) mover = { ticker: top.ticker, date: todayNY() };
  }
  return <PromptChips prompts={starterChips({ live: s, mover, thesisTicker })} teamSlug={teamSlug} configured={configured} />;
}

async function LastSession({ book }: { book: Promise<Book> }) {
  const b = await book;
  return (
    <>
      <LastSessionCard book={b} />
      {b.kind !== "none" && b.brief ? <EveningBrief brief={b.brief} /> : <div />}
    </>
  );
}

/* ----------------------------------------------------------------------------------------------- Teams */

type HoldingListRow = { h: typeof holdings.$inferSelect; teamSlug: string };
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
      holdings: mine.map(({ h, teamSlug }) => {
        const q = market?.rows[h.ticker];
        const report = next.get(h.ticker);
        return {
          id: h.id,
          ticker: h.ticker,
          company: h.companyName,
          href: holdingHref(scope, teamSlug, h.ticker),
          price: q?.quote?.price ?? null,
          currency: q?.quote?.currency ?? null,
          changePct: q?.quote?.changePct ?? null,
          relativePp: q?.relativePp ?? null,
          nextReport: report ? `${monthDay(report.reportDate)}${report.dateStatus === "estimated" ? " est." : ""}` : null,
        };
      }),
    };
  });
  // With the book, the team that added most leads; otherwise the fund's team order.
  return stats ? out.sort((a, b) => (b.stats?.contribution ?? -Infinity) - (a.stats?.contribution ?? -Infinity)) : out;
}

/* ----------------------------------------------------------------------------------------------- This week */

/** The next seven days of earnings (and the Sunday weekly pack for execs and admins); the reports beyond them are counted. */
function weekAgenda(upcoming: UpcomingReport[], today: string, weekly: boolean) {
  const { shown } = reportDays(upcoming, Number.MAX_SAFE_INTEGER);
  const end = plusDays(today, WEEK_DAYS);
  const inWeek = shown.filter((d) => d.date <= end);
  const later = shown.filter((d) => d.date > end);
  const items: AgendaItem[] = inWeek.map((d) => {
    const line = reportsLine(d.reports);
    // "JPM before the open" reads as earnings; a bare ticker list does not.
    return { date: d.date, text: d.reports.some((r) => r.reportHour === "amc" || r.reportHour === "bmo") ? line : `Earnings: ${line}` };
  });
  // The Sunday run builds the weekly pack and emails it out.
  const sunday = nextSunday(today);
  if (weekly && sunday <= end) items.push({ date: sunday, text: "Weekly update pack goes out" });
  items.sort((a, b) => a.date.localeCompare(b.date));
  const moreCount = later.flatMap((d) => d.reports).length;
  return { items, moreCount, lastDate: later.length ? later[later.length - 1].date : null };
}
