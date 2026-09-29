"use client";

import { Suspense, use, useMemo, useState } from "react";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtChangeBp, fmtChangePct, fmtDay, fmtDayMonth, ppToBp, relativeTime } from "@/lib/format";
import { dayWhen } from "@/lib/agent/board";
import { FilterChip, FilterChips, Pill, type PillTone } from "@/components/app/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { ReadAs, tickerName } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";

export type HoldingCardData = {
  id: string;
  ticker: string;
  name: string;
  href: string;
  /** The covering team, shown when the page spans the whole fund. */
  teamName?: string;
  chats: number;
  sources: number;
  /** ISO time of the latest chat activity. */
  lastActivity: string | null;
  /** Someone's question is still being answered. */
  running?: { authorName: string | null; title: string };
  /** An open movement on this holding: the team owes an update. */
  movement?: { dueAt: string | null };
  /** The next scheduled report, when one is on the calendar. */
  earnings?: { reportDate: string; dateStatus: string; hasExpectations: boolean };
};

/** Day move and move versus the S&P 500, per ticker, once quotes arrive. */
export type MarketByTicker = Record<string, { changePct?: number; relativePp?: number }>;

/** Expectations count as due once a report is this close and none are written. */
const EXPECTATIONS_DUE_DAYS = 14;
/** Boards listed before "All N". */
const SHOWN = 6;

type Filter = "all" | "attention" | "researched" | "none";
type Sort = "attention" | "recent" | "report" | "ticker";

const daysUntil = (isoDate: string, now: number) => Math.round((new Date(`${isoDate}T12:00:00Z`).getTime() - now) / 86_400_000);

function attention(h: HoldingCardData, now: number) {
  const movement = Boolean(h.movement);
  const overdue = Boolean(h.movement?.dueAt && new Date(h.movement.dueAt).getTime() < now);
  const expectationsDue = Boolean(h.earnings && !h.earnings.hasExpectations && daysUntil(h.earnings.reportDate, now) <= EXPECTATIONS_DUE_DAYS);
  return { movement, overdue, expectationsDue, any: movement || expectationsDue };
}

type Flags = ReturnType<typeof attention>;

/** The board's one status word: red for an overdue write-up, amber for something to check, grey for where expectations stand. */
function statusOf(h: HoldingCardData, flags: Flags): { word: string; tone: PillTone; title?: string } | null {
  if (h.movement) {
    const due = h.movement.dueAt ? `Update due ${fmtDay(h.movement.dueAt)}` : "Update owed";
    return { word: flags.overdue ? "Movement overdue" : "Movement open", tone: flags.overdue ? "hoot" : "ink", title: due };
  }
  if (flags.expectationsDue && h.earnings) return { word: `Expectations due ${fmtDayMonth(h.earnings.reportDate)}`, tone: "caution" };
  if (h.earnings) return h.earnings.hasExpectations ? { word: "Expectations recorded", tone: "good" } : { word: "Expectations not written", tone: "neutral" };
  return null;
}

/**
 * Holding boards, "needs attention first": one row per holding with how recently it was researched, its team and next
 * report, and one status word. "All N" opens every board as a table (day move, next report, expectations, research,
 * status) with filters, a sort and a search; a row opens the board.
 */
