"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { calendarWeek, rangeDays } from "@/lib/economic-calendar/dates";
import { NY } from "@/lib/providers/calendar";
import type {
  CalendarFeed,
  CalendarRange,
  EconomicEvent,
} from "@/lib/economic-calendar/types";

const inputStyle =
  "h-8 min-w-0 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function EconomicCalendar({
  initialRange,
  preview = false,
  livePreview = false,
}: {
  initialRange: CalendarRange;
  preview?: boolean;
  livePreview?: boolean;
}) {
  const [range, setRange] = useState(initialRange);
  const [feed, setFeed] = useState<CalendarFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [importance, setImportance] = useState("all");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    // Only the first load and an explicit Refresh show the loading state; silent polls do not.
    async function load(visible = false) {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      if (visible) setLoading(true);
      setNow(Date.now());
      try {
        const endpoint =
          preview || livePreview
            ? "/api/dev/economic-calendar"
            : "/api/economic-calendar";
        const res = await fetch(
          `${endpoint}?${new URLSearchParams({ ...range, ...(livePreview ? { live: "1" } : {}) })}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );
        if (res.redirected || res.status === 401)
          throw new Error(
            "Your session has expired. Sign in again to refresh the calendar.",
          );
        const body = await res.json();
        if (!res.ok)
          throw new Error(body.error || "Unable to load the calendar.");
        if (!controller.signal.aborted) {
          setFeed(body);
          setError(null);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Unable to load the calendar.",
          );
      } finally {
        busy = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load(true);
    const timer = window.setInterval(() => void load(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [range, refresh, preview, livePreview]);

  // Never display the previous week's data under the newly selected date header.
  const current =
    feed?.from === range.from && feed?.to === range.to ? feed : null;
  const events = current?.events ?? [];
  const visible = events.filter(
    (event) =>
      (importance === "all" || event.importance === Number(importance)) &&
      `${event.name} ${event.category ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  const days = rangeDays(range);
  const today =
    now === null ? null : DateTime.fromMillis(now, { zone: NY }).toISODate();
  const released = events.filter(
    (e) =>
      e.actual !== null &&
      (now === null || !e.timestamp || Date.parse(e.timestamp) <= now),
  ).length;
  function shift(weeks: number) {
    setRange(
      calendarWeek(DateTime.fromISO(range.from).plus({ weeks }).toISODate()!),
    );
  }

  return (
    <>
      <PageHeader
        title="Economic Calendar"
        description="U.S. releases, surveys and Federal Reserve events. The macro week, in one place."
        actions={
          <Badge variant="outline">
            <CalendarClock className="mr-1 size-3" />
            Eastern time
          </Badge>
        }
      />
      {preview && (
        <div
          role="note"
          className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <strong>Development preview · synthetic data.</strong> Dates and
          values illustrate the interface, not the real economic schedule. Live
          coverage is not verified.
        </div>
      )}
      <Card className="mb-5 gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
              United States · weekly outlook
            </p>
            <h2 className="mt-1 text-base font-semibold">
              {DateTime.fromISO(range.from).toFormat("MMM d")} –{" "}
              {DateTime.fromISO(range.to).toFormat("MMM d, yyyy")}
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" onClick={() => shift(-1)}>
              <ChevronLeft />
              Previous Week
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRange(calendarWeek())}
            >
              Current Week
            </Button>
            <Button variant="outline" size="sm" onClick={() => shift(1)}>
              Next Week
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Week containing
            <input
              type="date"
              aria-label="Week containing"
              className={inputStyle}
              value={range.from}
              onChange={(e) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))
                  setRange(calendarWeek(e.target.value));
              }}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Importance
            <select
              aria-label="Importance"
              className={inputStyle}
              value={importance}
              onChange={(e) => setImportance(e.target.value)}
            >
              <option value="all">All importance</option>
              <option value="3">High</option>
              <option value="2">Medium</option>
              <option value="1">Low</option>
            </select>
          </label>
          <label className="grid min-w-0 flex-1 basis-full gap-1 text-xs text-muted-foreground sm:basis-48">
            Find an event
            <input
              type="search"
              placeholder="Search releases or speakers…"
              aria-label="Find an event"
              className={`${inputStyle} w-full`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => setRefresh((n) => n + 1)}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
        <div
          className="flex flex-wrap gap-x-5 gap-y-1 border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <span>
            <strong className="tnum text-foreground">
              {current ? events.length : "—"}
            </strong>{" "}
            events
          </span>
          <span>
            <strong className="tnum text-foreground">
              {current ? released : "—"}
            </strong>{" "}
            with actuals
          </span>
          <span>
            <strong className="tnum text-foreground">
              {current ? events.filter((e) => e.importance === 3).length : "—"}
            </strong>{" "}
            high importance
          </span>
          <span className="sm:ml-auto">
            {current
              ? `${current.mode === "demo" ? "Synthetic preview" : current.provider} · updated ${DateTime.fromISO(current.fetchedAt).setZone(NY).toFormat("h:mm:ss a")} ET`
              : "Waiting for feed"}
          </span>
        </div>
      </Card>
      {livePreview && (
        <p role="note" className="mb-4 text-sm text-muted-foreground">
          Local verification view · live public feeds · app authentication
          remains required on the main route.
        </p>
      )}
      {current?.coverage?.status === "partial" && (
        <div
          role="note"
          className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <strong>Coverage incomplete.</strong> {current.coverage.message}
        </div>
      )}
      {current?.sources && (
        <details className="mb-4 rounded-lg border px-4 py-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">
            Data sources ·{" "}
            {current.sources.filter((s) => s.status === "ok").length} of{" "}
            {current.sources.length} connected
          </summary>
          <ul className="mt-2 space-y-1">
            {current.sources.map((s) => (
              <li key={s.name}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {s.name}
                </a>
                :{" "}
                {s.status === "ok"
                  ? `${s.count} records in this range`
                  : `unavailable (${s.error})`}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Data:{" "}
            <a
              href="https://xoomar.com/markets/api/calendar"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              XOOMAR
            </a>{" "}
            and linked U.S. agencies. Units are shown with each source. Separate
            measurements of one report can appear as separate records. Estimates
            remain unavailable until a reliable consensus feed is connected.
          </p>
        </details>
      )}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
        >
          <p className="font-medium">
            {current
              ? "Refresh failed · showing last received data"
              : "Calendar unavailable"}
          </p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setRefresh((n) => n + 1)}
          >
            Try again
          </Button>
        </div>
      )}
      {!current && loading && (
        <div
          role="status"
          className="rounded-xl border p-8 text-center text-sm text-muted-foreground"
        >
          Loading the economic calendar…
        </div>
      )}
      {current && (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Showing {visible.length} of {events.length} events · All times ET ·
            Checks every minute · Sources cached for 5 minutes
          </p>
          <div className="space-y-4">
            {days.map((day) => {
              const rows = visible.filter((e) => e.date === day);
              return (
                <section
                  key={day}
                  aria-label={DateTime.fromISO(day).toFormat("EEEE, MMMM d")}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                      {DateTime.fromISO(day).toFormat("EEEE, MMM d")}
                    </h3>
                    {day === today && <Badge variant="secondary">Today</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {rows.length} events
                    </span>
                  </div>
                  <Card className="gap-0 overflow-hidden p-0">
                    {rows.length === 0 ? (
                      <p className="px-4 py-5 text-xs text-muted-foreground">
                        {events.some((e) => e.date === day)
                          ? "No events match your filters."
                          : "No events returned by connected sources. Coverage may be incomplete."}
                      </p>
                    ) : (
                      <>
                        <div className="hidden md:block">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30 hover:bg-muted/30">
                                <TableHead className="w-28 pl-4">
                                  Time (ET)
                                </TableHead>
                                <TableHead>Event</TableHead>
                                <TableHead className="w-20">Period</TableHead>
                                <TableHead className="w-24 text-right">
                                  Actual
                                </TableHead>
                                <TableHead className="w-24 text-right">
                                  Estimate
                                </TableHead>
                                <TableHead className="w-24 pr-4 text-right">
                                  Previous
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rows.map((e) => (
                                <TableRow
                                  key={e.id}
                                  className={
                                    e.importance === 3
                                      ? "bg-primary/[0.025]"
                                      : ""
                                  }
                                >
                                  <TableCell className="pl-4 align-top text-xs text-muted-foreground">
                                    <span className="tnum">{e.time}</span>
                                    {e.tentative && (
                                      <span className="block text-[10px]">
                                        Tentative
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="max-w-80 whitespace-normal">
                                    <EventName event={e} />
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {e.period ?? "—"}
                                  </TableCell>
                                  <TableCell className="tnum text-right font-semibold">
                                    <Actual event={e} now={now} />
                                  </TableCell>
                                  <TableCell className="tnum text-right">
                                    {e.estimate ?? "—"}
                                  </TableCell>
                                  <TableCell className="tnum pr-4 text-right text-muted-foreground">
                                    <Previous event={e} />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="divide-y md:hidden">
                          {rows.map((e) => (
                            <article key={e.id} className="px-4 py-3">
                              <div className="mb-2 flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
                                <span>
                                  {e.time}
                                  {e.tentative ? " · tentative" : ""}
                                </span>
                                <span>Period: {e.period ?? "—"}</span>
                              </div>
                              <EventName event={e} />
                              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                                <div>
                                  <dt className="text-[10px] text-muted-foreground">
                                    Actual
                                  </dt>
                                  <dd className="tnum font-semibold">
                                    <Actual event={e} now={now} />
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[10px] text-muted-foreground">
                                    Estimate
                                  </dt>
                                  <dd className="tnum">{e.estimate ?? "—"}</dd>
                                </div>
                                <div>
                                  <dt className="text-[10px] text-muted-foreground">
                                    Previous
                                  </dt>
                                  <dd className="tnum text-muted-foreground">
                                    <Previous event={e} />
                                  </dd>
                                </div>
                              </dl>
                            </article>
                          ))}
                        </div>
                      </>
                    )}
                  </Card>
                </section>
              );
            })}
          </div>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Estimate is economist consensus, where supplied. Public agency feeds
            do not supply consensus; no forecasts are inferred. — means
            unavailable or not applicable; a past time alone does not confirm a
            release. Previous includes provider revisions. Values are shown
            neutrally: higher does not always mean better. Release updates
            depend on provider timing.
          </p>
        </>
      )}
    </>
  );
}
function EventName({ event: e }: { event: EconomicEvent }) {
  return (
    <div>
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 size-1.5 shrink-0 rounded-full ${e.importance === 3 ? "bg-primary" : "bg-muted-foreground/30"}`}
          title={
            e.importance
              ? `${["", "Low", "Medium", "High"][e.importance]} importance`
              : "Importance unavailable"
          }
        />
        <span className={e.importance === 3 ? "font-semibold" : "font-medium"}>
          {e.name}
        </span>
        {e.importance === 3 && <span className="sr-only">High importance</span>}
      </div>
      {(e.source || e.unit) && (
        <p className="mt-0.5 pl-3.5 text-[10px] text-muted-foreground">
          {e.unit ? `${e.unit} · ` : ""}
          {e.source}
        </p>
      )}
    </div>
  );
}
function Actual({ event, now }: { event: EconomicEvent; now: number | null }) {
  return (
    <>
      {now !== null &&
      event.timestamp !== null &&
      Date.parse(event.timestamp) > now
        ? "—"
        : (event.actual ?? "—")}
    </>
  );
}
function Previous({ event }: { event: EconomicEvent }) {
  return (
    <>
      {event.previous ?? "—"}
      {event.previousBeforeRevision !== null &&
        event.previousBeforeRevision !== event.previous && (
          <span
            className="block text-[10px] font-normal"
            title="Value before the provider revised it"
          >
            was {event.previousBeforeRevision}
          </span>
        )}
    </>
  );
}
