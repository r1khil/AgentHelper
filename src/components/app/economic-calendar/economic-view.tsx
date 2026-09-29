"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { weekDays } from "@/lib/earnings-calendar";
import type { CalendarFactorContext } from "@/lib/economic-calendar/factor-lines";
import type { EconomicEvent } from "@/lib/economic-calendar/types";
import { nextRelease, todayIn } from "@/lib/economic-calendar/view";
import { fmtDay, fmtDayMonth, fmtTime } from "@/lib/format";
import { NY } from "@/lib/providers/calendar";
import { cn } from "@/lib/utils";
import { PageHead, PageHero } from "@/components/app/page-head";
import { FilterChip, FilterChips } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { AboutData, FeedNotice } from "./about-data";
import { BookSensitivity, FactorClause } from "./book-sensitivity";
import { IMPORTANCE, IMPORTANCE_LABEL, ReleaseDetails, releaseClock, releaseDomId, releaseResult, revised, consensusSource, type Importance } from "./release";
import { useEconomicFeed, useNow, type FeedSource } from "./use-feed";

export type EconomicViewProps = {
  /** The route this lives on: /t/x/economic-calendar, or the development preview. */
  base: string;
  /** A day in the week to show (from the URL); the week holding today when the URL has none. */
  day: string;
  /** Today in New York, from the server, until the browser's clock takes over. */
  today: string;
  /** The team a Hoot chat about a release opens under; null on the fund's page. */
  teamSlug: string | null;
  factorContext: Promise<CalendarFactorContext> | null;
  feedSource?: FeedSource;
  /** Ask Hoot buttons open real chats; previews turn them off. */
  askable?: boolean;
  /** A line above the table, e.g. the development preview's warning. */
  banner?: ReactNode;
};

const GRID = "grid grid-cols-[110px_minmax(0,1.4fr)_90px_90px_90px_110px_minmax(0,1fr)] items-center gap-3";

const TONE = { ink: "text-foreground", grey: "text-muted-foreground", caution: "text-caution-foreground" } as const;

const dow = (iso: string) => DateTime.fromISO(iso, { zone: NY }).toFormat("cccc");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "ISM manufacturing on Thursday, then payrolls and unemployment on Friday": the week's high-impact releases by day. */
function highImpactLine(events: EconomicEvent[]): string {
  const days = new Map<string, string[]>();
  for (const e of events) {
    if (e.importance !== 3) continue;
    const list = days.get(e.date) ?? [];
    if (!list.includes(e.name)) list.push(e.name);
    days.set(e.date, list);
  }
  const join = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
  return [...days.entries()].map(([date, names]) => `${join(names)} on ${dow(date)}`).join(", then ");
}

