"use client";

import { Fragment, Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  marketDayNote,
  toggleKind,
  weekDays,
  type CalendarEvent,
  type CalendarKind,
  type CalendarQuery,
  type ExpectationsState,
} from "@/lib/earnings-calendar";
import type { CalendarFactorContext } from "@/lib/economic-calendar/factor-lines";
import type { EconomicEvent } from "@/lib/economic-calendar/types";
import { nextRelease, todayIn } from "@/lib/economic-calendar/view";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { NY } from "@/lib/providers/calendar";
import { cn } from "@/lib/utils";
import { earningsHref } from "@/lib/scope";
import { Panel, Pill, Segmented, type PillTone } from "@/components/app/panel";
import { NativeSelect } from "@/components/app/native-select";
import { StatusBadge } from "@/components/app/status-badge";
import { HootSprite } from "@/components/app/hoot/hoot-sprite";
import { HootOnPage } from "@/components/app/hoot/presence";
import { BookSensitivity, FactorClause } from "@/components/app/economic-calendar/book-sensitivity";
import { FeedStatus } from "@/components/app/economic-calendar/about-data";
import { IMPORTANCE, NowLine, ReleaseDetails, ReleaseStatus, releaseClock, releaseDomId, releaseFigures, type Importance } from "@/components/app/economic-calendar/release";
import { useEconomicFeed, useNow, type FeedSource } from "@/components/app/economic-calendar/use-feed";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** A Fund report for the List view's report tables: every report on record, not just this month's. */
export type ReportRow = {
  id: string;
  ticker: string;
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
  /** The route the calendar lives on: /t/x/earnings, /t/x/economic-calendar, or a preview. */
  base: string;
  /** The Show filters when the URL doesn't say (economic only on /economic-calendar). */
  defaultShow: CalendarKind[];
  query: CalendarQuery;
  today: string;
  /** A day in the selected week. */
  selectedDay: string;
  /** A team's page offers Fund / Sector / Industry; the Fund page always shows the Fund. */
  canScope: boolean;
  industries: string[];
  /** Holdings and bellwethers on the month's grid, already narrowed to the scope. */
  events: CalendarEvent[];
  /** Owner id to name. */
  ownerNames: Record<string, string>;
  accessibleTeamIds: string[];
  /** Notes about the data (missing bellwethers, sectors, industries). */
  notices: ReactNode[];
  reports: ReportRow[];
  showTeam: boolean;
  /** The team a Hoot chat opens under; null on the Fund page. */
  teamSlug: string | null;
  /** The scope in the URL (the fund or a team). A report opens there when it can, so the scope doesn't change. */
  scopeSlug?: string | null;
  factorContext: Promise<CalendarFactorContext> | null;
  feedSource?: FeedSource;
  /** A band across the top of the week panel, e.g. the development preview's warning. */
  banner?: ReactNode;
  /** Ask Hoot buttons open real chats; previews turn them off. */
  askable?: boolean;
};

type Item =
  | { type: "holding" | "bellwether"; key: string; date: string; sort: number; ev: CalendarEvent }
  | { type: "economic"; key: string; date: string; sort: number; e: EconomicEvent };

const KIND: Record<Item["type"], { label: string; dot: string }> = {
  holding: { label: "Fund holding", dot: "var(--series-1)" },
  bellwether: { label: "Bellwether", dot: "var(--series-neutral)" },
  economic: { label: "Economic", dot: "var(--series-2)" },
};
const SHOW: { kind: CalendarKind; label: string; dot: string }[] = [
  { kind: "holdings", label: "Fund holdings", dot: KIND.holding.dot },
  { kind: "bellwethers", label: "Sector bellwethers", dot: KIND.bellwether.dot },
  { kind: "economic", label: "Economic releases", dot: KIND.economic.dot },
];
const HOUR_SORT: Record<string, number> = { bmo: 7 * 60, dmh: 12 * 60, amc: 16 * 60 + 5 };
const HOUR_LABEL: Record<string, string> = { bmo: "Before open", amc: "After close", dmh: "During market" };
const EXPECTATIONS: Record<ExpectationsState, { pill: string; row: string; tone: PillTone; text: string }> = {
  locked: { pill: "Locked in", row: "Expectations locked", tone: "good", text: "text-good-foreground" },
  draft: { pill: "Draft", row: "Expectations: draft", tone: "caution", text: "text-caution-foreground" },
  not_started: { pill: "Not started", row: "Expectations: not started", tone: "hoot", text: "text-hoot-foreground" },
};
const ROW_GRID = "grid grid-cols-[52px_110px_minmax(0,1fr)_220px_180px] items-center gap-3 px-5";