export function ResearchBoards({ holdings, market, showTeam }: { holdings: HoldingCardData[]; market: Promise<MarketByTicker>; showTeam: boolean }) {
  const [now] = useState(() => Date.now());
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("attention");
  const [q, setQ] = useState("");

  const flags = useMemo(() => new Map(holdings.map((h) => [h.id, attention(h, now)])), [holdings, now]);
  const counts = {
    all: holdings.length,
    attention: holdings.filter((h) => flags.get(h.id)!.any).length,
    researched: holdings.filter((h) => h.chats > 0).length,
    none: holdings.filter((h) => h.chats === 0).length,
  };

  const f = q.trim().toLowerCase();
  const filtered = holdings
    .filter((h) => {
      if (filter === "attention" && !flags.get(h.id)!.any) return false;
      if (filter === "researched" && h.chats === 0) return false;
      if (filter === "none" && h.chats > 0) return false;
      return !f || [h.ticker, h.name, h.teamName ?? ""].some((s) => s.toLowerCase().includes(f));
    })
    .sort((a, b) => compare(a, b, sort, flags));
  const first = [...holdings].sort((a, b) => compare(a, b, "attention", flags)).slice(0, SHOWN);

  const chip = (key: Filter, label: string) => (
    <FilterChip key={key} active={filter === key} count={counts[key]} onClick={() => setFilter(key)}>
      {label}
    </FilterChip>
  );

  return (
    <section aria-labelledby="boards" data-tour="research-boards">
      <div className="flex items-baseline gap-2.5 border-b pb-1.5">
        <h2 id="boards" className="flex-1 text-body font-bold">
          Holding boards <span className="font-medium text-muted-foreground">· needs attention first</span>
        </h2>
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="rounded-sm text-caption text-ink-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {all ? "Fewer" : `All ${holdings.length}`}
        </button>
      </div>

      {all && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-2">
          <FilterChips label="Show">
            {chip("all", "All")}
            {chip("attention", "Needs attention")}
            {chip("researched", "Researched")}
            {chip("none", "No research yet")}
          </FilterChips>
          <span className="flex-1" />
          <label className="flex items-center">
            <span className="sr-only">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-7 rounded-md bg-secondary px-2 text-body text-ink-3 outline-none focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="attention">Sort: needs attention</option>
              <option value="recent">Sort: latest research</option>
              <option value="report">Sort: next report</option>
              <option value="ticker">Sort: ticker A–Z</option>
            </select>
          </label>
          <label className="flex h-7 w-44 items-center gap-1.5 rounded-md bg-secondary px-2 text-muted-foreground focus-within:outline-2 focus-within:outline-ring">
            <Search className="size-3.5 shrink-0" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter holdings…" aria-label="Filter holdings" className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground" />
          </label>
        </div>
      )}

      {holdings.length === 0 ? null : all ? (
        <div role="table" aria-label="Holding boards" className="text-body">
          <div role="row" className={cn(ROW, "h-9 border-b text-caption text-muted-foreground")}>
            <span role="columnheader" aria-sort={sort === "ticker" ? "ascending" : undefined}>
              Holding
            </span>
            <span role="columnheader" className="text-right">
              <ReadAs text="Day change and versus S&P 500">Day · vs S&amp;P</ReadAs>
            </span>
            <span role="columnheader" aria-sort={sort === "report" ? "ascending" : undefined}>
              Next report
            </span>
            <span role="columnheader" className="hidden xl:block">
              Expectations
            </span>
            <span role="columnheader" aria-sort={sort === "recent" ? "descending" : undefined}>
              Research
            </span>
            <span role="columnheader" aria-sort={sort === "attention" ? "other" : undefined}>
              Status
            </span>
            <span aria-hidden />
          </div>
          {filtered.length === 0 ? (
            <div role="row">
              <p role="cell" className="py-6 text-body text-muted-foreground">
                {f ? `No holdings match “${q.trim()}”` : "No holdings"}
                {filter !== "all" ? ` under ${FILTER_LABEL[filter]}.` : "."}
              </p>
            </div>
          ) : (
            <div role="rowgroup">
              {filtered.map((h) => (
                <BoardRow key={h.id} h={h} flags={flags.get(h.id)!} market={market} showTeam={showTeam} now={now} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div role="table" aria-label="Holding boards" className="text-body">
          <div role="row" className="sr-only">
            <span role="columnheader">Holding</span>
            <span role="columnheader">Research</span>
            <span role="columnheader" aria-sort="other">
              Status
            </span>
          </div>
          <div role="rowgroup">
            {first.map((h) => (
              <ShortRow key={h.id} h={h} flags={flags.get(h.id)!} showTeam={showTeam} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const FILTER_LABEL: Record<Filter, string> = { all: "All", attention: "Needs attention", researched: "Researched", none: "No research yet" };

const ROW =
  "grid grid-cols-[minmax(140px,1fr)_84px_minmax(104px,150px)_118px_minmax(110px,160px)_12px] items-center gap-x-3 xl:grid-cols-[minmax(200px,1fr)_128px_128px_128px_150px_minmax(150px,210px)_16px] xl:gap-x-4";

function compare(a: HoldingCardData, b: HoldingCardData, sort: Sort, flags: Map<string, Flags>) {
  const recent = (h: HoldingCardData) => (h.lastActivity ? new Date(h.lastActivity).getTime() : -Infinity);
  const report = (h: HoldingCardData) => h.earnings?.reportDate ?? "9999";
  const byTicker = a.ticker.localeCompare(b.ticker);
  switch (sort) {
    case "ticker":
      return byTicker;
    case "recent":
      return recent(b) - recent(a) || byTicker;
    case "report":
      return report(a).localeCompare(report(b)) || byTicker;
    case "attention": {
      // Overdue updates, then open movements, then expectations due, then the rest by latest research.
      const rank = (h: HoldingCardData) => {
        const x = flags.get(h.id)!;
        return x.overdue ? 0 : x.movement ? 1 : x.expectationsDue ? 2 : 3;
      };
      return rank(a) - rank(b) || recent(b) - recent(a) || byTicker;
    }
  }
}

/** "Researched today", "Researched Fri", "Researched Sep 24", or "No research yet". */
function researched(h: HoldingCardData) {
  if (!h.chats || !h.lastActivity) return "No research yet";
  const day = dayWhen(h.lastActivity);
  return day ? `Researched ${day}` : "Researched";
}

/** A board in the short list: ticker, how recently researched over team and next report, one status word. */
function ShortRow({ h, flags, showTeam }: { h: HoldingCardData; flags: Flags; showTeam: boolean }) {
  const status = statusOf(h, flags);
  const next = h.earnings ? `next report ${fmtDayMonth(h.earnings.reportDate)}${h.earnings.dateStatus === "estimated" ? " (est.)" : ""}` : "no report scheduled";
  const meta = [showTeam ? h.teamName : null, next].filter(Boolean).join(" · ");
  return (
    <div role="row" className="group relative grid min-h-12 grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 border-b border-row py-1.5 hover:bg-band has-[a:focus-visible]:bg-band">
      <div role="rowheader">
        <RowLink cover="stretch" href={h.href} aria-label={tickerName(h.ticker, h.name)} title={`${h.name} · ${h.chats ? `Open ${h.ticker} research` : `Start researching ${h.ticker}`}`} className="font-semibold">
          {h.ticker}
        </RowLink>
      </div>
      <div role="cell" className="flex min-w-0 flex-col">
        <span className="text-ink-3">{researched(h)}</span>
        <span className="truncate text-caption text-muted-foreground">
          {meta}
          {h.running && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-caution-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden /> Answering
            </span>
          )}
        </span>
      </div>
      <div role="cell" className="text-right">
        {status ? (
          <Pill tone={status.tone} title={status.title}>
            {status.word}
          </Pill>
        ) : null}
      </div>
    </div>
  );
}

function BoardRow({ h, flags, market, showTeam, now }: { h: HoldingCardData; flags: Flags; market: Promise<MarketByTicker>; showTeam: boolean; now: number }) {
  const has = h.chats > 0;
  const who = showTeam ? h.teamName : null;
  return (
    // A table row; the ticker link stretches over it, so the whole row opens the board.
    <div role="row" className={cn(ROW, "group relative min-h-[54px] border-b border-row py-2 transition-colors hover:bg-band has-[a:focus-visible]:bg-band")}>
      <div role="rowheader" className="min-w-0">
        <div className="flex items-baseline gap-2">
          <RowLink cover="stretch" href={h.href} aria-label={tickerName(h.ticker, h.name)} title={`${h.name} · ${has ? `Open ${h.ticker} research` : `Start researching ${h.ticker}`}`} className="font-semibold focus-visible:after:ring-0">
            {h.ticker}
          </RowLink>
          {/* Already in the link's name. Wraps under a narrow window rather than cutting off. */}
          <span aria-hidden className="min-w-0 text-ink-2">
            {h.name}
          </span>
        </div>
        {who && <div className="mt-px text-caption text-muted-foreground">{who}</div>}
      </div>

      <div role="cell" className="text-right">
        <Suspense fallback={<Skeleton className="ml-auto h-3.5 w-16" />}>
          <QuoteCell ticker={h.ticker} market={market} alert={flags.movement} />
        </Suspense>
      </div>

      <div role="cell" className="min-w-0">
        {h.earnings ? (
          <>
            <div>{fmtDay(h.earnings.reportDate)}</div>
            <div className="text-caption text-muted-foreground">
              {inDays(daysUntil(h.earnings.reportDate, now))} · {h.earnings.dateStatus}
            </div>
            {/* Under 1280px the Expectations column folds in here. */}
            <div className={cn("text-caption xl:hidden", h.earnings.hasExpectations ? "text-muted-foreground" : flags.expectationsDue ? "font-semibold text-caution-foreground" : "text-muted-foreground")}>
              {h.earnings.hasExpectations ? "Expectations recorded" : "No expectations yet"}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">Not scheduled</span>
        )}
      </div>

      <div role="cell" className="hidden xl:block">
        {!h.earnings ? <span className="text-muted-foreground">—</span> : h.earnings.hasExpectations ? <Pill tone="good">Recorded</Pill> : <Pill tone={flags.expectationsDue ? "caution" : "neutral"}>Not written</Pill>}
      </div>

      <div role="cell" className="min-w-0">
        {has ? (
          <>
            <div>
              {h.sources} source{h.sources === 1 ? "" : "s"} · {h.chats} chat{h.chats === 1 ? "" : "s"}
            </div>
            <div className="text-caption text-muted-foreground">Last {relativeTime(h.lastActivity)}</div>
          </>
        ) : (
          <span className="text-muted-foreground">No research yet</span>
        )}
      </div>

      <div role="cell" className="min-w-0">
        <StatusCell h={h} flags={flags} />
      </div>

      <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </div>
  );
}

function inDays(d: number) {
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d < 0) return `${-d}d ago`;
  return `in ${d}d`;
}

function StatusCell({ h, flags }: { h: HoldingCardData; flags: Flags }) {
  const running = h.running && (
    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-caption text-caution-foreground" title={`${h.running.authorName ?? "Someone"} is asking: ${h.running.title}`}>
      <Loader2 className="size-3 shrink-0 animate-spin" aria-label="Answering" />
      <span className="truncate">
        {h.running.authorName ?? "Someone"} is asking: {h.running.title}
      </span>
    </div>
  );
  const status = statusOf(h, flags);
  if (h.movement) {
    const due = h.movement.dueAt ? `Update due ${fmtDay(h.movement.dueAt)}` : "Update owed";
    return (
      <div className="min-w-0">
        <Pill tone={flags.overdue ? "hoot" : "ink"} title={due}>
          {flags.overdue ? "Movement overdue" : "Movement open"}
        </Pill>
        <div className="mt-1 text-caption text-muted-foreground">{due}</div>
        {running}
      </div>
    );
  }
  const pill = flags.expectationsDue && status ? <Pill tone="caution">Expectations due</Pill> : null;
  if (!pill && !running) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="min-w-0">
      {pill}
      {running}
    </div>
  );
}

function QuoteCell({ ticker, market, alert }: { ticker: string; market: Promise<MarketByTicker>; alert: boolean }) {
  const m = use(market)[ticker];
  if (!m || m.changePct === undefined) return <span className="text-right text-muted-foreground">No quote</span>;
  const tone = m.changePct > 0.005 ? "text-up" : m.changePct < -0.005 ? "text-down" : "text-muted-foreground";
  return (
    <div className="text-right tabular-nums" title={m.relativePp !== undefined ? `${fmtChangeBp(ppToBp(m.relativePp))} vs S&P 500` : undefined}>
      <div className={cn("font-medium", tone)}>{fmtChangePct(m.changePct)}</div>
      {m.relativePp !== undefined && <div className={cn("text-caption", alert ? "text-down" : "text-muted-foreground")}>{fmtChangeBp(ppToBp(m.relativePp))}</div>}
    </div>
  );
}
