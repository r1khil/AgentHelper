"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { Check, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import {
  CALENDAR_KINDS,
  CALENDAR_LAYOUTS,
  CALENDAR_VIEWS,
  LAYOUT_LABELS,
  VIEW_LABELS,
  buildMiniMonth,
  buildMonthGrid,
  calendarHref,
  countKinds,
  expectationsWord,
  kindOf,
  listPeriod,
  marketDayNote,
  prepPackWord,
  toggleKind,
  weekDays,
  type CalendarEvent,
  type CalendarKind,
  type CalendarQuery,
  type ExpectationsState,
  type Word,
} from "@/lib/earnings-calendar";
import type { EconomicEvent } from "@/lib/economic-calendar/types";
import { todayIn } from "@/lib/economic-calendar/view";
import { fmtCurrency, fmtDay, fmtDayMonth, fmtMonth, fmtTime } from "@/lib/format";
import { NY } from "@/lib/providers/calendar";
import { cn } from "@/lib/utils";
import { earningsHref } from "@/lib/scope";
import { PageHead, PageHero } from "@/components/app/page-head";
import { FilterChip, FilterChips, Segmented } from "@/components/app/panel";
import { NativeSelect } from "@/components/app/native-select";
import { FeedNotice } from "@/components/app/economic-calendar/about-data";
import { IMPORTANCE, releaseClock, releaseFigures, releaseResult, type Importance } from "@/components/app/economic-calendar/release";
import { useEconomicFeed, useNow, type FeedSource } from "@/components/app/economic-calendar/use-feed";
import { Button } from "@/components/ui/button";
import { RowLink } from "@/components/app/row-link";

/** A Fund report for the Reported table: every report on record, not just the coming weeks'. */
export type ReportRow = {
  id: string;
  ticker: string;
  name: string;
  teamSlug: string | null;
  teamName: string | null;
  reportDate: string;
  reportHour: string | null;
  dateStatus: "confirmed" | "estimated" | null;
  epsEstimate: string | null;
  epsCurrency: string | null;
  expectations: ExpectationsState;
  status: "upcoming" | "reported" | "reviewed";
};

export type CalendarViewProps = {
  /** The route the Earnings tab lives on: /t/x/earnings, or a preview. */
  base: string;
  /** The Economic releases tab, which an economic row in the list links to. */
  economicBase?: string;
  /** The Show filters when the URL doesn't say (the Fund's own reports only). */
  defaultShow: CalendarKind[];
  /** The layout when the URL doesn't say. */
  defaultLayout?: CalendarQuery["layout"];
  query: CalendarQuery;
  today: string;
  /** A day in the selected week. */
  selectedDay: string;
  /** A team's page offers Fund / Sector / Industry; the Fund page always shows the Fund. */
  canScope: boolean;
  industries: string[];
  /** Holdings and bellwethers on the grid and in the coming five weeks, already narrowed to the scope. */
  events: CalendarEvent[];
  accessibleTeamIds: string[];
  /** Notes about the data (missing bellwethers, sectors, industries). */
  notices: ReactNode[];
  reports: ReportRow[];
  showTeam?: boolean;
  /** The scope in the URL (the fund or a team). A report opens there when it can, so the scope doesn't change. */
  scopeSlug?: string | null;
  feedSource?: FeedSource;
  /** A line under the header, e.g. the development preview's warning. */
  banner?: ReactNode;
};

type Item =
  | { type: "holding" | "bellwether"; key: string; date: string; sort: number; ev: CalendarEvent }
  | { type: "economic"; key: string; date: string; sort: number; e: EconomicEvent };

const KIND: Record<Item["type"], { dot: string }> = {
  holding: { dot: "var(--series-1)" },
  bellwether: { dot: "var(--series-neutral)" },
  economic: { dot: "var(--series-2)" },
};
const SHOW: { kind: CalendarKind; label: string; one: string }[] = [
  { kind: "holdings", label: "Fund holdings", one: "Fund report" },
  { kind: "bellwethers", label: "Sector bellwethers", one: "bellwether" },
  { kind: "economic", label: "Economic releases", one: "release" },
];
const HOUR_SORT: Record<string, number> = { bmo: 7 * 60, dmh: 12 * 60, amc: 16 * 60 + 5 };
const HOUR_LABEL: Record<string, string> = { bmo: "Before open", amc: "After close", dmh: "During market" };
/** Date, holding, team, time, EPS estimate, expectations, prep pack: the spec's columns. */
const GRID = "grid grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1.1fr)_140px_80px_120px_120px] items-center gap-3";
const TONE = { ink: "text-foreground", grey: "text-muted-foreground", caution: "text-caution-foreground" } as const;

