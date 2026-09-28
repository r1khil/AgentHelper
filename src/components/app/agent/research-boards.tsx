"use client";

import Link from "next/link";
import { Suspense, use, useMemo, useState } from "react";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtBp, fmtDateTime, fmtDay, fmtPct, ppToBp, relativeTime } from "@/lib/format";
import { CountChip, Panel, Pill, Segmented } from "@/components/app/panel";
import { Skeleton } from "@/components/ui/skeleton";

export type HoldingCardData = {
  id: string;
  ticker: string;
  name: string;
  href: string;
  /** The holding's owner on the team. */
  ownerName: string | null;
  /** The covering team, shown when the page spans the whole fund. */
  teamName?: string;
  chats: number;
  sources: number;
  /** ISO time of the latest chat activity. */
  lastActivity: string | null;
  /** Someone's question is still being answered. */
  running?: { authorName: string | null; title: string };
  /** An open movement on this holding: the analyst owes an update. */
  movement?: { dueAt: string | null };
  /** The next scheduled report, when one is on the calendar. */
  earnings?: { reportDate: string; dateStatus: string; hasExpectations: boolean };
};

/** Day move and move versus the S&P 500, per ticker, once quotes arrive. */
export type MarketByTicker = Record<string, { changePct?: number; relativePp?: number }>;

/** Expectations count as due once a report is this close and none are written. */
const EXPECTATIONS_DUE_DAYS = 14;

type Filter = "all" | "attention" | "researched" | "none";
type Sort = "attention" | "recent" | "report" | "ticker";

const daysUntil = (isoDate: string, now: number) => Math.round((new Date(`${isoDate}T12:00:00Z`).getTime() - now) / 86_400_000);

function attention(h: HoldingCardData, now: number) {
  const movement = Boolean(h.movement);
  const overdue = Boolean(h.movement?.dueAt && new Date(h.movement.dueAt).getTime() < now);
  const expectationsDue = Boolean(h.earnings && !h.earnings.hasExpectations && daysUntil(h.earnings.reportDate, now) <= EXPECTATIONS_DUE_DAYS);
  return { movement, overdue, expectationsDue, any: movement || expectationsDue };
}

/**
 * Every holding's research board as one table: what needs doing first (open movements, expectations due before a
 * report), the day's move, the next report, and how much research each board holds. A row opens the board.
 */
export function ResearchBoards({ holdings, market, showTeam }: { holdings: HoldingCardData[]; market: Promise<MarketByTicker>; showTeam: boolean }) {
  const [now] = useState(() => Date.now());
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
  const shown = holdings
    .filter((h) => {
      if (filter === "attention" && !flags.get(h.id)!.any) return false;
      if (filter === "researched" && h.chats === 0) return false;
      if (filter === "none" && h.chats > 0) return false;
      return !f || [h.ticker, h.name, h.ownerName ?? "", h.teamName ?? ""].some((s) => s.toLowerCase().includes(f));
    })
    .sort((a, b) => compare(a, b, sort, flags));

  const segment = (key: Filter, label: string) => ({
    key,
    label: (
      <>
        {label}
        <span className="ml-1.5 font-mono text-[11px] font-normal text-muted-foreground">{counts[key]}</span>
      </>
    ),
    active: filter === key,
    onClick: () => setFilter(key),
  });

  return (
    <Panel className="min-h-[420px] flex-1 lg:min-h-0" aria-label="Research boards">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5">
        <h2 className="text-[14.5px] font-semibold whitespace-nowrap">Research boards</h2>
        {counts.attention > 0 && (
          <CountChip hot>{counts.attention}</CountChip>
        )}
        <Segmented
          label="Show"
          className="ml-2"
          segments={[segment("all", "All"), segment("attention", "Needs attention"), segment("researched", "Researched"), segment("none", "No research yet")]}
        />
        <span className="flex-1" />
        <label className="flex items-center">
          <span className="sr-only">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-8 rounded-full bg-card px-2.5 text-[13px] text-foreground shadow-[0_0_0_1px_var(--border)] outline-none focus-visible:shadow-[0_0_0_1px_var(--ring)]"
          >
            <option value="attention">Sort: needs attention</option>
            <option value="recent">Sort: latest research</option>
            <option value="report">Sort: next report</option>
            <option value="ticker">Sort: ticker A–Z</option>
          </select>
        </label>
        <label className="flex h-8 w-44 items-center gap-1.5 rounded-full bg-card px-3 text-muted-foreground shadow-[0_0_0_1px_var(--border)] focus-within:shadow-[0_0_0_1px_var(--ring)]">
          <Search className="size-3.5 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter holdings…"
            aria-label="Filter holdings"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[620px] xl:min-w-0">
        <div className={cn(ROW, "sticky top-0 z-[1] h-9 border-b bg-band text-xs text-muted-foreground")} aria-hidden>
          <span>Holding</span>
          <span className="text-right">Day · vs S&amp;P</span>
          <span>Next report</span>
          <span className="hidden xl:block">Expectations</span>
          <span>Research</span>
          <span>Status</span>
          <span />
        </div>
        {holdings.length === 0 ? null : shown.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-muted-foreground">
            {f ? `No holdings match “${q.trim()}”` : "No holdings"}
            {filter !== "all" ? ` under ${FILTER_LABEL[filter]}.` : "."}
          </p>
        ) : (
          <ul>
            {shown.map((h) => (
              <li key={h.id} className="border-b border-row last:border-b-0">
                <BoardRow h={h} flags={flags.get(h.id)!} market={market} showTeam={showTeam} now={now} />
              </li>
            ))}
          </ul>
        )}
        </div>
      </div>
    </Panel>
  );
}

