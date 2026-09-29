"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { Check, ChevronDown, Search } from "lucide-react";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { LIST_DAYS, PREP_BUILD_TRADING_DAYS, expectationsWord, marketDayNote, prepPackWord, type CalendarEvent, type Word } from "@/lib/earnings-calendar";
import type { CalendarFactorContext } from "@/lib/economic-calendar/factor-lines";
import type { EconomicEvent } from "@/lib/economic-calendar/types";
import { nextRelease, shownActual, surprise, todayIn, untilText } from "@/lib/economic-calendar/view";
import { fmtCurrency, fmtDay, fmtDayMonth, fmtPct, fmtTime } from "@/lib/format";
import { NY } from "@/lib/providers/calendar";
import { earningsHref, holdingHref } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HoldingLogo } from "@/components/app/holding-logo";
import { PageHead } from "@/components/app/page-head";
import { FilterChip, FilterChips, Segmented } from "@/components/app/panel";
import { RowLink } from "@/components/app/row-link";
import { AboutData, FeedNotice } from "@/components/app/economic-calendar/about-data";
import { BookSensitivity, FactorClause } from "@/components/app/economic-calendar/book-sensitivity";
import { IMPORTANCE, ReleaseDetails, releaseClock, releaseDomId, releaseFigures, releaseResult, type Importance } from "@/components/app/economic-calendar/release";
import { useEconomicFeedSpan, useNow, type FeedSource } from "@/components/app/economic-calendar/use-feed";
import { RailCardSkeleton } from "./markets-skeleton";
import { RailCard, RailRow } from "./rail";
import { marketsHref, type MarketsData, type MarketsQuery, type ReportRow } from "./types";

export type MarketsViewProps = MarketsData & {
  query: MarketsQuery;
  /** The route this lives on: /markets, or the development preview. */
  base?: string;
  factorContext: Promise<CalendarFactorContext> | null;
  feedSource?: FeedSource;
  /** Ask Hoot buttons open real chats; previews turn them off. */
  askable?: boolean;
  /** The rail's Today card (index levels), rendered on the server and streamed in. */
  todayCard?: ReactNode;
  /** A line under the heading, e.g. the development preview's warning. */
  banner?: ReactNode;
};

type Item =
  | {
      type: "holding" | "bellwether";
      key: string;
      date: string;
      sort: number;
      ev: CalendarEvent;
    }
  | {
      type: "economic";
      key: string;
      date: string;
      sort: number;
      e: EconomicEvent;
    }
  | { type: "report"; key: string; date: string; sort: number; r: ReportRow };

const HOUR_SORT: Record<string, number> = {
  bmo: 7 * 60,
  dmh: 12 * 60,
  amc: 16 * 60 + 5,
};
const HOUR_LABEL: Record<string, string> = {
  bmo: "Before open",
  amc: "After close",
  dmh: "During market",
};
const RANK: Record<Item["type"], number> = {
  holding: 0,
  report: 0,
  bellwether: 1,
  economic: 2,
};
const TONE: Record<Word["tone"], string> = {
  ink: "text-foreground",
  grey: "text-muted-foreground",
  caution: "text-caution-foreground",
};
/** Importance, highest first: the schedule opens on the high-impact releases, as the design's list does. */
const IMPORTANCE_ORDER: Importance[] = ["high", "med", "all"];
const IMPORTANCE_WORD: Record<Importance, string> = {
  high: "high-impact ",
  med: "medium- and high-impact ",
  all: "",
};
/** Kind, name, time, then figures and status on the right. */
const ROW = "grid grid-cols-[60px_minmax(0,1fr)_120px_216px] items-center gap-3";

