import Link from "next/link";
import { Suspense } from "react";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { ChevronRight, MessageCircle } from "lucide-react";
import { db } from "@/db/client";
import { earnings, holdings, jobRuns, profiles, teams, type Team } from "@/db/schema";
import { canManageTeam, isFundWide, type CurrentUser } from "@/lib/auth";
import { computeAttribution, computeTeamAttribution, type HoldingRow } from "@/lib/attribution/attribution";
import { loadAttributionSeries, loadTeamSectors } from "@/lib/attribution/load";
import { resolvePeriod } from "@/lib/attribution/periods";
import { indexReturn } from "@/lib/attribution/view";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { fmtAccounting, fmtMoney } from "@/lib/format";
import { marketSnapshot, type MarketSnapshot } from "@/lib/market";
import { todayNY } from "@/lib/providers/calendar";
import type { Source } from "@/lib/providers/types";
import { greeting, inDays, longDate, monthDay, nextReportByTicker, nextSunday, reportDays, reportsLine, sessionHeading, shortDate, type UpcomingReport } from "@/lib/today";
import { Accounting } from "@/components/app/accounting";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Dates listed under Coming up; the rest are counted. */
const AGENDA_DAYS = 5;
const MOVERS = 5;

type Effects = { allocation: number; selection: number; interaction: number };

/** The last session's attribution for the book this reader may see: the whole fund, or a lead's own team. */
type Book =
  | {
      kind: "fund" | "team";
      sessionDate: string;
      stats: { label: string; value: number | null; unit: "%" | " bps" }[];
      /** Active return and effects against the sector benchmark, in decimals. */
      benchmark: { active: number | null; effects: Effects | null };
      /** The team sleeve's share of the whole fund's return, in decimals. */
      toFund?: number;
      holdings: HoldingRow[];
      /** Return and contribution to the fund per team id, in decimals. */
      teams: Map<string, { ret: number; contribution: number }>;
      href: string;
      /** `stale`: the fund's return has been revised since Hoot wrote it (a late close or a ledger fix). */
      brief: { paragraphs: string[]; sources: Source[]; stale: boolean } | null;
    }
  | { kind: "none"; message: string };

/** The Today page for one reader: last session's results for the book they may see, their teams, and what's coming. */
export async function TodayView({ user, myTeams }: { user: Pick<CurrentUser, "fullName" | "role" | "teamId">; myTeams: Team[] }) {
  const firstName = user.fullName.split(" ")[0] || user.fullName;
  if (myTeams.length === 0) {
    return (
      <>
        <PageHeader title={`${greeting()}, ${firstName}`} description={longDate(todayNY())} />
        <EmptyState title="You are not on a team yet" hoot="wave">Ask a Fund admin to assign you to a sector team.</EmptyState>
      </>
    );
  }

  const today = todayNY();
  const fundWide = isFundWide(user);
  const ownTeam = myTeams.find((t) => t.id === user.teamId) ?? null;
  // Position sizes and P&L: the whole fund for fund-wide roles, a lead's own team, nothing for everyone else.
  const bookTeam = !fundWide && ownTeam && canManageTeam(user, ownTeam.id) ? ownTeam : null;
  const teamIds = myTeams.map((t) => t.id);

  const [activeHoldings, upcomingRows] = await Promise.all([
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
      .orderBy(asc(earnings.reportDate)),
  ]);
  const upcoming: UpcomingReport[] = upcomingRows;

  // Neither is awaited here: the header and Coming up render at once, and these stream into their sections.
  const market = marketSnapshot(activeHoldings.map((r) => r.h.ticker));
  const book = fundWide ? loadFundBook() : bookTeam ? loadTeamBook(bookTeam) : null;
  const scopeSlug = fundWide ? FUND_SCOPE_SLUG : (ownTeam ?? myTeams[0]).slug;

  return (
    <div className="max-w-5xl space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{longDate(today)}</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">
            {greeting()}, {firstName}
          </h1>
        </div>
        <Button nativeButton={false} variant="outline" size="sm" render={<Link href={`/t/${scopeSlug}/agent`} />}>
          <MessageCircle />
          Ask Hoot
        </Button>
      </header>

      {book && (
        <Suspense fallback={<YesterdaySkeleton />}>
          <Yesterday book={book} today={today} />
        </Suspense>
      )}

      <section data-tour="today-teams" className="space-y-3">
        <SectionHead title="Teams" aside="Open a team to see its holdings" />
        <Suspense fallback={<TeamList teams={myTeams} rows={activeHoldings} upcoming={upcoming} openId={ownTeam?.id ?? null} />}>
          <LiveTeamList teams={myTeams} rows={activeHoldings} upcoming={upcoming} market={market} book={book} openId={fundWide ? null : (ownTeam?.id ?? null)} />
        </Suspense>
      </section>

      <ComingUp upcoming={upcoming} today={today} weekly={fundWide} earningsHref={`/t/${scopeSlug}/earnings`} />
    </div>
  );
}