const dt = (d: string) => DateTime.fromISO(d, { zone: NY });
const monoDay = (d: string) => dt(d).toFormat("ccc d LLL").toUpperCase();
const minutesOf = (iso: string) => {
  const t = DateTime.fromISO(iso).setZone(NY);
  return t.hour * 60 + t.minute;
};
/** "$4.62", "−$0.12". */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
  const { base, defaultShow, query, today: serverToday, selectedDay, events, accessibleTeamIds, feedSource = {}, factorContext, askable = true, teamSlug } = props;
  const router = useRouter();
  const now = useNow();
  const today = now === null ? serverToday : todayIn(now);
  const [importance, setImportance] = useState<Importance>("all");
  const [search, setSearch] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null);

  const href = (q: Partial<CalendarQuery>) => calendarHref(base, { ...query, ...q }, defaultShow);
  const reportHref = reportHrefFor(props.scopeSlug);
  const show = new Set(query.show);
  const accessible = new Set(accessibleTeamIds);
  const mini = buildMiniMonth(query.month);
  const week = weekDays(selectedDay);
  const weekRange = { from: week[0], to: week[6] };
  const monthRange = { from: mini.first, to: mini.last };
  const weekInMonth = weekRange.from >= monthRange.from && weekRange.to <= monthRange.to;
  const monthFeed = useEconomicFeed(monthRange, feedSource);
  const weekFeed = useEconomicFeed(weekInMonth ? null : weekRange, feedSource);
  const primary = weekInMonth ? monthFeed : weekFeed;
  const retry = () => {
    monthFeed.retry();
    if (!weekInMonth) weekFeed.retry();
  };

  const inWeek = (d: string) => d >= weekRange.from && d <= weekRange.to;
  const monthEcon = monthFeed.feed?.events ?? [];
  const weekEcon = weekInMonth ? monthEcon.filter((e) => inWeek(e.date)) : (weekFeed.feed?.events ?? []);
  const q = search.toLowerCase().trim();
  const keep = IMPORTANCE.find((i) => i.id === importance)!.keep;
  const econFilter = (list: EconomicEvent[]) => (show.has("economic") ? list.filter((e) => keep(e) && `${e.name} ${e.category ?? ""} ${e.source ?? ""}`.toLowerCase().includes(q)) : []);
  const earnFilter = (list: CalendarEvent[]) => list.filter((ev) => (ev.kind === "holding" ? show.has("holdings") : show.has("bellwethers")));

  const weekEvents = events.filter((ev) => inWeek(ev.date));
  const weekItems = toItems(earnFilter(weekEvents), econFilter(weekEcon));
  const monthItems = toItems(earnFilter(events.filter((ev) => ev.date.startsWith(query.month))), econFilter(monthEcon));
  const next = now === null ? null : nextRelease(weekEcon, now);

  // Picking a factor line opens that release's row in the week that holds it.
  const pick = (e: EconomicEvent) => {
    setImportance("all");
    setSearch("");
    setOpenRow(e.id);
    setJump((j) => ({ id: releaseDomId(e), n: (j?.n ?? 0) + 1 }));
    if (query.layout !== "week" || !show.has("economic") || !inWeek(e.date))
      router.push(href({ layout: "week", day: e.date, month: e.date.slice(0, 7), show: show.has("economic") ? query.show : toggleKind(query.show, "economic") }), { scroll: false });
  };
  useEffect(() => {
    if (jump) document.getElementById(jump.id)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [jump, weekItems.length]);

  const factorText = (e: EconomicEvent): ReactNode =>
    factorContext ? (
      <Suspense fallback={null}>
        <FactorClause context={factorContext} event={e} />
      </Suspense>
    ) : null;
  const rowProps = { now, today, nextId: next?.id ?? null, openRow, onRow: (id: string) => setOpenRow((r) => (r === id ? null : id)), accessible, askable, teamSlug, factorText, reportHref };

  const counts = {
    holdings: weekEvents.filter((ev) => ev.kind === "holding").length,
    bellwethers: weekEvents.filter((ev) => ev.kind === "bellwether").length,
    economic: weekEcon.length,
  };
  const scopeItems = query.layout === "week" ? weekItems : monthItems;
  const meta = [
    show.has("holdings") && plural(scopeItems.filter((i) => i.type === "holding").length, "Fund report"),
    show.has("bellwethers") && plural(scopeItems.filter((i) => i.type === "bellwether").length, "bellwether"),
    show.has("economic") && (primary.feed || query.layout !== "week" ? plural(scopeItems.filter((i) => i.type === "economic").length, "release") : "loading releases…"),
  ].filter(Boolean);
  const title = query.layout === "week" ? `Week of ${dt(week[0]).toFormat("LLLL d")}` : mini.label;
  const expectations = weekEvents.filter((ev) => ev.kind === "holding" && ev.teamId && accessible.has(ev.teamId));
  const coverage = primary.feed?.coverage;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div data-tour="calendar-side" className="flex min-h-0 flex-col gap-5">
        <MiniMonth
          mini={mini}
          today={today}
          week={week}
          prevHref={href({ month: dt(mini.first).minus({ months: 1 }).toFormat("yyyy-LL"), day: undefined })}
          nextHref={href({ month: dt(mini.first).plus({ months: 1 }).toFormat("yyyy-LL"), day: undefined })}
          todayHref={week.includes(today) ? null : href({ month: today.slice(0, 7), day: today })}
          dayHref={(d) => href({ day: d })}
          earnings={new Set(earnFilter(events).map((ev) => ev.date))}
          econ={new Set(show.has("economic") ? monthEcon.map((e) => e.date) : [])}
        />
        <Panel className="shrink-0 px-3.5 pt-3.5 pb-3.5">
          <h2 className="text-[14.5px] font-semibold">Show</h2>
          <ul className="mt-2.5 flex flex-col gap-2.5 text-[13.5px]">
            {SHOW.map((s) => {
              const on = show.has(s.kind);
              return (
                <li key={s.kind}>
                  <Link href={href({ show: toggleKind(query.show, s.kind) })} scroll={false} role="checkbox" aria-checked={on} className="flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className={cn("grid size-4 shrink-0 place-items-center rounded-[5px]", on ? "bg-primary text-primary-foreground" : "shadow-[inset_0_0_0_1.5px_var(--border-strong)]")}>{on && <Check className="size-[11px]" strokeWidth={3} />}</span>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: s.dot }} />
                    <span className="flex-1">{s.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{counts[s.kind]}</span>
                  </Link>
                  {s.kind === "economic" && on && (
                    <div className="mt-2.5 flex flex-col gap-2 pl-[26px]">
                      <Segmented
                        label="Importance"
                        className="self-start"
                        segments={IMPORTANCE.map((i) => ({
                          key: i.id,
                          label: (
                            <>
                              {i.label}
                              <span className="ml-1.5 font-mono text-[11px] font-normal text-muted-foreground">{weekEcon.filter(i.keep).length}</span>
                            </>
                          ),
                          active: importance === i.id,
                          onClick: () => setImportance(i.id),
                        }))}
                      />
                      <label className="flex h-8 items-center gap-2 rounded-lg bg-card px-2.5 text-muted-foreground shadow-[0_0_0_1px_var(--border)] focus-within:ring-2 focus-within:ring-ring">
                        <Search className="size-3.5 shrink-0" />
                        <span className="sr-only">Find a release</span>
                        <input type="search" placeholder="Find a release or speaker" value={search} onChange={(e) => setSearch(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground" />
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {props.canScope && <ScopeControl query={query} href={href} base={base} industries={props.industries} defaultShow={defaultShow} />}
          {props.notices.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 border-t border-row pt-2.5 text-[12px] leading-[17px] text-muted-foreground">
              {props.notices.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </Panel>
        {factorContext && show.has("economic") && now !== null && weekEcon.length > 0 && (
          <Suspense fallback={null}>
            <BookSensitivity context={factorContext} events={weekEcon} now={now} onPick={pick} />
          </Suspense>
        )}
        <Panel className="min-h-[220px] flex-1 px-3.5 pt-3.5 pb-3.5">
          <h2 className="text-[14.5px] font-semibold">Expectations this week</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">They lock when each report lands.</p>
          <ul className="mt-2.5 flex flex-col">
            {expectations.map((ev) => {
              const st = EXPECTATIONS[ev.expectations ?? "not_started"];
              const owner = ev.ownerId ? props.ownerNames[ev.ownerId] : null;
              return (
                <li key={ev.earningsId} className="border-t border-row">
                  <Link href={reportHref(ev.teamSlug, ev.earningsId)} className="-mx-1.5 flex h-10 items-center gap-2.5 rounded-lg px-1.5 text-[13.5px] hover:bg-band">
                    <span className="w-11 shrink-0 font-mono text-[13px] font-semibold">{ev.ticker}</span>
                    <span className={cn("min-w-0 flex-1 truncate", owner ? "text-ink-2" : "text-caution-foreground")}>{owner ?? "No owner"}</span>
                    <Pill tone={st.tone}>{st.pill}</Pill>
                  </Link>
                </li>
              );
            })}
            {expectations.length === 0 && <li className="border-t border-row py-2.5 text-[13px] text-muted-foreground">No Fund holdings report this week.</li>}
          </ul>
          <div className="flex-1" />
          <div className="mt-3 flex flex-col gap-1">
            <p className="text-[12px] leading-[18px] text-muted-foreground">
              {coverage?.status === "partial" ? <>Economic coverage is partial: {coverage.message}</> : coverage ? coverage.message : "Economic coverage is partial: public agency feeds only."}
            </p>
            <FeedStatus feed={primary.feed} error={primary.error} loading={primary.loading} onRetry={retry} />
          </div>
        </Panel>
      </div>

      <Panel data-tour="calendar-week" className="min-h-[520px]">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b px-5">
          <h2 className="text-[17px] font-semibold tracking-[-0.015em] whitespace-nowrap">{title}</h2>
          <span className="truncate text-[13px] text-muted-foreground">{meta.join(" · ")}</span>
          <span className="flex-1" />
          <Segmented label="Layout" segments={CALENDAR_LAYOUTS.map((l) => ({ key: l, label: LAYOUT_LABELS[l], href: href({ layout: l }), active: query.layout === l }))} />
        </div>
        {props.banner}
        {query.layout === "week" && <WeekLayout week={week} items={weekItems} rowProps={rowProps} />}
        {query.layout === "month" && <MonthLayout month={query.month} items={monthItems} today={today} week={week} dayHref={(d) => href({ layout: "week", day: d })} accessible={accessible} reportHref={reportHref} />}
        {query.layout === "list" && <ListLayout items={monthItems} rowProps={rowProps} reports={props.reports} showTeam={props.showTeam} today={today} />}
      </Panel>
    </div>
  );
}

type RowProps = {
  now: number | null;
  today: string;
  nextId: string | null;
  openRow: string | null;
  onRow: (id: string) => void;
  accessible: Set<string>;
  askable: boolean;
  teamSlug: string | null;
  factorText: (e: EconomicEvent) => ReactNode;
  reportHref: ReportHref;
};

type ReportHref = (owner: string | null | undefined, earningsId: string | undefined) => string;

/** A report's page, opened in the calendar's scope when it can be (see earningsHref). Only holdings have one. */
function reportHrefFor(scopeSlug: string | null | undefined): ReportHref {
  return (owner, earningsId) => earningsHref(scopeSlug, owner ?? scopeSlug ?? "", earningsId ?? "");
}

function MiniMonth({
  mini,
  today,
  week,
  prevHref,
  nextHref,
  todayHref,
  dayHref,
  earnings,
  econ,
}: {
  mini: ReturnType<typeof buildMiniMonth>;
  today: string;
  week: string[];
  prevHref: string;
  nextHref: string;
  todayHref: string | null;
  dayHref: (d: string) => string;
  earnings: Set<string>;
  econ: Set<string>;
}) {
  const nav = "grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground";
  const cells = mini.weeks.flat();
  return (
    <Panel className="shrink-0 px-3.5 pt-3.5 pb-2.5">
      <div className="flex items-center gap-1">
        <h2 className="flex-1 text-[14.5px] font-semibold">{mini.label}</h2>
        {todayHref && (
          <Link href={todayHref} scroll={false} className="mr-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
            Today
          </Link>
        )}
        <Link href={prevHref} scroll={false} aria-label="Previous month" className={nav}>
          <ChevronLeft className="size-4" />
        </Link>
        <Link href={nextHref} scroll={false} aria-label="Next month" className={nav}>
          <ChevronRight className="size-4" />
        </Link>
      </div>
      <div className="mt-2.5 grid grid-cols-7 gap-y-0.5 text-center font-mono text-[11.5px]">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="pb-1.5 text-muted-foreground">
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} className="h-[34px]" />;
          const col = i % 7;
          const inWeek = week.includes(d);
          const first = inWeek && (col === 0 || !cells[i - 1]);
          const last = inWeek && (col === 6 || !cells[i + 1]);
          const note = marketDayNote(d);
          return (
            <Link
              key={d}
              href={dayHref(d)}
              scroll={false}
              aria-label={`Week of ${d}`}
              aria-current={inWeek ? "date" : undefined}
              title={note ?? undefined}
              className={cn(
                "flex h-[34px] flex-col items-center justify-center gap-0.5 hover:bg-band",
                inWeek && "bg-row font-semibold hover:bg-row",
                first && "rounded-l-[10px]",
                last && "rounded-r-[10px]",
                !inWeek && "rounded-[10px]",
                col > 4 ? "text-muted-foreground" : "text-foreground",
                note && "text-muted-foreground",
              )}
            >
              <span className={cn("grid size-[20px] place-items-center rounded-full leading-none", d === today && "shadow-[inset_0_0_0_1.5px_var(--foreground)]")}>{Number(d.slice(8))}</span>
              <span className="flex h-1 gap-0.5">
                <span className="size-1 rounded-full" style={{ background: earnings.has(d) ? "var(--series-1)" : "transparent" }} />
                <span className="size-1 rounded-full" style={{ background: econ.has(d) ? "var(--series-2)" : "transparent" }} />
              </span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

function ScopeControl({
  query,
  href,
  base,
  industries,
  defaultShow,
}: {
  query: CalendarQuery;
  href: (q: Partial<CalendarQuery>) => string;
  base: string;
  industries: string[];
  defaultShow: CalendarKind[];
}) {
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-row pt-3">
      <div className="flex items-center gap-2.5">
        <span className="flex-1 text-[13px] whitespace-nowrap text-ink-2">Scope</span>
        <Segmented label="Scope" segments={CALENDAR_VIEWS.map((v) => ({ key: v, label: VIEW_LABELS[v], href: href({ scope: v }), active: query.scope === v, title: v === "fund" ? "Every Fund holding and bellwether" : v === "sector" ? "This team's holdings and its sectors" : "One industry in this team's sectors" }))} />
      </div>
      {query.scope === "industry" && (
        <form action={base} className="flex items-center gap-1.5">
          <input type="hidden" name="scope" value="industry" />
          {query.layout !== "week" && <input type="hidden" name="view" value={query.layout} />}
          <input type="hidden" name="month" value={query.month} />
          {query.day && <input type="hidden" name="day" value={query.day} />}
          {query.show.join() !== defaultShow.join() && <input type="hidden" name="show" value={query.show.length ? CALENDAR_KINDS.filter((k) => query.show.includes(k)).join(",") : "none"} />}
          <NativeSelect name="industry" defaultValue={query.industry ?? ""} aria-label="Industry" className="h-8 min-w-0 flex-1 text-[13px]">
            <option value="">Choose an industry</option>
            {industries.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" size="sm" variant="outline">
            Show
          </Button>
        </form>
      )}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />;
}

/** One event as a row: time · kind · name and sub · figures · status. */
function Row({ item, rowProps: r, wide = false }: { item: Item; rowProps: RowProps; wide?: boolean }) {
  const k = KIND[item.type];
  const kind = (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-2">
      <Dot color={k.dot} />
      <span className="truncate">{k.label}</span>
    </span>
  );
  if (item.type !== "economic") {
    const ev = item.ev;
    const linkable = ev.kind === "holding" && !!ev.teamId && r.accessible.has(ev.teamId) && !!ev.earningsId;
    const sub =
      ev.kind === "holding"
        ? [ev.name, ev.teamName, wide && ev.industry, ev.dateStatus === "estimated" && "date est."]
        : [ev.name, ev.sector ? SECTOR_LABELS[ev.sector] : null, ev.etf, wide && ev.industry, ev.dateStatus === "estimated" && "date est."];
    const st = ev.kind === "holding" ? (ev.status === "upcoming" || !ev.status ? EXPECTATIONS[ev.expectations ?? "not_started"] : null) : null;
    const body = (
      <>
        <span className="font-mono text-[12.5px] text-muted-foreground" title={ev.reportHour ? HOUR_LABEL[ev.reportHour] : "Time not announced"}>
          {ev.reportHour ? ev.reportHour.toUpperCase() : "—"}
        </span>
        {kind}
        <span className="min-w-0 truncate">
          <span className="font-mono text-[13px] font-semibold">{ev.ticker}</span>
          <span className="ml-2 text-muted-foreground">{sub.filter(Boolean).join(" · ")}</span>
        </span>
        <span className="truncate font-mono text-[12.5px] text-ink-2">EPS est. {fmtCurrency(ev.epsEstimate, ev.epsCurrency)}</span>
        <span className={cn("truncate text-[12.5px] font-medium", st ? st.text : ev.status === "reviewed" ? "text-good-foreground" : "text-muted-foreground")}>
          {st ? st.row : ev.status === "reported" ? "Reported · reflection due" : ev.status === "reviewed" ? "Reviewed" : ""}
        </span>
      </>
    );
    return linkable ? (
      <Link href={r.reportHref(ev.teamSlug, ev.earningsId)} className={cn(ROW_GRID, "h-9 text-[13.5px] hover:bg-band")}>
        {body}
      </Link>
    ) : (
      <div className={cn(ROW_GRID, "h-9 text-[13.5px]")}>{body}</div>
    );
  }
  const e = item.e;
  const id = releaseDomId(e);
  const open = r.openRow === e.id;
  const isNext = r.nextId === e.id;
  const sub = [e.period, e.unit, e.tentative && "Tentative", wide && e.source].filter(Boolean).join(" · ");
  return (
    <div id={id} className="scroll-mt-24">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-details`}
        onClick={() => r.onRow(e.id)}
        className={cn(ROW_GRID, "h-9 w-full text-left text-[13.5px] outline-none hover:bg-band focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", (open || isNext) && "bg-band")}
      >
        <span className="truncate font-mono text-[12.5px] text-muted-foreground" title={e.time}>
          {releaseClock(e)}
        </span>
        {kind}
        <span className="min-w-0 truncate">
          <span className={cn("font-semibold", (e.importance ?? 0) < 2 && "font-medium text-ink-2")}>{e.name}</span>
          {sub && <span className="ml-2 text-muted-foreground">{sub}</span>}
        </span>
        <span className="truncate font-mono text-[12.5px] text-ink-2">{releaseFigures(e, r.now)}</span>
        <span className="flex min-w-0">
          <ReleaseStatus event={e} now={r.now} today={r.today} isNext={isNext} />
        </span>
      </button>
      {open && r.now !== null && <ReleaseDetails id={`${id}-details`} event={e} now={r.now} today={r.today} isNext={isNext} askable={r.askable} teamSlug={r.teamSlug} factorLine={r.factorText(e)} />}
    </div>
  );
}

function nextText(item: Item) {
  const day = dt(item.date).toFormat("cccc");
  if (item.type === "economic") return `${day}'s ${item.e.timestamp ? `${releaseClock(item.e)} ` : ""}${item.e.name}`;
  return `${day}'s ${item.ev.ticker} report`;
}

function WeekLayout({ week, items, rowProps }: { week: string[]; items: Item[]; rowProps: RowProps }) {
  const { today, now } = rowProps;
  // Weekdays always get a section; a weekend day only when something is on it.
  const days = week.filter((d, i) => i < 5 || items.some((it) => it.date === d));
  const firstEmpty = days.find((d) => !items.some((it) => it.date === d));
  const nowMinutes = now === null ? null : minutesOf(new Date(now).toISOString());
  return (
    <div className="flex flex-1 flex-col">
      {days.map((day) => {
        const rows = items.filter((it) => it.date === day);
        const note = marketDayNote(day);
        const later = items.find((it) => it.date > day);
        const weekday = day === today ? "today" : `on ${dt(day).toFormat("cccc")}`;
        const nowAt = day === today && nowMinutes !== null ? rows.findIndex((it) => it.sort > nowMinutes) : -2;
        return (
          <section key={day} aria-label={dt(day).toFormat("cccc, LLL d")} className={cn("flex flex-col border-b border-border pb-2 last:border-b-0", rows.length ? "flex-1" : "flex-none")}>
            <div className="flex items-baseline gap-2 px-5 pt-2.5 pb-1">
              <span className={cn("font-mono text-[12.5px] font-semibold", day < today && "text-muted-foreground")}>{monoDay(day)}</span>
              {day === today && <Pill tone="ink" className="h-[18px] px-[7px] text-[11px]">Today</Pill>}
              {note && <span className="text-[12.5px] whitespace-nowrap text-muted-foreground">{note}</span>}
            </div>
            {rows.length === 0 ? (
              <div className="flex items-center gap-2.5 px-5 text-[13.5px] text-ink-2">
                {day === firstEmpty ? (
                  <>
                    <HootOnPage />
                    <HootSprite mood="sleepy" size={40} />
                  </>
                ) : null}
                <span className={cn(day !== firstEmpty && "py-1")}>
                  Nothing for the Fund {weekday}.{later && day >= today ? ` I'll be back for ${nextText(later)}.` : ""}
                </span>
              </div>
            ) : (
              rows.map((it, i) => (
                <Fragment key={it.key}>
                  {i === nowAt && now !== null && <NowLine now={now} />}
                  <Row item={it} rowProps={rowProps} />
                </Fragment>
              ))
            )}
            {nowAt === -1 && now !== null && rows.length > 0 && <NowLine now={now} />}
          </section>
        );
      })}
    </div>
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
  // A month cell lists the Fund's and bellwethers' reports and the high-importance releases; the rest are counted.
  const label = (it: Item) => (it.type === "economic" ? it.e.name : it.ev.ticker);
  return (
    <div className="flex flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-5 border-b border-row">
        {["MON", "TUE", "WED", "THU", "FRI"].map((d) => (
          <div key={d} className="px-3 py-2 font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      {grid.weeks.map((row) => (
        <div key={row[0].date} className="grid min-h-[104px] flex-1 grid-cols-5 border-b border-row last:border-b-0">
          {row.map((day, i) => {
            const all = items.filter((it) => it.date === day.date);
            const shown = all.filter((it) => it.type !== "economic" || it.e.importance === 3).slice(0, MAX);
            const more = all.length - shown.length;
            const note = marketDayNote(day.date);
            return (
              <div key={day.date} className={cn("flex min-w-0 flex-col gap-1 px-2.5 py-2", i > 0 && "shadow-[inset_1px_0_0_var(--row)]", week.includes(day.date) && "bg-band", !day.inMonth && "opacity-45")}>
                <div className="flex items-center gap-1.5">
                  <Link href={dayHref(day.date)} scroll={false} aria-label={`Week of ${day.date}`} className={cn("grid size-6 place-items-center rounded-full font-mono text-[12px] hover:bg-muted", day.date === today && "bg-primary text-primary-foreground hover:bg-primary/90", !day.trading && day.date !== today && "text-muted-foreground")}>
                    {Number(day.date.slice(8))}
                  </Link>
                  {note && (
                    <span className="truncate text-[11px] text-muted-foreground" title={note}>
                      {note.split(" · ")[0]}
                    </span>
                  )}
                </div>
                {shown.map((it) => {
                  const linkable = it.type === "holding" && !!it.ev.teamId && accessible.has(it.ev.teamId) && !!it.ev.earningsId;
                  const inner = (
                    <>
                      <Dot color={KIND[it.type].dot} />
                      <span className={cn("truncate", it.type !== "economic" && "font-mono text-[11.5px] font-medium")}>{label(it)}</span>
                    </>
                  );
                  const title = it.type === "economic" ? `${it.e.name}${it.e.timestamp ? ` · ${releaseClock(it.e)} ET` : ""}` : `${it.ev.name}${it.ev.teamName ? ` · ${it.ev.teamName}` : it.ev.etf ? ` · ${it.ev.etf} constituent` : ""}`;
                  return linkable && it.type === "holding" ? (
                    <Link key={it.key} href={reportHref(it.ev.teamSlug, it.ev.earningsId)} title={title} className="flex min-w-0 items-center gap-1.5 text-[12px] hover:underline">
                      {inner}
                    </Link>
                  ) : (
                    <span key={it.key} title={title} className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-2">
                      {inner}
                    </span>
                  );
                })}
                {more > 0 && (
                  <Link href={dayHref(day.date)} scroll={false} className="text-[11.5px] text-muted-foreground hover:text-foreground hover:underline">
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

function ListLayout({ items, rowProps, reports, showTeam, today }: { items: Item[]; rowProps: RowProps; reports: ReportRow[]; showTeam: boolean; today: string }) {
  const days = [...new Set(items.map((it) => it.date))];
  const upcoming = reports.filter((r) => r.status === "upcoming" && r.reportDate >= today).sort((a, b) => (a.reportDate < b.reportDate ? -1 : 1));
  const past = reports.filter((r) => !(r.status === "upcoming" && r.reportDate >= today));
  return (
    <div className="flex flex-col">
      {days.length === 0 && <p className="px-5 py-6 text-[13.5px] text-muted-foreground">Nothing on the calendar this month.</p>}
      {days.map((day) => (
        <section key={day} aria-label={dt(day).toFormat("cccc, LLL d")} className="border-b border-border pb-2">
          <div className="flex items-baseline gap-2 px-5 pt-2.5 pb-1">
            <span className={cn("font-mono text-[12.5px] font-semibold", day < today && "text-muted-foreground")}>{monoDay(day)}</span>
            {marketDayNote(day) && <span className="text-[12.5px] text-muted-foreground">{marketDayNote(day)}</span>}
          </div>
          {items
            .filter((it) => it.date === day)
            .map((it) => (
              <Row key={it.key} item={it} rowProps={rowProps} wide />
            ))}
        </section>
      ))}
      <ReportTable title="Upcoming Fund reports" rows={upcoming} showTeam={showTeam} reportHref={rowProps.reportHref} />
      {past.length > 0 && <ReportTable title="Reported" rows={past} showTeam={showTeam} reportHref={rowProps.reportHref} />}
    </div>
  );
}

function ReportTable({ title, rows, showTeam, reportHref }: { title: string; rows: ReportRow[]; showTeam: boolean; reportHref: ReportHref }) {
  return (
    <section aria-label={title} className="border-b border-border last:border-b-0">
      <div className="flex items-baseline gap-2 px-5 pt-4 pb-2">
        <h3 className="text-[14.5px] font-semibold">{title}</h3>
        <span className="font-mono text-[11px] text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-4 text-[13.5px] text-muted-foreground">Nothing scheduled.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Ticker</TableHead>
              {showTeam && <TableHead>Team</TableHead>}
              <TableHead>Report date</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">EPS est.</TableHead>
              <TableHead>Expectations</TableHead>
              <TableHead className="pr-5">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="pl-5">
                  {r.teamSlug ? (
                    <Link href={reportHref(r.teamSlug, r.id)} className="font-mono font-semibold hover:underline">
                      {r.ticker}
                    </Link>
                  ) : (
                    <span className="font-mono font-semibold">{r.ticker}</span>
                  )}
                </TableCell>
                {showTeam && <TableCell className="text-ink-2">{r.teamName}</TableCell>}
                <TableCell className="font-mono text-[12.5px]">
                  {fmtDate(r.reportDate)}
                  {r.reportHour ? <span className="ml-1.5 text-muted-foreground">{r.reportHour.toUpperCase()}</span> : null}
                </TableCell>
                <TableCell className="text-ink-2">{r.dateStatus ?? "—"}</TableCell>
                <TableCell className="text-right font-mono text-[12.5px]">{fmtCurrency(r.epsEstimate, r.epsCurrency)}</TableCell>
                <TableCell>
                  <Pill tone={EXPECTATIONS[r.expectations].tone}>{EXPECTATIONS[r.expectations].pill}</Pill>
                </TableCell>
                <TableCell className="pr-5">
                  <StatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