const dt = (d: string) => DateTime.fromISO(d, { zone: NY });
const addDays = (d: string, n: number) => dt(d).plus({ days: n }).toISODate()!;
const minutesOf = (iso: string) => {
  const t = DateTime.fromISO(iso).setZone(NY);
  return t.hour * 60 + t.minute;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Today", "Tomorrow", "16 days"; "Yesterday", "5 days ago" looking back. */
function relDay(today: string, date: string) {
  const n = Math.round(dt(date).diff(dt(today), "days").days);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `${n} days` : `${-n} days ago`;
}

/** "Before open", "After close (est.)": when it reports, and a mark when the company hasn't confirmed the date. */
const timeWord = (hour: string | null, status: "confirmed" | "estimated" | null) =>
  hour ? `${HOUR_LABEL[hour] ?? hour.toUpperCase()}${status === "estimated" ? " (est.)" : ""}` : "Time not announced";

const eps = (value: string | null, currency: string | null) => (value === null ? null : `EPS est. ${fmtCurrency(value, currency)}`);

function byDayAndTime(a: Item, b: Item) {
  return (
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    a.sort - b.sort ||
    RANK[a.type] - RANK[b.type] ||
    (a.type === "economic" && b.type === "economic" ? (b.e.importance ?? 0) - (a.e.importance ?? 0) : 0)
  );
}

const eventItem = (ev: CalendarEvent): Item => ({
  type: ev.kind,
  key: `${ev.kind}:${ev.ticker}:${ev.date}`,
  date: ev.date,
  sort: ev.reportHour ? (HOUR_SORT[ev.reportHour] ?? 1439) : 1439,
  ev,
});
const econItem = (e: EconomicEvent): Item => ({
  type: "economic",
  key: `econ:${e.id}`,
  date: e.date,
  sort: e.timestamp ? minutesOf(e.timestamp) : -1,
  e,
});
const reportItem = (r: ReportRow): Item => ({
  type: "report",
  key: `report:${r.id}`,
  date: r.reportDate,
  sort: r.reportHour ? (HOUR_SORT[r.reportHour] ?? 1439) : 1439,
  r,
});

/** A report that is out, in words: the team's reflection due, reviewed, or no results recorded yet. */
function reflectionWord(r: ReportRow): Word {
  if (r.status === "reviewed") return { text: "Reviewed", tone: "grey" };
  if (r.status === "reported") return { text: "Reflection due", tone: "caution" };
  return { text: "No results yet", tone: "grey" };
}

/** A release's state for the row: how the print compared with consensus, the countdown to the next, or a missing figure. */
function econStatus(e: EconomicEvent, now: number | null, today: string, isNext: boolean): Word | null {
  if (now === null) return null;
  const actual = shownActual(e, now);
  if (actual !== null) {
    const s = surprise(actual, e.estimate);
    if (s?.dir === "above" || s?.dir === "below" || s?.dir === "inline") return { text: s.text, tone: "ink" };
    return { text: "Released", tone: "grey" };
  }
  if (isNext && e.timestamp)
    return {
      text: `Next, ${untilText(Date.parse(e.timestamp) - now)}`,
      tone: "ink",
    };
  const res = releaseResult(e, now, today, false);
  return res.text === "Awaiting" ? null : { text: res.text, tone: res.tone };
}

/**
 * Markets: the fund's earnings reports and the economic releases on one schedule, a section per day for the next five
 * weeks (or the five weeks before, under Past). An earnings row opens its report's page; a release opens its
 * details in place, with Kalshi's price, the book's factor line and Ask Hoot. The rail has the index levels, the prep
 * packs coming up and the releases that move the book's factors.
 */
export function MarketsView(props: MarketsViewProps) {
  const { query, base = "/markets", events, reports, scopeSlug, teamSlug, factorContext, feedSource = {}, askable = true } = props;
  const now = useNow();
  const today = now === null ? props.today : todayIn(now);
  const [importance, setImportance] = useState<Importance>("high");
  const [search, setSearch] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null);

  const past = query.view === "past";
  const yesterday = addDays(today, -1);
  const pastTo = query.to && query.to < today ? query.to : yesterday;
  const upcomingFrom = query.from && query.from > today ? query.from : today;
  const range = past ? { from: addDays(pastTo, -(LIST_DAYS - 1)), to: pastTo } : { from: upcomingFrom, to: addDays(upcomingFrom, LIST_DAYS - 1) };
  const { feed, error, loading, retry } = useEconomicFeedSpan(range, feedSource);

  const href = (q: Partial<MarketsQuery>) => marketsHref({ ...query, ...q }, base);
  const accessible = new Set(props.accessibleTeamIds);
  const q = search.toLowerCase().trim();
  const keep = IMPORTANCE.find((i) => i.id === importance)!.keep;
  const allEcon = (feed?.events ?? []).filter((e) => e.date >= range.from && e.date <= range.to);
  const econ = allEcon.filter((e) => `${e.name} ${e.category ?? ""} ${e.source ?? ""}`.toLowerCase().includes(q)).filter(keep);
  // The countdown goes on the next release the list shows, so it is never on a row the filters hide.
  const next = now === null ? null : nextRelease(econ, now);

  const inRange = (d: string) => d >= range.from && d <= range.to;
  const isOut = (r: ReportRow) => !(r.status === "upcoming" && r.reportDate >= today);
  const scheduled = past ? [] : events.filter((ev) => inRange(ev.date));
  const pastReports = past ? reports.filter((r) => isOut(r) && inRange(r.reportDate)) : [];
  const items = [...scheduled.map(eventItem), ...pastReports.map(reportItem), ...econ.map(econItem)].sort(byDayAndTime);

  // A market holiday is worth a section even with nothing on it. Looking back, the latest day comes first.
  const holidays: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) if (marketDayNote(d)) holidays.push(d);
  const days = [...new Set([...items.map((i) => i.date), ...holidays])].sort();
  if (past) days.reverse();

  const fundReports = scheduled.filter((ev) => ev.kind === "holding").length;
  const bellwetherReports = scheduled.filter((ev) => ev.kind === "bellwether").length;
  const releasesPhrase = feed ? plural(econ.length, `${IMPORTANCE_WORD[importance]}economic release`) : error ? "economic releases (not loaded)" : "economic releases";
  const note = past
    ? `${plural(pastReports.length, "fund report")} and ${releasesPhrase}, each with the actual against consensus`
    : `${plural(fundReports, "fund report")}${query.bellwethers ? ` and ${plural(bellwetherReports, "bellwether report")}` : ""} plus ${releasesPhrase}. (est.) means the company hasn't confirmed the date`;

  const justIn = reports.filter((r) => r.status === "reported");
  const further = past ? [] : reports.filter((r) => r.status === "upcoming" && r.reportDate > range.to).sort((a, b) => (a.reportDate < b.reportDate ? -1 : 1));
  const earlier = past ? reports.filter((r) => isOut(r) && r.reportDate < range.from) : [];

  // Picking a factor line opens that release's row, wherever the filters had it.
  const pick = (e: EconomicEvent) => {
    setImportance("all");
    setSearch("");
    setOpenRow(e.id);
    setJump((j) => ({ id: releaseDomId(e), n: (j?.n ?? 0) + 1 }));
  };
  useEffect(() => {
    if (jump) document.getElementById(jump.id)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [jump, econ.length]);

  const rowCtx: RowCtx = {
    today,
    now,
    accessible,
    scopeSlug,
    teamSlug,
    showTeam: props.showTeam,
    openRow,
    setOpenRow,
    nextId: next?.id ?? null,
    askable,
    factorContext,
  };

  return (
    <>
      <PageHead
        crumbs={[{ label: "Markets" }]}
        tabs={false}
        actions={
          <>
            <TeamMenu team={props.team} teams={props.teams} href={(team) => href({ team })} />
            <Segmented
              label="Show"
              segments={[
                {
                  key: "holdings",
                  label: "Fund holdings",
                  href: href({ bellwethers: false }),
                  active: !query.bellwethers,
                },
                {
                  key: "bellwethers",
                  label: "+ Sector bellwethers",
                  href: href({ bellwethers: true }),
                  active: query.bellwethers,
                  title: props.team ? `The rest of ${props.team.name}'s sectors: other teams' holdings and the sector ETFs' top constituents` : "The top constituents of each sector ETF",
                },
              ]}
            />
          </>
        }
      />
      <div className="flex gap-9">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-display font-semibold tracking-[-0.01em]">
              {past ? `Five weeks to ${fmtDayMonth(range.to)}` : upcomingFrom > today ? `Five weeks from ${fmtDayMonth(range.from)}` : "Next five weeks"}
            </h2>
            <span className="text-body text-muted-foreground">{note}</span>
          </div>
          {props.banner}

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3">
            <FilterChips label="Economic releases">
              {IMPORTANCE_ORDER.map((id) => (
                <FilterChip key={id} active={importance === id} onClick={() => setImportance(id)}>
                  {id === "high" ? "High impact" : id === "med" ? "Medium and up" : "All releases"}
                </FilterChip>
              ))}
            </FilterChips>
            <label className="flex h-8 w-[200px] items-center gap-2 border-b border-border-strong text-muted-foreground focus-within:text-foreground">
              <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
              <span className="sr-only">Find a release</span>
              <input
                type="search"
                placeholder="Find a release or speaker"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <span className="flex-1" />
            <Segmented
              label="When"
              segments={[
                {
                  key: "upcoming",
                  label: "Coming up",
                  href: href({ view: "upcoming", to: null, from: null }),
                  active: !past,
                },
                {
                  key: "past",
                  label: "Past",
                  href: href({ view: "past", to: null, from: null }),
                  active: past,
                },
              ]}
            />
          </div>

          {props.notices.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-caption text-muted-foreground">
              {props.notices.map((n, i) => (
                <li key={i}>
                  {n.text}{" "}
                  {n.link && (
                    <Link href={n.link.href} className="underline">
                      {n.link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 empty:hidden">
            <FeedNotice feed={feed} error={error} onRetry={retry} />
          </div>

          {days.map((d) => (
            <DaySection key={d} date={d} today={today} note={marketDayNote(d)}>
              {items
                .filter((it) => it.date === d)
                .map((it) => (
                  <li key={it.key}>
                    <ItemRow item={it} c={rowCtx} />
                  </li>
                ))}
            </DaySection>
          ))}
          {days.length === 0 && (
            <p className="border-b py-4 text-body text-muted-foreground">
              {!feed && !error
                ? "Loading economic releases…"
                : past
                  ? "Nothing in these five weeks. Try All releases, or an earlier stretch."
                  : "Nothing scheduled in the next five weeks. Try All releases, or add the sector bellwethers."}
            </p>
          )}
          {days.length > 0 && !feed && !error && <p className="border-b py-3 text-caption text-muted-foreground">Loading economic releases…</p>}

          {further.length > 0 && (
            <p className="mt-3 text-caption text-muted-foreground">
              {plural(further.length, "more fund report")} after {fmtDayMonth(range.to)}:{" "}
              {further.map((r) => `${r.ticker} ${fmtDayMonth(r.reportDate)}${r.dateStatus === "estimated" ? " (est.)" : ""}`).join(", ")}.
            </p>
          )}

          {!past && (
            <nav aria-label="Earlier and later" className="mt-3 flex gap-4 text-body">
              {upcomingFrom > today && (
                <Link
                  href={href({ from: addDays(range.from, -LIST_DAYS) > today ? addDays(range.from, -LIST_DAYS) : null })}
                  scroll={false}
                  className="font-semibold underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  Five weeks before
                </Link>
              )}
              <Link href={href({ from: addDays(range.to, 1) })} scroll={false} className="font-semibold underline decoration-border underline-offset-2 hover:decoration-foreground">
                Five weeks after
              </Link>
            </nav>
          )}
          {past && (
            <nav aria-label="Earlier and later" className="mt-3 flex gap-4 text-body">
              <Link href={href({ view: "past", to: addDays(range.from, -1) })} scroll={false} className="font-semibold underline decoration-border underline-offset-2 hover:decoration-foreground">
                Five weeks before
              </Link>
              {range.to < yesterday && (
                <Link
                  href={href({
                    view: "past",
                    to: [addDays(range.to, LIST_DAYS), yesterday].sort()[0],
                  })}
                  scroll={false}
                  className="font-semibold underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  Five weeks after
                </Link>
              )}
            </nav>
          )}

          {!past && justIn.length > 0 && (
            <ReportList id="markets-just-in" title="Just in" note="Reported, with the team's reflection due. Expectations locked when each report landed" rows={justIn} c={rowCtx} />
          )}
          {past && earlier.length > 0 && <ReportList id="markets-earlier" title="Earlier reports" note={`Every fund report on record before ${fmtDayMonth(range.from)}`} rows={earlier} c={rowCtx} />}

          <p className="mt-8 max-w-[760px] text-caption text-muted-foreground">
            <b className="font-semibold text-ink-3">About this data.</b> Earnings dates from the morning sweep, for every holding. Releases and consensus from{" "}
            {feed ? (feed.sources?.length ? feed.sources.map((s) => s.name).join(", ") : feed.provider) : "the calendar feeds"}, with public agency feeds as fallback; market prices from Kalshi where a
            contract exists. Above and below consensus are facts, not good or bad for the fund.{" "}
            {feed?.coverage && (
              <span className={cn(feed.coverage.status === "verified" ? "" : "text-caution-foreground")}>
                {`${feed.coverage.status === "verified" ? "Verified" : "Partial coverage"}: ${feed.coverage.message}`}{" "}
              </span>
            )}
            {feed ? `Releases updated ${fmtTime(feed.fetchedAt)}. ` : null}
            <button
              type="button"
              disabled={loading}
              onClick={retry}
              className="font-semibold text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground disabled:opacity-60"
            >
              Refresh now
            </button>
            {feed && (
              <>
                {" "}
                <AboutData feed={feed} />
              </>
            )}
          </p>
        </div>

        <aside aria-label="Today and prep packs" className="flex w-[300px] shrink-0 flex-col gap-[18px]">
          {props.todayCard && <Suspense fallback={<RailCardSkeleton rows={4} />}>{props.todayCard}</Suspense>}
          <PrepPacks events={events} today={today} c={rowCtx} />
          {factorContext && now !== null && allEcon.length > 0 && (
            <Suspense fallback={null}>
              <BookSensitivity context={factorContext} events={allEcon} now={now} onPick={pick} className="rounded-[12px] bg-surface p-4" />
            </Suspense>
          )}
        </aside>
      </div>
    </>
  );
}

/**
 * "Whole fund ▾": whose reports the schedule lists. Execs and admins can narrow it to one team (the old team calendars);
 * a member sees their own team's name, not a menu.
 */
function TeamMenu({ team, teams, href }: { team: MarketsData["team"]; teams: MarketsData["teams"]; href: (team: string | null) => string }) {
  const name = team?.name ?? "Whole fund";
  const trigger = "flex h-7 items-center gap-1 rounded-lg bg-secondary px-2 text-body text-foreground";
  if (teams.length < 2) return team ? <span className={trigger}>{name}</span> : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Showing ${name}. Change whose reports are listed`} className={cn(trigger, "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}>
        {name}
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end">
        <DropdownMenuGroup>
          <TeamItem href={href(null)} selected={!team}>
            Whole fund
          </TeamItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>One team</DropdownMenuLabel>
          {teams.map((t) => (
            <TeamItem key={t.slug} href={href(t.slug)} selected={team?.slug === t.slug}>
              {t.name}
            </TeamItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TeamItem({ href, selected, children }: { href: string; selected: boolean; children: ReactNode }) {
  return (
    <DropdownMenuItem render={<Link href={href} scroll={false} />} className={cn(selected && "font-semibold")}>
      <span className="min-w-0 flex-1">{children}</span>
      {selected && <Check className="text-muted-foreground" />}
    </DropdownMenuItem>
  );
}

type RowCtx = {
  today: string;
  now: number | null;
  accessible: Set<string>;
  scopeSlug: string | null;
  teamSlug: string | null;
  showTeam: boolean;
  openRow: string | null;
  setOpenRow: (id: string | null) => void;
  nextId: string | null;
  askable: boolean;
  factorContext: Promise<CalendarFactorContext> | null;
};

function DaySection({ date, today, note, children }: { date: string; today: string; note: string | null; children: ReactNode }) {
  return (
    <section aria-label={fmtDay(date)} className="grid grid-cols-[100px_minmax(0,1fr)] gap-4 border-b py-3.5">
      <div className="flex flex-col pt-2">
        <span className="text-body font-semibold">{fmtDay(date)}</span>
        <span className="text-caption text-muted-foreground">{relDay(today, date)}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        {note && <p className="flex h-9 items-center text-body text-muted-foreground">{note}</p>}
        <ul className="flex flex-col gap-0.5 empty:hidden">{children}</ul>
      </div>
    </section>
  );
}

function Kind({ economy }: { economy?: boolean }) {
  return <span className={cn("text-caption font-semibold", economy ? "text-economy" : "text-foreground")}>{economy ? "Economy" : "Earnings"}</span>;
}

/** The right-hand cell: grey figures, then the status word. */
function Right({ figures, status, title }: { figures: ReactNode; status: Word | null; title?: string }) {
  return (
    <span className="flex min-w-0 items-center justify-end gap-3 text-body">
      {figures && <span className="min-w-0 truncate text-muted-foreground">{figures}</span>}
      {status && status.text && (
        <span title={title} className={cn("shrink-0 whitespace-nowrap", TONE[status.tone])}>
          {status.text}
        </span>
      )}
    </span>
  );
}

function CompanyName({ ticker, name, team }: { ticker: string; name: string; team?: string | null }) {
  return (
    <>
      <b className="font-semibold">{ticker}</b> <span className="text-ink-2">{name}</span>
      {team && <span className="ml-2 text-muted-foreground">{team}</span>}
    </>
  );
}

const rowShell = "relative -mx-2 h-9 rounded-lg px-2 hover:bg-band";

function ItemRow({ item, c }: { item: Item; c: RowCtx }) {
  if (item.type === "economic") return <EconomyRow e={item.e} c={c} />;
  if (item.type === "report") return <ReportRowView r={item.r} c={c} when={timeWord(item.r.reportHour, item.r.dateStatus)} />;
  const ev = item.ev;
  if (ev.kind === "bellwether") {
    const sector = ev.sector ? SECTOR_LABELS[ev.sector] : "Sector";
    return (
      <div className={cn(ROW, rowShell)}>
        <Kind />
        <span className="flex min-w-0 items-center gap-2">
          <HoldingLogo ticker={ev.ticker} size={20} />
          <span className="min-w-0 truncate">
            <CompanyName ticker={ev.ticker} name={ev.name} />
          </span>
        </span>
        <span className="truncate text-muted-foreground">{timeWord(ev.reportHour, ev.dateStatus)}</span>
        <Right
          figures={eps(ev.epsEstimate, ev.epsCurrency)}
          status={{ text: `${ev.etf ?? sector} bellwether`, tone: "grey" }}
          title={[`${sector} bellwether`, ev.industry, ev.weightPct ? `${fmtPct(ev.weightPct, 1)} of ${ev.etf}` : null].filter(Boolean).join(", ")}
        />
      </div>
    );
  }
  const linkable = !!ev.teamId && c.accessible.has(ev.teamId) && !!ev.teamSlug;
  const upcoming = ev.status === "upcoming" || !ev.status;
  const exp = upcoming
    ? expectationsWord(ev.expectations ?? "not_started", { reportDate: ev.date, reportHour: ev.reportHour }, c.today)
    : {
        text: ev.status === "reviewed" ? "Reviewed" : "Locked",
        tone: "grey" as const,
      };
  const name = <CompanyName ticker={ev.ticker} name={ev.name} team={c.showTeam || !linkable ? ev.teamName : null} />;
  return (
    <div className={cn(ROW, rowShell)}>
      <Kind />
      <span className="flex min-w-0 items-center gap-2">
        <HoldingLogo ticker={ev.ticker} size={20} />
        <span className="min-w-0 truncate">
          {linkable ? (
            <RowLink
              cover="stretch"
              // The report's own page, where expectations are written and the prep pack lives; the holding's Earnings tab only without one.
              href={ev.earningsId ? earningsHref(c.scopeSlug, ev.teamSlug!, ev.earningsId) : holdingHref(c.scopeSlug, ev.teamSlug!, ev.ticker, "?tab=earnings")}
              aria-label={`${ev.ticker}, ${ev.name}: open the report`}
            >
              {name}
            </RowLink>
          ) : (
            name
          )}
        </span>
      </span>
      <span className="truncate text-muted-foreground">{timeWord(ev.reportHour, ev.dateStatus)}</span>
      <Right
        figures={eps(ev.epsEstimate, ev.epsCurrency)}
        status={{ text: exp.text, tone: exp.tone }}
        title={"title" in exp ? exp.title : `Expectations${ev.fiscalPeriod ? ` for ${ev.fiscalPeriod}` : ""}`}
      />
    </div>
  );
}

/** A report that is out: the report's own page (the reflection, the locked expectations), and whether the reflection is in. */
function ReportRowView({ r, c, when }: { r: ReportRow; c: RowCtx; when: string }) {
  const word = reflectionWord(r);
  const exp = expectationsWord(r.expectations, r, c.today);
  const name = <CompanyName ticker={r.ticker} name={r.name} team={c.showTeam ? r.teamName : null} />;
  return (
    <div className={cn(ROW, rowShell)}>
      <Kind />
      <span className="flex min-w-0 items-center gap-2">
        <HoldingLogo ticker={r.ticker} size={20} />
        <span className="min-w-0 truncate">
          {r.teamSlug ? (
            <RowLink cover="stretch" href={earningsHref(c.scopeSlug, r.teamSlug, r.id)} aria-label={`${r.ticker}, ${r.name}: open the report`}>
              {name}
            </RowLink>
          ) : (
            name
          )}
        </span>
      </span>
      <span className="truncate text-muted-foreground">{when}</span>
      <Right figures={eps(r.epsEstimate, r.epsCurrency)} status={word} title={`Expectations: ${exp.text.toLowerCase()}`} />
    </div>
  );
}

function EconomyRow({ e, c }: { e: EconomicEvent; c: RowCtx }) {
  const id = releaseDomId(e);
  const open = c.openRow === e.id;
  const isNext = c.nextId === e.id;
  const status = econStatus(e, c.now, c.today, isNext);
  return (
    <div id={id} className="scroll-mt-24">
      <div onClick={() => c.setOpenRow(open ? null : e.id)} className={cn(ROW, rowShell, "cursor-pointer", (open || isNext) && "bg-band")}>
        <Kind economy />
        <span className="min-w-0 truncate">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-details`}
            className={cn("max-w-full truncate rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", e.importance === 3 ? "text-foreground" : "text-ink-2")}
          >
            {e.name}
          </button>
        </span>
        <span className="truncate text-muted-foreground" title={e.tentative ? "Tentative" : undefined}>
          {releaseClock(e)}
          {e.tentative ? " (tentative)" : ""}
        </span>
        <Right figures={c.now === null ? null : releaseFigures(e, c.now)} status={status} />
      </div>
      {open && c.now !== null && (
        <ReleaseDetails
          id={`${id}-details`}
          event={e}
          now={c.now}
          today={c.today}
          isNext={isNext}
          askable={c.askable}
          teamSlug={c.teamSlug}
          factorLine={
            c.factorContext ? (
              <Suspense fallback={null}>
                <FactorClause context={c.factorContext} event={e} />
              </Suspense>
            ) : null
          }
        />
      )}
    </div>
  );
}

/** Reports that are out, newest first, each with its date in the time column. */
function ReportList({ id, title, note, rows, c }: { id: string; title: string; note: string; rows: ReportRow[]; c: RowCtx }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <div className="flex flex-wrap items-baseline gap-x-3 border-b pb-2">
        <h2 id={id} className="text-title font-semibold">
          {title}
        </h2>
        <span className="text-body text-muted-foreground">{note}</span>
      </div>
      <ul className="mt-1 flex flex-col gap-0.5">
        {rows.map((r) => (
          <li key={r.id}>
            <ReportRowView r={r} c={c} when={fmtDay(r.reportDate)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The evidence packs for the fund's reports in the next five weeks: built (when), failed, or when the sweep builds them. */
function PrepPacks({ events, today, c }: { events: CalendarEvent[]; today: string; c: RowCtx }) {
  const rows = events.filter((ev) => ev.kind === "holding" && ev.date >= today && (ev.status === "upcoming" || !ev.status) && !!ev.teamId && c.accessible.has(ev.teamId));
  return (
    <RailCard title="Prep packs" id="markets-prep" note={`Hoot gathers the evidence ${PREP_BUILD_TRADING_DAYS} trading days before each report.`}>
      {rows.length === 0 && <p className="py-2 text-body text-muted-foreground">No fund reports in the next five weeks.</p>}
      {rows.map((ev) => {
        const w = prepPackWord(
          {
            reportDate: ev.date,
            status: ev.status,
            prepPackAt: ev.prepPackAt,
            prepPackFailed: ev.prepPackFailed,
          },
          today,
        );
        const label = (
          <>
            <b className="font-semibold">{ev.ticker}</b> <span className="text-muted-foreground">{fmtDayMonth(ev.date)}</span>
          </>
        );
        return (
          <RailRow
            key={`${ev.ticker}:${ev.date}`}
            label={
              ev.earningsId && ev.teamSlug ? (
                <RowLink cover="stretch" href={earningsHref(c.scopeSlug, ev.teamSlug, ev.earningsId)} aria-label={`${ev.ticker} prep pack, report ${fmtDayMonth(ev.date)}`}>
                  {label}
                </RowLink>
              ) : (
                label
              )
            }
          >
            {/* Built reads in ink: it's ready to read. */}
            <span className={cn("shrink-0", ev.prepPackAt ? "text-foreground" : TONE[w.tone])}>{w.text}</span>
          </RailRow>
        );
      })}
    </RailCard>
  );
}