function SectionHead({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {aside && <div className="text-sm text-muted-foreground">{aside}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- Yesterday */

async function loadFundBook(): Promise<Book> {
  try {
    const loaded = await loadAttributionSeries();
    if (!loaded.inception || !loaded.latest) return { kind: "none", message: loaded.inception ? "Closing prices have not loaded yet." : "No trades are recorded in the ledger yet." };
    const period = resolvePeriod("1d", { inception: loaded.inception, latest: loaded.latest });
    const r = computeAttribution(loaded.series, period);
    const spx = indexReturn(loaded, period);
    return {
      kind: "fund",
      sessionDate: period.end,
      stats: [
        { label: "Fund", value: r.portfolioReturn * 100, unit: "%" },
        { label: "S&P 500", value: spx === null ? null : spx * 100, unit: "%" },
        { label: "Difference", value: spx === null ? null : Math.round((r.portfolioReturn - spx) * 10_000), unit: " bps" },
      ],
      benchmark: { active: r.activeReturn, effects: r.effects },
      holdings: r.holdings,
      teams: new Map(r.teams.filter((t) => t.teamId).map((t) => [t.teamId!, { ret: t.ret, contribution: t.contribution }])),
      href: "/attribution",
      brief: await loadBrief(period.end, r.portfolioReturn),
    };
  } catch (e) {
    console.error("[today] fund attribution failed", e);
    return { kind: "none", message: "Attribution could not be calculated just now." };
  }
}

async function loadTeamBook(team: Team): Promise<Book> {
  try {
    const [loaded, sectorMap] = await Promise.all([loadAttributionSeries(), loadTeamSectors()]);
    if (!loaded.inception || !loaded.latest) return { kind: "none", message: loaded.inception ? "Closing prices have not loaded yet." : "No trades are recorded in the ledger yet." };
    const period = resolvePeriod("1d", { inception: loaded.inception, latest: loaded.latest });
    const r = computeTeamAttribution(loaded.series, period, team.id, sectorMap.get(team.id) ?? []);
    return {
      kind: "team",
      sessionDate: period.end,
      stats: [
        { label: team.name, value: r.portfolioReturn * 100, unit: "%" },
        { label: "Sector benchmark", value: r.benchmarkReturn === null ? null : r.benchmarkReturn * 100, unit: "%" },
        { label: "Difference", value: r.activeReturn === null ? null : Math.round(r.activeReturn * 10_000), unit: " bps" },
      ],
      benchmark: { active: r.activeReturn, effects: r.effects },
      toFund: r.fundContribution,
      holdings: r.holdings,
      teams: new Map([[team.id, { ret: r.portfolioReturn, contribution: r.fundContribution }]]),
      href: `/t/${team.slug}/attribution`,
      brief: null,
    };
  } catch (e) {
    console.error("[today] team attribution failed", e);
    return { kind: "none", message: "Attribution could not be calculated just now." };
  }
}

/** Hoot's evening brief for the session, when it was written. */
async function loadBrief(sessionDate: string, fundReturn: number): Promise<{ paragraphs: string[]; sources: Source[]; stale: boolean } | null> {
  const [row] = await db
    .select({ summary: jobRuns.summary })
    .from(jobRuns)
    .where(and(eq(jobRuns.job, "daily_brief"), eq(jobRuns.ok, true), sql`${jobRuns.summary}->>'sessionDate' = ${sessionDate}`, sql`${jobRuns.summary}->>'analysis' is not null`))
    .orderBy(desc(jobRuns.startedAt))
    .limit(1);
  const s = row?.summary as { analysis?: string; sources?: Source[]; facts?: string } | undefined;
  const paragraphs = (s?.analysis ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // The figures block Hoot read opens "Fund return: -0.29%".
  const written = /Fund return:\s*(-?[\d.]+)%/.exec(s?.facts ?? "")?.[1];
  const stale = written !== undefined && Number(written).toFixed(2) !== (fundReturn * 100).toFixed(2);
  return paragraphs.length ? { paragraphs, sources: Array.isArray(s?.sources) ? s.sources : [], stale } : null;
}

const bps = (x: number) => Math.round(x * 10_000);

function moversLine(rows: HoldingRow[]) {
  return rows.map((h) => `${h.ticker} ${fmtAccounting(bps(h.contribution), 0)}`).join(" · ");
}

async function Yesterday({ book: pending, today }: { book: Promise<Book>; today: string }) {
  const book = await pending;
  if (book.kind === "none") {
    return (
      <section className="space-y-3">
        <SectionHead title="Yesterday" />
        <p className="border-y py-4 text-sm text-muted-foreground">{book.message}</p>
      </section>
    );
  }
  const sorted = [...book.holdings].sort((a, b) => b.contribution - a.contribution);
  const helped = sorted.filter((h) => bps(h.contribution) > 0).slice(0, MOVERS);
  const hurt = sorted.filter((h) => bps(h.contribution) < 0).reverse().slice(0, MOVERS);
  const e = book.benchmark.effects;
  const [lead, ...rest] = book.brief?.paragraphs ?? [];

  return (
    <section data-tour="today-result" className="space-y-4">
      <SectionHead title={sessionHeading(today, book.sessionDate)} aside={longDate(book.sessionDate)} />
      <div className="grid grid-cols-3 gap-4 border-y py-4">
        {book.stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <div className="truncate text-sm text-muted-foreground">{s.label}</div>
            <Accounting value={s.value} digits={s.unit === "%" ? 2 : 0} unit={s.unit} tone={s.label !== "S&P 500" && s.label !== "Sector benchmark"} className="mt-1 block text-[26px] font-semibold tracking-tight" />
          </div>
        ))}
      </div>

      {lead && (
        <div className="space-y-1">
          <p className="text-[15px] leading-relaxed">{lead}</p>
          {book.brief?.stale && <p className="text-xs text-muted-foreground">Hoot wrote this from the evening figures, which have since been revised. The numbers above are current.</p>}
        </div>
      )}

      <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-y-2 text-sm">
        <dt className="text-muted-foreground">Helped most, bps</dt>
        <dd className="tnum">{helped.length ? moversLine(helped) : "—"}</dd>
        <dt className="text-muted-foreground">Hurt most, bps</dt>
        <dd className="tnum">{hurt.length ? moversLine(hurt) : "—"}</dd>
        {book.kind === "fund" ? (
          <>
            <dt className="text-muted-foreground">vs sector benchmark</dt>
            <dd className="tnum">{benchmarkLine(book.benchmark.active, e)}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">Effects, bps</dt>
            <dd className="tnum">{e ? `allocation ${fmtAccounting(bps(e.allocation), 0)}, selection ${fmtAccounting(bps(e.selection), 0)}, interaction ${fmtAccounting(bps(e.interaction), 0)}` : "—"}</dd>
            <dt className="text-muted-foreground">To the fund</dt>
            <dd className="tnum">{fmtAccounting(bps(book.toFund ?? 0), 0, " bps")}</dd>
          </>
        )}
      </dl>

      {rest.length > 0 || (book.brief?.sources.length ?? 0) > 0 ? (
        <details className="group text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-medium [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
            Hoot&apos;s full brief
          </summary>
          <div className="mt-3 space-y-3 border-l pl-4 text-[15px] leading-relaxed">
            {rest.map((p, i) => (
              <p key={i} className="whitespace-pre-line">{p}</p>
            ))}
            {book.brief!.sources.length > 0 && (
              <ol className="space-y-1 text-sm text-muted-foreground">
                {book.brief!.sources.map((s, i) => (
                  <li key={s.id}>
                    [{i + 1}]{" "}
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">{s.title}</a>
                    ) : (
                      s.title
                    )}{" "}
                    · {s.publisher}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </details>
      ) : null}

      <Link href={book.href} className="inline-block text-sm font-medium hover:underline">
        Attribution →
      </Link>
    </section>
  );
}

function benchmarkLine(active: number | null, e: Effects | null) {
  if (active === null) return "—";
  const parts = e ? `: allocation ${fmtAccounting(bps(e.allocation), 0)}, selection ${fmtAccounting(bps(e.selection), 0)}, interaction ${fmtAccounting(bps(e.interaction), 0)}` : "";
  return `${fmtAccounting(bps(active), 0, " bps")}${parts}`;
}

function YesterdaySkeleton() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Loading yesterday's results">
      <Skeleton className="h-5 w-28" />
      <div className="grid grid-cols-3 gap-4 border-y py-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </section>
  );
}

/* ----------------------------------------------------------------------------------------------- Teams */

type HoldingListRow = { h: typeof holdings.$inferSelect; teamSlug: string; ownerName: string | null };
type TeamListProps = { teams: Team[]; rows: HoldingListRow[]; upcoming: UpcomingReport[]; openId: string | null; market?: MarketSnapshot; book?: Book };

async function LiveTeamList({ market, book, ...rest }: Omit<TeamListProps, "market" | "book"> & { market: Promise<MarketSnapshot>; book: Promise<Book> | null }) {
  const [m, b] = await Promise.all([market, book]);
  return <TeamList {...rest} market={m} book={b ?? undefined} />;
}

/** Without `market` the quote columns show placeholders; that is the Suspense fallback while quotes load. */
function TeamList({ teams: teamList, rows, upcoming, openId, market, book }: TeamListProps) {
  const next = nextReportByTicker(upcoming);
  const stats = book && book.kind !== "none" ? book.teams : null;
  // Fund-wide readers start on the team that moved the fund most; everyone else on their own team.
  const open = openId ?? (stats ? [...stats.entries()].sort((a, b) => Math.abs(b[1].contribution) - Math.abs(a[1].contribution))[0]?.[0] : teamList[0]?.id);
  const change = (t: string) => market?.rows[t]?.quote?.changePct;

  return (
    <>
      <div className="border-t">
        {teamList.map((team) => {
          const mine = rows.filter((r) => r.h.teamId === team.id);
          if (market) mine.sort((a, b) => (change(b.h.ticker) ?? -Infinity) - (change(a.h.ticker) ?? -Infinity));
          const s = stats?.get(team.id);
          return (
            <details key={team.id} open={team.id === open} className="group border-b">
              <summary className="grid cursor-pointer list-none grid-cols-[20px_minmax(0,1fr)_96px_96px] items-center gap-3 py-3 text-[15px] [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{team.name}</span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {mine.length} {mine.length === 1 ? "holding" : "holdings"}
                  </span>
                </span>
                {stats ? <Accounting value={s ? s.ret * 100 : null} unit="%" className="text-right font-semibold" /> : <span />}
                {stats ? <Accounting value={s ? bps(s.contribution) : null} digits={0} unit=" bps" className="text-right" /> : <span />}
              </summary>
              <div className="mb-3 ml-8">
                {mine.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">No active holdings.</p>
                ) : (
                  <div role="table" aria-label={`${team.name} holdings`} className="text-sm">
                    <div role="row" className={cn(ROW, "py-1.5 text-xs text-muted-foreground")}>
                      <span role="columnheader">Holding</span>
                      <span role="columnheader" className="text-right">Price</span>
                      <span role="columnheader" className="text-right">Day</span>
                      <span role="columnheader" className="text-right">vs S&amp;P</span>
                      <span role="columnheader" className="text-right">Next earnings</span>
                      <span role="columnheader">Owner</span>
                    </div>
                    {mine.map(({ h, teamSlug, ownerName }) => {
                      const q = market?.rows[h.ticker];
                      const report = next.get(h.ticker);
                      return (
                        <div role="row" key={h.id} className={cn(ROW, "border-t border-border/60 py-2")}>
                          <span role="cell">
                            <Link href={`/t/${teamSlug}/h/${h.ticker}`} className="font-semibold hover:underline">{h.ticker}</Link>
                          </span>
                          {market ? (
                            <>
                              <span role="cell" className="tnum flex justify-between text-muted-foreground">
                                {q?.quote ? (
                                  <>
                                    <span>$</span>
                                    <span className="text-foreground">{fmtMoney(q.quote.price)}</span>
                                  </>
                                ) : (
                                  <span className="ml-auto">—</span>
                                )}
                              </span>
                              <span role="cell" className="text-right"><Accounting value={q?.quote?.changePct} unit="%" /></span>
                              <span role="cell" className="text-right text-muted-foreground"><Accounting value={q?.relativePp} unit=" pp" tone={false} /></span>
                            </>
                          ) : (
                            <>
                              <span role="cell"><Skeleton className="ml-auto h-4 w-16" /></span>
                              <span role="cell"><Skeleton className="ml-auto h-4 w-12" /></span>
                              <span role="cell"><Skeleton className="ml-auto h-4 w-12" /></span>
                            </>
                          )}
                          <span role="cell" className="tnum text-right text-muted-foreground">
                            {report ? `${monthDay(report.reportDate)}${report.dateStatus === "estimated" ? " est." : ""}` : "—"}
                          </span>
                          <span role="cell" className="truncate text-muted-foreground">{ownerName ?? "Unassigned"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {stats && book && book.kind !== "none" ? `Team return, then contribution to the fund, for ${monthDay(book.sessionDate)}. ` : ""}
        Holding prices are live during market hours.
      </p>
    </>
  );
}

const ROW = "grid grid-cols-[minmax(0,1fr)_96px_88px_88px_104px_minmax(0,140px)] items-center gap-3";

/* ----------------------------------------------------------------------------------------------- Coming up */

function ComingUp({ upcoming, today, weekly, earningsHref }: { upcoming: UpcomingReport[]; today: string; weekly: boolean; earningsHref: string }) {
  const { shown, moreCount, lastDate } = reportDays(upcoming, AGENDA_DAYS);
  const items = shown.map((d) => ({ date: d.date, text: `Earnings: ${reportsLine(d.reports)}` }));
  // The Sunday run builds the weekly pack and asks the execs for their updates.
  if (weekly) items.push({ date: nextSunday(today), text: "Weekly update: the pack is built and execs are asked for their updates" });
  items.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section data-tour="today-next" className="space-y-3">
      <SectionHead
        title="Coming up"
        aside={
          <Link href={earningsHref} className="hover:underline">
            All earnings →
          </Link>
        }
      />
      {items.length === 0 ? (
        <p className="border-y py-4 text-sm text-muted-foreground">No earnings dates yet. They refresh every morning for each holding.</p>
      ) : (
        <ul className="border-t">
          {items.map((i) => (
            <li key={`${i.date}-${i.text}`} className="grid grid-cols-[110px_minmax(0,1fr)_96px] items-baseline gap-3 border-b py-3 text-[15px]">
              <span className="font-semibold">{shortDate(i.date)}</span>
              <span>{i.text}</span>
              <span className="text-right text-sm text-muted-foreground">{inDays(today, i.date)}</span>
            </li>
          ))}
        </ul>
      )}
      {moreCount > 0 && lastDate && (
        <p className="text-xs text-muted-foreground">
          {moreCount} more {moreCount === 1 ? "report" : "reports"} through {longDate(lastDate)}. Dates marked est. are not confirmed.
        </p>
      )}
    </section>
  );
}