const dt = (d: string) => DateTime.fromISO(d, { zone: NY });
const minutesOf = (iso: string) => {
  const t = DateTime.fromISO(iso).setZone(NY);
  return t.hour * 60 + t.minute;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Before open", "After close (est.)": when it reports, and a mark when the company hasn't confirmed the date. */
const timeWord = (hour: string | null, status: "confirmed" | "estimated" | null) => (hour ? `${HOUR_LABEL[hour] ?? hour.toUpperCase()}${status === "estimated" ? " (est.)" : ""}` : "Time not announced");

function toItems(events: CalendarEvent[], econ: EconomicEvent[]): Item[] {
  const items: Item[] = [
    ...events.map((ev): Item => ({ type: ev.kind, key: `${ev.kind}:${ev.ticker}:${ev.date}`, date: ev.date, sort: ev.reportHour ? (HOUR_SORT[ev.reportHour] ?? 1439) : 1439, ev })),
    ...econ.map((e): Item => ({ type: "economic", key: `econ:${e.id}`, date: e.date, sort: e.timestamp ? minutesOf(e.timestamp) : -1, e })),
  ];
  const rank = { holding: 0, bellwether: 1, economic: 2 };
  return items.sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      a.sort - b.sort ||
      rank[a.type] - rank[b.type] ||
      (a.type === "economic" && b.type === "economic" ? (b.e.importance ?? 0) - (a.e.importance ?? 0) : 0),
  );
}