const FILTER_LABEL: Record<Filter, string> = { all: "All", attention: "Needs attention", researched: "Researched", none: "No research yet" };

const ROW =
  "grid grid-cols-[minmax(140px,1fr)_84px_minmax(104px,150px)_118px_minmax(110px,160px)_12px] items-center gap-x-3 px-4 xl:grid-cols-[minmax(200px,1fr)_128px_128px_128px_150px_minmax(150px,210px)_16px] xl:gap-x-4";

function compare(a: HoldingCardData, b: HoldingCardData, sort: Sort, flags: Map<string, ReturnType<typeof attention>>) {
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

function BoardRow({ h, flags, market, showTeam, now }: { h: HoldingCardData; flags: ReturnType<typeof attention>; market: Promise<MarketByTicker>; showTeam: boolean; now: number }) {
  const has = h.chats > 0;
  const who = [h.ownerName, showTeam ? h.teamName : null].filter(Boolean).join(" · ");
  return (
    <Link href={h.href} className={cn(ROW, "group min-h-[54px] py-2 transition-colors hover:bg-band focus-visible:bg-band focus-visible:outline-none")} title={has ? `Open ${h.ticker}'s research board` : `Start researching ${h.ticker}`}>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[13px] font-semibold">{h.ticker}</span>
          <span className="min-w-0 truncate text-[13.5px] text-ink-2" title={h.name}>
            {h.name}
          </span>
        </div>
        {who && <div className="mt-px truncate text-xs text-muted-foreground">{who}</div>}
      </div>

      <Suspense fallback={<Skeleton className="ml-auto h-3.5 w-16" />}>
        <QuoteCell ticker={h.ticker} market={market} alert={flags.movement} />
      </Suspense>

      <div className="min-w-0 text-[13px]">
        {h.earnings ? (
          <>
            <div className="font-mono text-[12.5px]">{fmtDay(h.earnings.reportDate)}</div>
            <div className="truncate text-xs text-muted-foreground">
              {inDays(daysUntil(h.earnings.reportDate, now))} · {h.earnings.dateStatus}
            </div>
            {/* Under 1280px the Expectations column folds in here. */}
            <div className={cn("truncate text-xs xl:hidden", h.earnings.hasExpectations ? "text-good-foreground" : flags.expectationsDue ? "text-caution-foreground" : "text-muted-foreground")}>
              {h.earnings.hasExpectations ? "Expectations recorded" : "No expectations yet"}
            </div>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Not scheduled</span>
        )}
      </div>

      <div className="hidden xl:block">
        {!h.earnings ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : h.earnings.hasExpectations ? (
          <Pill tone="good">Recorded</Pill>
        ) : (
          <Pill tone={flags.expectationsDue ? "caution" : "neutral"}>Not written</Pill>
        )}
      </div>

      <div className="min-w-0 text-[13px]">
        {has ? (
          <>
            <div className="truncate">
              <span className="font-mono text-[12.5px]">{h.sources}</span> source{h.sources === 1 ? "" : "s"} · <span className="font-mono text-[12.5px]">{h.chats}</span> chat{h.chats === 1 ? "" : "s"}
            </div>
            <div className="truncate text-xs text-muted-foreground">Last {relativeTime(h.lastActivity)}</div>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">No research yet</span>
        )}
      </div>

      <StatusCell h={h} flags={flags} />

      <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </Link>
  );
}

function inDays(d: number) {
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d < 0) return `${-d}d ago`;
  return `in ${d}d`;
}

function StatusCell({ h, flags }: { h: HoldingCardData; flags: ReturnType<typeof attention> }) {
  const running = h.running && (
    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={`${h.running.authorName ?? "Someone"} is asking: ${h.running.title}`}>
      <Loader2 className="size-3 shrink-0 animate-spin" aria-label="Answering" />
      <span className="truncate">
        {h.running.authorName ?? "Someone"} is asking: {h.running.title}
      </span>
    </div>
  );
  let pill: React.ReactNode = null;
  if (h.movement) {
    const due = h.movement.dueAt ? `Update due ${fmtDateTime(h.movement.dueAt)}` : "Update owed";
    pill = (
      <Pill tone={flags.overdue ? "hoot" : "caution"} title={due}>
        {flags.overdue ? "Movement · overdue" : "Movement open"}
      </Pill>
    );
    return (
      <div className="min-w-0">
        {pill}
        <div className="mt-1 truncate text-xs text-muted-foreground" title={due}>
          {due}
        </div>
        {running}
      </div>
    );
  }
  if (flags.expectationsDue) pill = <Pill tone="caution">Expectations due</Pill>;
  if (!pill && !running) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="min-w-0">
      {pill}
      {running}
    </div>
  );
}

function QuoteCell({ ticker, market, alert }: { ticker: string; market: Promise<MarketByTicker>; alert: boolean }) {
  const m = use(market)[ticker];
  if (!m || m.changePct === undefined) return <span className="text-right text-xs text-muted-foreground">No quote</span>;
  const tone = m.changePct > 0.005 ? "text-up" : m.changePct < -0.005 ? "text-down" : "text-muted-foreground";
  return (
    <div className="text-right font-mono tabular-nums" title={m.relativePp !== undefined ? `${fmtBp(ppToBp(m.relativePp))} vs S&P 500` : undefined}>
      <div className={cn("text-[13px] font-medium", tone)}>{fmtPct(m.changePct)}</div>
      {m.relativePp !== undefined && <div className={cn("text-[11.5px]", alert ? "text-down" : "text-muted-foreground")}>{fmtBp(ppToBp(m.relativePp))}</div>}
    </div>
  );
}