/** The Economic releases tab: one week of releases as a table, with each one's result in words. */
export function EconomicView({ base, day, today: serverToday, teamSlug, factorContext, feedSource = {}, askable = true, banner }: EconomicViewProps) {
  const now = useNow();
  const today = now === null ? serverToday : todayIn(now);
  const [importance, setImportance] = useState<Importance>("all");
  const [search, setSearch] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null);

  const week = weekDays(day);
  const range = { from: week[0], to: week[6] };
  const { feed, error, loading, retry } = useEconomicFeed(range, feedSource);
  const events = feed?.events ?? [];
  const q = search.toLowerCase().trim();
  const keep = IMPORTANCE.find((i) => i.id === importance)!.keep;
  const matches = (e: EconomicEvent) => `${e.name} ${e.category ?? ""} ${e.source ?? ""}`.toLowerCase().includes(q);
  const searched = events.filter(matches);
  const rows = searched.filter(keep);
  const next = now === null ? null : nextRelease(events, now);

  const step = (weeks: number) => `${base}?day=${DateTime.fromISO(week[0], { zone: NY }).plus({ weeks }).toISODate()}`;
  const highCount = events.filter((e) => e.importance === 3).length;
  const coverage = feed?.coverage;

  // Picking a factor line opens that release's row.
  const pick = (e: EconomicEvent) => {
    setImportance("all");
    setSearch("");
    setOpenRow(e.id);
    setJump((j) => ({ id: releaseDomId(e), n: (j?.n ?? 0) + 1 }));
  };
  useEffect(() => {
    if (jump) document.getElementById(jump.id)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [jump, rows.length]);

  const factorText = (e: EconomicEvent): ReactNode =>
    factorContext ? (
      <Suspense fallback={null}>
        <FactorClause context={factorContext} event={e} />
      </Suspense>
    ) : null;

  const hero = !feed
    ? { value: error ? "Not loaded" : "…", note: error ? "The week's releases could not be loaded" : "Loading economic releases…" }
    : {
        value: `${highCount} high-impact ${highCount === 1 ? "release" : "releases"}`,
        note: highCount ? highImpactLine(events) : events.length ? `No high-impact releases · ${plural(events.length, "release")} in all` : "Nothing on the calendar this week",
      };

  return (
    <>
      <PageHead
        crumbs={[{ label: "Calendar" }]}
        asof={feed ? `Updated ${fmtTime(feed.fetchedAt)}` : loading ? "Loading…" : "Not loaded"}
        actions={
          <Button type="button" variant="secondary" disabled={loading} onClick={retry}>
            Refresh now
          </Button>
        }
      />
      <div className="flex items-end gap-10">
        <PageHero label={`Week of ${fmtDayMonth(week[0])}`} value={hero.value} note={hero.note} className="flex-1" />
        <p role="note" className="mb-1 max-w-[320px] text-body">
          <b className={cn("font-semibold", coverage?.status === "verified" ? "text-muted-foreground" : "text-caution-foreground")}>{coverage?.status === "verified" ? "Verified" : "Partial"}</b>{" "}
          <span className="text-ink-3">{coverage ? coverage.message : "Coverage is public agency feeds only; some speakers and smaller releases are missing."}</span>
        </p>
      </div>
      {banner}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-3.5">
        <div role="group" aria-label="Week" className="flex items-center gap-1">
          <Link href={step(-1)} scroll={false} aria-label="Previous week" className="grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-secondary hover:text-foreground">
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-[128px] text-center text-body font-semibold">
            {fmtDayMonth(week[0])} – {fmtDayMonth(week[6])}
          </span>
          <Link href={step(1)} scroll={false} aria-label="Next week" className="grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-secondary hover:text-foreground">
            <ChevronRight className="size-4" />
          </Link>
          {!week.includes(today) && (
            <Link href={base} scroll={false} className="ml-1 rounded-sm text-body font-semibold hover:underline">
              This week
            </Link>
          )}
        </div>
        <span aria-hidden="true" className="h-[18px] w-px bg-border-strong" />
        <FilterChips label="Importance">
          {IMPORTANCE.map((i) => (
            <FilterChip key={i.id} active={importance === i.id} count={searched.filter(i.keep).length} onClick={() => setImportance(i.id)}>
              {i.label}
            </FilterChip>
          ))}
        </FilterChips>
        <span className="flex-1" />
        <label className="flex h-8 w-[260px] items-center gap-2 border-b border-border-strong text-muted-foreground focus-within:text-foreground">
          <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
          <span className="sr-only">Find a release</span>
          <input type="search" placeholder="Find a release or speaker" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground" />
        </label>
      </div>
      <div className="mt-3 empty:hidden">
        <FeedNotice feed={feed} error={error} onRetry={retry} />
      </div>

      <div role="table" aria-label="Economic releases" className="mt-2 text-body">
        <div role="row" className={cn(GRID, "h-[34px] border-b text-caption text-muted-foreground")}>
          <span role="columnheader">When</span>
          <span role="columnheader">Release</span>
          <span role="columnheader">Impact</span>
          <span role="columnheader" className="text-right">
            Previous
          </span>
          <span role="columnheader" className="text-right">
            Consensus
          </span>
          <span role="columnheader" className="text-right">
            Market price
          </span>
          <span role="columnheader">Result</span>
        </div>
        {rows.map((e) => {
          const id = releaseDomId(e);
          const open = openRow === e.id;
          const isNext = next?.id === e.id;
          const res = releaseResult(e, now, today, isNext);
          const m = e.marketImplied;
          return (
            <div key={e.id} id={id} className="scroll-mt-24">
              <div role="row" onClick={() => setOpenRow(open ? null : e.id)} className={cn(GRID, "min-h-11 cursor-pointer border-b border-row py-1 hover:bg-band", (open || isNext) && "bg-band")}>
                <span role="cell" className="flex flex-col">
                  <span className={cn(e.date === today && "font-semibold")}>{e.date === today ? "Today" : fmtDay(e.date)}</span>
                  <span className="text-caption text-muted-foreground" title={e.tentative ? "Tentative" : undefined}>
                    {releaseClock(e)}
                    {e.tentative ? " (tentative)" : ""}
                  </span>
                </span>
                <span role="cell" className="flex min-w-0 flex-col">
                  <button type="button" aria-expanded={open} aria-controls={`${id}-details`} className={cn("truncate rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", e.importance === 3 ? "font-semibold" : "text-ink-3")}>
                    {e.name}
                  </button>
                  {(e.period || e.unit) && <span className="truncate text-caption text-muted-foreground">{[e.period, e.unit].filter(Boolean).join(" · ")}</span>}
                </span>
                <span role="cell" className="text-ink-2">
                  {IMPORTANCE_LABEL[e.importance ?? 0]}
                </span>
                <span role="cell" className="text-right" title={revised(e) ? `Revised from ${e.previousBeforeRevision}` : undefined}>
                  {e.previous ?? "—"}
                  {revised(e) && "*"}
                </span>
                <span role="cell" className="text-right" title={consensusSource(e)}>
                  {e.estimate ?? "—"}
                </span>
                <span role="cell" className="text-right text-ink-2">
                  {m ? (
                    <a href={m.url} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} title={`${m.source}: a prediction-market price, not consensus`} className="hover:underline">
                      {m.value}
                      {m.detail === "median" ? "" : ` (${m.detail})`}
                    </a>
                  ) : (
                    "—"
                  )}
                </span>
                <span role="cell" className={cn("font-semibold", TONE[res.tone])}>
                  {res.text}
                </span>
              </div>
              {open && now !== null && <ReleaseDetails id={`${id}-details`} event={e} now={now} today={today} isNext={isNext} askable={askable} teamSlug={teamSlug} factorLine={factorText(e)} />}
            </div>
          );
        })}
      </div>
      {feed && rows.length === 0 && <p className="border-b border-row py-3 text-body text-muted-foreground">{events.length === 0 ? "Nothing on the calendar this week." : "No release matches. Clear the search or choose All."}</p>}
      {!feed && !error && <p className="border-b border-row py-3 text-body text-muted-foreground">Loading economic releases…</p>}

      {factorContext && now !== null && events.length > 0 && (
        <div className="mt-8">
          <Suspense fallback={null}>
            <BookSensitivity context={factorContext} events={events} now={now} onPick={pick} />
          </Suspense>
        </div>
      )}

      <p className="mt-[18px] max-w-[760px] text-caption text-muted-foreground">
        <b className="font-semibold text-ink-3">About this data.</b> Releases and consensus from {feed ? (feed.sources?.length ? feed.sources.map((s) => s.name).join(", ") : feed.provider) : "the calendar feeds"}, with public agency feeds as fallback; market prices from Kalshi where a contract
        exists. Above and below consensus are shown as facts, not as good or bad for the fund. {feed && <AboutData feed={feed} />}
      </p>
    </>
  );
}