export function CalendarView(props: CalendarViewProps) {
  const { base, economicBase, defaultShow, defaultLayout = "week", query, today: serverToday, selectedDay, events, accessibleTeamIds, feedSource = {} } = props;
  const now = useNow();
  const today = now === null ? serverToday : todayIn(now);
  const [importance, setImportance] = useState<Importance>("all");
  const [search, setSearch] = useState("");

  const href = (q: Partial<CalendarQuery>) => calendarHref(base, { ...query, ...q }, defaultShow, defaultLayout);
  const reportHref = reportHrefFor(props.scopeSlug);
  const show = new Set(query.show);
  const accessible = new Set(accessibleTeamIds);
  const mini = buildMiniMonth(query.month);
  const week = weekDays(selectedDay);
  const weekRange = { from: week[0], to: week[6] };
  const monthRange = { from: mini.first, to: mini.last };
  const listRange = listPeriod(today);
  const period = query.layout === "week" ? weekRange : query.layout === "month" ? monthRange : listRange;
  const { feed, error, retry } = useEconomicFeed(show.has("economic") ? period : null, feedSource);

  const inPeriod = (d: string) => d >= period.from && d <= period.to;
  const q = search.toLowerCase().trim();
  const keep = IMPORTANCE.find((i) => i.id === importance)!.keep;
  const periodEcon = (feed?.events ?? []).filter((e) => `${e.name} ${e.category ?? ""} ${e.source ?? ""}`.toLowerCase().includes(q));
  const periodEvents = events.filter((ev) => inPeriod(ev.date));
  const items = toItems(periodEvents.filter((ev) => show.has(kindOf(ev))), show.has("economic") ? periodEcon.filter(keep) : []);

  // Every count is of the period on screen, in the scope: what each Show choice lists when it is on.
  const counts = countKinds(events, periodEcon.filter(keep), period);
  const loaded = { holdings: true, bellwethers: true, economic: !!feed };
  const holdings = periodEvents.filter((ev) => ev.kind === "holding");
  const firstUpcoming = events.filter((ev) => ev.kind === "holding" && ev.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const thisWeek = weekDays(today);
  const reportsThisWeek = events.filter((ev) => ev.kind === "holding" && ev.date >= today && ev.date <= thisWeek[6]).length;

  const label = query.layout === "list" ? "Fund holdings reporting in the next 5 weeks" : query.layout === "week" ? `Fund holdings reporting the week of ${fmtDayMonth(week[0])}` : `Fund holdings reporting in ${fmtMonth(mini.first)}`;
  const noteParts = [
    query.layout === "list"
      ? reportsThisWeek === 0
        ? "None this week"
        : `${plural(reportsThisWeek, "report")} this week`
      : holdings.length === 0
        ? `None ${query.layout === "week" ? "this week" : "this month"}`
        : null,
    query.layout === "list" && firstUpcoming ? `first is ${firstUpcoming.ticker} on ${fmtDayMonth(firstUpcoming.date)}` : query.layout === "list" ? "none in the next 5 weeks" : null,
    show.has("bellwethers") ? plural(counts.bellwethers, "bellwether") : null,
    show.has("economic") ? (loaded.economic ? plural(counts.economic, "release") : error ? "releases unavailable" : "loading releases…") : null,
    "expectations lock when each report lands",
  ].filter(Boolean);

  const step = (n: number) => {
    if (query.layout === "month") {
      const m = dt(mini.first).plus({ months: n }).toFormat("yyyy-LL");
      return href({ month: m, day: undefined });
    }
    const d = dt(week[0]).plus({ weeks: n }).toISODate()!;
    return href({ day: d, month: d.slice(0, 7) });
  };
  const atToday = query.layout === "month" ? mini.first.startsWith(today.slice(0, 7)) : week.includes(today);
  const navLabel = query.layout === "month" ? fmtMonth(mini.first) : `${fmtDayMonth(week[0])} – ${fmtDayMonth(week[6])}`;

  const rowProps = { today, now, accessible, reportHref, economicBase };
  const upcomingReports = props.reports.filter((r) => r.status === "upcoming" && r.reportDate >= today);
  const past = props.reports.filter((r) => !(r.status === "upcoming" && r.reportDate >= today));
  const further = upcomingReports.filter((r) => r.reportDate > listRange.to);

  return (
    <>
      <PageHead crumbs={[{ label: "Calendar" }]} asof="Dates marked (est.) aren't confirmed by the company yet" />
      <PageHero label={label} value={plural(counts.holdings, "report")} note={noteParts.join(" · ")} />
      {props.banner}

      <div className="mt-[18px] flex flex-wrap items-center gap-x-2 gap-y-2 border-b pb-3.5">
        {props.canScope && (
          <>
            <Segmented
              label="Scope"
              segments={CALENDAR_VIEWS.map((v) => ({ key: v, label: VIEW_LABELS[v], href: href({ scope: v }), active: query.scope === v, title: v === "fund" ? "Every Fund holding and bellwether" : v === "sector" ? "This team's holdings and its sectors" : "One industry in this team's sectors" }))}
            />
            <Divider />
          </>
        )}
        <Segmented label="Layout" segments={CALENDAR_LAYOUTS.map((l) => ({ key: l, label: LAYOUT_LABELS[l], href: href({ layout: l }), active: query.layout === l }))} />
        <Divider />
        {/* What the calendar lists: a quiet row of on/off words, not a second set of filled controls. */}
        <div role="group" aria-label="Show" className="flex items-center gap-3 text-caption">
          <span className="text-muted-foreground">Show:</span>
          {SHOW.map((s) => {
            const on = show.has(s.kind);
            return (
              <Link
                key={s.kind}
                href={href({ show: toggleKind(query.show, s.kind) })}
                scroll={false}
                role="switch"
                aria-checked={on}
                title={`${on ? "Hide" : "Show"} ${s.label.toLowerCase()}`}
                className={cn("flex items-center gap-1.5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", on ? "font-semibold text-foreground" : "text-muted-foreground")}
              >
                <span aria-hidden="true" className={cn("grid size-3 place-items-center rounded-[3px] border", on ? "border-foreground bg-foreground text-background" : "border-border-strong")}>
                  {on && <Check className="size-2.5" strokeWidth={3} />}
                </span>
                {s.label}
                {loaded[s.kind] && <span className="font-normal text-muted-foreground tabular-nums">{counts[s.kind]}</span>}
              </Link>
            );
          })}
        </div>
        {show.has("economic") && (
          <>
            <Divider />
            <FilterChips label="Importance">
              {IMPORTANCE.map((i) => (
                <FilterChip key={i.id} active={importance === i.id} count={periodEcon.filter(i.keep).length} onClick={() => setImportance(i.id)}>
                  {i.label}
                </FilterChip>
              ))}
            </FilterChips>
            <label className="flex h-8 w-[200px] items-center gap-2 border-b border-border-strong text-muted-foreground focus-within:text-foreground">
              <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
              <span className="sr-only">Find a release</span>
              <input type="search" placeholder="Find a release" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground" />
            </label>
          </>
        )}
        <span className="flex-1" />
        {query.layout !== "list" && (
          <div role="group" aria-label={query.layout === "month" ? "Month" : "Week"} className="ml-auto flex items-center gap-1">
            <Link href={step(-1)} scroll={false} aria-label={query.layout === "month" ? "Previous month" : "Previous week"} className="grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-secondary hover:text-foreground">
              <ChevronLeft className="size-4" />
            </Link>
            <span className="min-w-[128px] text-center text-body font-semibold">{navLabel}</span>
            <Link href={step(1)} scroll={false} aria-label={query.layout === "month" ? "Next month" : "Next week"} className="grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-secondary hover:text-foreground">
              <ChevronRight className="size-4" />
            </Link>
            {!atToday && (
              <Link href={href({ month: today.slice(0, 7), day: today })} scroll={false} className="ml-1 rounded-sm text-body font-semibold hover:underline">
                {query.layout === "month" ? "This month" : "This week"}
              </Link>
            )}
          </div>
        )}
      </div>
      {query.scope === "industry" && props.canScope && <IndustryForm query={query} base={base} industries={props.industries} defaultShow={defaultShow} />}
      {(props.notices.length > 0 || (show.has("economic") && feed)) && (
        <ul className="mt-3 flex flex-col gap-1 text-caption text-muted-foreground">
          {props.notices.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
          {show.has("economic") && feed && <li>Economic releases updated {fmtTime(feed.fetchedAt)}. {feed.coverage ? `${feed.coverage.status === "partial" ? "Partial coverage" : "Verified"}: ${feed.coverage.message}` : "Coverage is partial: public agency feeds only."}</li>}
        </ul>
      )}
      {show.has("economic") && (
        <div className="mt-2 empty:hidden">
          <FeedNotice feed={feed} error={error} onRetry={retry} />
        </div>
      )}

      {query.layout === "month" ? (
        <MonthLayout month={query.month} items={items} today={today} week={week} dayHref={(d) => href({ layout: "week", day: d })} accessible={accessible} reportHref={reportHref} />
      ) : (
        <>
          <EventTable title="Upcoming earnings" items={items} days={query.layout === "week" ? week : null} rowProps={rowProps} />
          {query.layout === "list" && further.length > 0 && (
            <p className="mt-3 text-caption text-muted-foreground">
              {plural(further.length, "more Fund report")} after {fmtDayMonth(listRange.to)}, the first on {fmtDay(further[0].reportDate)}.{" "}
              <Link href={href({ layout: "month", month: further[0].reportDate.slice(0, 7), day: undefined })} scroll={false} className="font-semibold text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
                Open the month
              </Link>
            </p>
          )}
          {query.layout === "list" && past.length > 0 && <ReportedTable rows={past} today={today} reportHref={reportHref} />}
        </>
      )}
    </>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1.5 h-[18px] w-px bg-border-strong" />;
}

type RowProps = {
  today: string;
  now: number | null;
  accessible: Set<string>;
  reportHref: ReportHref;
  economicBase?: string;
};

type ReportHref = (owner: string | null | undefined, earningsId: string | undefined) => string;

/** A report's page, opened in the calendar's scope when it can be (see earningsHref). Only holdings have one. */
function reportHrefFor(scopeSlug: string | null | undefined): ReportHref {
  return (owner, earningsId) => earningsHref(scopeSlug, owner ?? scopeSlug ?? "", earningsId ?? "");
}

function IndustryForm({ query, base, industries, defaultShow }: { query: CalendarQuery; base: string; industries: string[]; defaultShow: CalendarKind[] }) {
  return (
    <form action={base} className="mt-3 flex items-center gap-1.5">
      <input type="hidden" name="scope" value="industry" />
      {query.layout !== "week" && <input type="hidden" name="view" value={query.layout} />}
      <input type="hidden" name="month" value={query.month} />
      {query.day && <input type="hidden" name="day" value={query.day} />}
      {query.show.join() !== defaultShow.join() && <input type="hidden" name="show" value={query.show.length ? CALENDAR_KINDS.filter((k) => query.show.includes(k)).join(",") : "none"} />}
      <NativeSelect name="industry" defaultValue={query.industry ?? ""} aria-label="Industry" className="h-8 w-72 text-body">
        <option value="">Choose an industry</option>
        {industries.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" size="sm" variant="secondary">
        Show
      </Button>
    </form>
  );
}

function WordCell({ w, title }: { w: Word; title?: string }) {
  return (
    <span role="cell" title={title} className={cn("truncate font-semibold", TONE[w.tone])}>
      {w.text}
    </span>
  );
}

const DASH = <span role="cell" className="text-muted-foreground">—</span>;

/**
 * The reports as a table (the spec's columns), in date order. In the Week layout every weekday has a place: a day with
 * nothing on it says so, and a market holiday says which.
 */
function EventTable({ title, items, days, rowProps: r }: { title: string; items: Item[]; days: string[] | null; rowProps: RowProps }) {
  const shownDays = days ? days.filter((d, i) => i < 5 || items.some((it) => it.date === d)) : null;
  type TableRow = { kind: "item"; item: Item } | { kind: "empty"; day: string };
  const rows: TableRow[] = shownDays
    ? shownDays.flatMap((d): TableRow[] => {
        const list = items.filter((it) => it.date === d);
        return list.length ? list.map((item): TableRow => ({ kind: "item", item })) : [{ kind: "empty", day: d }];
      })
    : items.map((item): TableRow => ({ kind: "item", item }));
  return (
    <div role="table" aria-label={title} className="mt-1 text-body">
      <div role="row" className={cn(GRID, "h-[34px] border-b text-caption text-muted-foreground")}>
        <span role="columnheader">Date</span>
        <span role="columnheader">Holding</span>
        <span role="columnheader">Team</span>
        <span role="columnheader">Time</span>
        <span role="columnheader" className="text-right">
          EPS est.
        </span>
        <span role="columnheader">Expectations</span>
        <span role="columnheader">Prep pack</span>
      </div>
      {rows.map((row) =>
        row.kind === "empty" ? (
          <div key={row.day} role="row" className={cn(GRID, "h-10 border-b border-row")}>
            <span role="cell" className="text-ink-2">
              {row.day === r.today ? "Today" : fmtDay(row.day)}
            </span>
            <span role="cell" aria-colspan={6} className="col-span-6 text-muted-foreground">
              {marketDayNote(row.day) ?? `Nothing for the Fund ${row.day === r.today ? "today" : `on ${dt(row.day).toFormat("cccc")}`}.`}
            </span>
          </div>
        ) : (
          <Row key={row.item.key} item={row.item} r={r} />
        ),
      )}
      {rows.length === 0 && (
        <p className="border-b border-row py-3 text-body text-muted-foreground">Nothing on the calendar in the next five weeks. Choose another layout or another Show choice.</p>
      )}
    </div>
  );
}

/** One event as a row of the table. */
function Row({ item, r }: { item: Item; r: RowProps }) {
  const dateCell = (
    <span role="cell" className={cn("text-ink-2", item.date === r.today && "font-semibold text-foreground")}>
      {item.date === r.today ? "Today" : fmtDay(item.date)}
    </span>
  );
  if (item.type === "economic") {
    const e = item.e;
    const res = releaseResult(e, r.now, r.today, false);
    return (
      <div role="row" className={cn(GRID, "relative h-10 border-b border-row hover:bg-band")}>
        {dateCell}
        <span role="cell" className="min-w-0 truncate">
          {r.economicBase ? (
            <RowLink cover="stretch" href={`${r.economicBase}?day=${e.date}`} className="hover:underline">
              <span className="font-semibold">{e.name}</span>
            </RowLink>
          ) : (
            <span className="font-semibold">{e.name}</span>
          )}{" "}
          <span className="text-muted-foreground">{releaseFigures(e, r.now)}</span>
        </span>
        <span role="cell" className="truncate text-ink-2">
          Economic release
        </span>
        <span role="cell" className="truncate text-ink-2">
          {releaseClock(e)}
        </span>
        {DASH}
        <WordCell w={res} />
        {DASH}
      </div>
    );
  }
  const ev = item.ev;
  const linkable = ev.kind === "holding" && !!ev.teamId && r.accessible.has(ev.teamId) && !!ev.earningsId;
  const name = (
    <>
      <b className="font-semibold">{ev.ticker}</b> <span className="text-muted-foreground">{ev.name}</span>
    </>
  );
  const upcoming = ev.kind === "holding" && (ev.status === "upcoming" || !ev.status);
  const exp = ev.kind === "holding" && upcoming ? expectationsWord(ev.expectations ?? "not_started", { reportDate: ev.date, reportHour: ev.reportHour }, r.today) : null;
  return (
    <div role="row" className={cn(GRID, "relative h-10 border-b border-row hover:bg-band")}>
      {dateCell}
      <span role="cell" className="min-w-0 truncate">
        {linkable ? (
          <RowLink cover="stretch" href={r.reportHref(ev.teamSlug, ev.earningsId)} aria-label={`${ev.ticker}, ${ev.name}: open the report`} className="hover:underline">
            {name}
          </RowLink>
        ) : (
          name
        )}
      </span>
      <span role="cell" className="truncate text-ink-2" title={ev.industry ?? undefined}>
        {ev.kind === "holding" ? ev.teamName : `${ev.sector ? SECTOR_LABELS[ev.sector] : "Sector"} bellwether${ev.etf ? ` (${ev.etf})` : ""}`}
      </span>
      <span role="cell" className="truncate text-ink-2">
        {timeWord(ev.reportHour, ev.dateStatus)}
      </span>
      <span role="cell" className="text-right">
        {fmtCurrency(ev.epsEstimate, ev.epsCurrency)}
      </span>
      {exp ? (
        <WordCell w={exp} title={exp.title} />
      ) : ev.kind === "holding" ? (
        <span role="cell" className="truncate font-semibold text-muted-foreground">
          {ev.status === "reviewed" ? "Locked · reviewed" : "Locked"}
        </span>
      ) : (
        DASH
      )}
      {ev.kind === "holding" ? <WordCell w={prepPackWord({ reportDate: ev.date, status: ev.status, prepPackAt: ev.prepPackAt, prepPackFailed: ev.prepPackFailed }, r.today)} /> : DASH}
    </div>
  );
}

/** Reports that are out: locked expectations, and whether the team's reflection is written. */
function ReportedTable({ rows, today, reportHref }: { rows: ReportRow[]; today: string; reportHref: ReportHref }) {
  return (
    <section aria-label="Reported" className="mt-8">
      <h2 className="text-title font-bold tracking-[-0.01em]">Reported</h2>
      <div role="table" aria-label="Reported earnings" className="mt-1 text-body">
        <div role="row" className={cn(GRID, "h-[34px] border-b text-caption text-muted-foreground")}>
          <span role="columnheader">Date</span>
          <span role="columnheader">Holding</span>
          <span role="columnheader">Team</span>
          <span role="columnheader">Time</span>
          <span role="columnheader" className="text-right">
            EPS est.
          </span>
          <span role="columnheader">Expectations</span>
          <span role="columnheader">Reflection</span>
        </div>
        {rows.map((r) => {
          const exp = expectationsWord(r.expectations, r, today);
          const name = (
            <>
              <b className="font-semibold">{r.ticker}</b> <span className="text-muted-foreground">{r.name}</span>
            </>
          );
          return (
            <div key={r.id} role="row" className={cn(GRID, "relative h-10 border-b border-row hover:bg-band")}>
              <span role="cell" className="text-ink-2">
                {fmtDay(r.reportDate)}
              </span>
              <span role="cell" className="min-w-0 truncate">
                {r.teamSlug ? (
                  <RowLink cover="stretch" href={reportHref(r.teamSlug, r.id)} aria-label={`${r.ticker}, ${r.name}: open the report`} className="hover:underline">
                    {name}
                  </RowLink>
                ) : (
                  name
                )}
              </span>
              <span role="cell" className="truncate text-ink-2">
                {r.teamName ?? "—"}
              </span>
              <span role="cell" className="truncate text-ink-2">
                {timeWord(r.reportHour, r.dateStatus)}
              </span>
              <span role="cell" className="text-right">
                {fmtCurrency(r.epsEstimate, r.epsCurrency)}
              </span>
              <WordCell w={{ text: exp.text, tone: exp.tone }} title={exp.title} />
              <WordCell w={r.status === "reviewed" ? { text: "Reviewed", tone: "grey" } : r.status === "reported" ? { text: "Reflection due", tone: "caution" } : { text: "—", tone: "grey" }} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MonthLayout({
  month,
  items,
  today,
  week,
  dayHref,
  accessible,
  reportHref,
}: {
  month: string;
  items: Item[];
  today: string;
  week: string[];
  dayHref: (d: string) => string;
  accessible: Set<string>;
  reportHref: ReportHref;
}) {
  const grid = buildMonthGrid(month);
  const MAX = 4;
  // A month cell lists the Fund's reports first, then bellwethers, then the high-importance releases; the rest are counted.
  const rank = { holding: 0, bellwether: 1, economic: 2 };
  const label = (it: Item) => (it.type === "economic" ? it.e.name : it.ev.ticker);
  return (
    <div className="mt-2 flex flex-col">
      <div className="grid grid-cols-5 border-b">
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
          <div key={d} className="px-3 py-2 text-caption text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      {grid.weeks.map((row) => (
        <div key={row[0].date} className="grid min-h-[104px] grid-cols-5 border-b border-row last:border-b-0">
          {row.map((day, i) => {
            const all = items.filter((it) => it.date === day.date);
            const shown = all
              .filter((it) => it.type !== "economic" || it.e.importance === 3)
              .sort((a, b) => rank[a.type] - rank[b.type])
              .slice(0, MAX);
            const more = all.length - shown.length;
            const note = marketDayNote(day.date);
            return (
              <div key={day.date} className={cn("flex min-w-0 flex-col gap-1 px-2.5 py-2", i > 0 && "shadow-[inset_1px_0_0_var(--row)]", week.includes(day.date) && "bg-band", !day.inMonth && "opacity-45")}>
                <div className="flex items-center gap-1.5">
                  <Link href={dayHref(day.date)} scroll={false} aria-label={`Week of ${day.date}`} className={cn("grid size-6 place-items-center rounded-full text-caption hover:bg-secondary", day.date === today && "bg-primary text-primary-foreground hover:bg-primary/90", !day.trading && day.date !== today && "text-muted-foreground")}>
                    {Number(day.date.slice(8))}
                  </Link>
                  {note && (
                    <span className="truncate text-caption text-muted-foreground" title={note}>
                      {note.split(" · ")[0]}
                    </span>
                  )}
                </div>
                {shown.map((it) => {
                  const linkable = it.type === "holding" && !!it.ev.teamId && accessible.has(it.ev.teamId) && !!it.ev.earningsId;
                  const inner = (
                    <>
                      <span className="size-2 shrink-0 rounded-full" style={{ background: KIND[it.type].dot }} />
                      <span className={cn("truncate", it.type !== "economic" && "font-semibold")}>{label(it)}</span>
                    </>
                  );
                  const title = it.type === "economic" ? `${it.e.name}${it.e.timestamp ? ` · ${releaseClock(it.e)}` : ""}` : `${it.ev.name}${it.ev.teamName ? ` · ${it.ev.teamName}` : it.ev.etf ? ` · ${it.ev.etf} constituent` : ""}`;
                  return linkable && it.type === "holding" ? (
                    <Link key={it.key} href={reportHref(it.ev.teamSlug, it.ev.earningsId)} title={title} className="flex min-w-0 items-center gap-1.5 text-body hover:underline">
                      {inner}
                    </Link>
                  ) : (
                    <span key={it.key} title={title} className="flex min-w-0 items-center gap-1.5 text-body text-ink-2">
                      {inner}
                    </span>
                  );
                })}
                {more > 0 && (
                  <Link href={dayHref(day.date)} scroll={false} className="text-caption text-muted-foreground hover:text-foreground hover:underline">
                    +{more} more
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
