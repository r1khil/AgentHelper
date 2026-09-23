"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { leaveHootQuestion } from "@/components/app/hoot/handoff";
import { pageContextFor } from "@/components/app/hoot/page-context";
import { startHootChat } from "@/lib/actions/chats";
import { calendarWeek, rangeDays } from "@/lib/economic-calendar/dates";
import {
  daySummary,
  isAhead,
  isReleased,
  isUpcoming,
  nextRelease,
  rangeLabel,
  shownActual,
  surprise,
  todayIn,
  untilText,
} from "@/lib/economic-calendar/view";
import { NY } from "@/lib/providers/calendar";
import { cn } from "@/lib/utils";
import type {
  CalendarFeed,
  CalendarRange,
  EconomicEvent,
} from "@/lib/economic-calendar/types";

type Importance = "all" | "high" | "med";
type LoadError = { message: string; expired: boolean };

const IMPORTANCE: {
  id: Importance;
  label: string;
  keep: (e: EconomicEvent) => boolean;
}[] = [
  { id: "all", label: "All", keep: () => true },
  { id: "high", label: "High", keep: (e) => e.importance === 3 },
  { id: "med", label: "Medium+", keep: (e) => (e.importance ?? 0) >= 2 },
];
const IMPORTANCE_LABEL = ["Not rated", "Low", "Medium", "High"];

// Time, event, period, actual, consensus, previous, vs. consensus. Below xl each event stacks instead.
const COLUMNS =
  "xl:grid-cols-[5.75rem_minmax(0,1fr)_6.5rem_6rem_6.5rem_8rem_9.25rem]";
const eyebrow =
  "text-xs font-semibold tracking-wider text-muted-foreground uppercase";
const et = (iso: string) => DateTime.fromISO(iso).setZone(NY);
const consensusSource = (e: EconomicEvent) =>
  e.estimate && e.estimateSource
    ? `Consensus from ${e.estimateSource}`
    : undefined;
const marketText = (e: EconomicEvent) =>
  e.marketImplied &&
  `${e.marketImplied.source}\u00a0${e.marketImplied.value}${e.marketImplied.detail === "median" ? "" : ` (${e.marketImplied.detail})`}`;

/** A prediction market's price for a release, set apart from consensus: it isn't a survey. */
function MarketPrice({ e, className }: { e: EconomicEvent; className?: string }) {
  const m = e.marketImplied;
  if (!m) return null;
  return (
    <a
      href={m.url}
      target="_blank"
      rel="noreferrer"
      className={cn("tnum text-muted-foreground hover:underline", className)}
      title={`${m.source} prediction-market price (${m.detail === "median" ? "median outcome" : `likeliest outcome, ${m.detail}`}), not an economist survey`}
    >
      {marketText(e)}
    </a>
  );
}

export function EconomicCalendar({
  initialRange,
  teamSlug = null,
  preview = false,
  livePreview = false,
}: {
  initialRange: CalendarRange;
  teamSlug?: string | null;
  preview?: boolean;
  livePreview?: boolean;
}) {
  const pathname = usePathname();
  const [range, setRange] = useState(initialRange);
  const [feed, setFeed] = useState<CalendarFeed | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [importance, setImportance] = useState<Importance>("all");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

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
        if (res.redirected || res.status === 401) {
          if (!controller.signal.aborted)
            setError({
              message:
                "Your session expired, so the calendar stopped updating.",
              expired: true,
            });
          return;
        }
        const body = await res.json();
        if (!res.ok)
          throw new Error(body.error || "Unable to load the calendar.");
        if (!controller.signal.aborted) {
          setFeed(body);
          setError(null);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError({
            message:
              e instanceof Error ? e.message : "Unable to load the calendar.",
            expired: false,
          });
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

  // Countdowns and the "now" line move between polls.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Never display the previous week's data under the newly selected dates.
  const current =
    feed?.from === range.from && feed?.to === range.to ? feed : null;
  const events = current?.events ?? [];
  const today = now === null ? null : todayIn(now);
  const thisWeek = today !== null && today >= range.from && today <= range.to;
  const q = search.toLowerCase().trim();
  const keep = IMPORTANCE.find((i) => i.id === importance)!.keep;
  const visible = events.filter(
    (e) =>
      keep(e) &&
      `${e.name} ${e.category ?? ""} ${e.source ?? ""}`
        .toLowerCase()
        .includes(q),
  );
  const days = rangeDays(range);
  const weekday = (d: string) => DateTime.fromISO(d).weekday <= 5;
  // Weekend days only get a section when the feed lists something on them.
  const listed = days.filter(
    (d) => weekday(d) || events.some((e) => e.date === d),
  );
  const next = now === null ? null : nextRelease(events, now);
  const ahead =
    now === null || today === null
      ? []
      : events.filter((e) => e.importance === 3 && isAhead(e, now, today));
  const retry = () => setRefresh((n) => n + 1);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          Economic Calendar
        </h1>
        <WeekControls range={range} thisWeek={thisWeek} onChange={setRange} />
      </div>
      {preview && (
        <div
          role="note"
          className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground"
        >
          <strong>Development preview · synthetic data.</strong> Dates and
          values illustrate the interface, not the real economic schedule. Live
          coverage is not verified.
        </div>
      )}
      {livePreview && (
        <p role="note" className="mb-4 text-sm text-muted-foreground">
          Local verification view · live calendar feed · app authentication
          remains required on the main route.
        </p>
      )}
      {error?.expired && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3"
        >
          <Lock className="size-4 shrink-0 text-warning-foreground" />
          <p className="min-w-0 flex-1 text-[13px] leading-5 text-warning-foreground">
            {error.message}
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(pathname)}`}
            className={buttonVariants({ size: "sm" })}
          >
            Sign in again
          </Link>
        </div>
      )}
      {!current &&
        (error ? (
          !error.expired && (
            <div role="alert" className="rounded-xl border p-6">
              <p className="font-medium">Calendar unavailable</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error.message}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={retry}
              >
                Try again
              </Button>
            </div>
          )
        ) : (
          <LoadingState />
        ))}
      {current && now !== null && today !== null && (
        <>
          <WeekStrip
            days={days}
            events={events}
            now={now}
            today={today}
            onPick={(day) => setOpen((o) => ({ ...o, [day]: true }))}
          />
          {(next || ahead.length > 0) && (
            <section
              aria-label="Coming up"
              className="mb-5 grid gap-4 lg:grid-cols-2"
            >
              {next && (
                <NextRelease
                  event={next}
                  now={now}
                  today={today}
                  teamSlug={teamSlug}
                  askable={!preview && !livePreview}
                />
              )}
              <Ahead
                events={ahead}
                today={today}
                thisWeek={thisWeek}
                className={next ? "hidden lg:flex" : "flex"}
              />
            </section>
          )}
          {current.coverage?.status === "partial" && (
            <div
              role="note"
              className="mb-3 flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] leading-5 text-warning-foreground"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                <strong className="font-semibold">Coverage incomplete.</strong>{" "}
                {current.coverage.message}
              </p>
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex w-full flex-wrap items-center gap-2.5 sm:gap-3 lg:w-auto">
              <fieldset className="grid w-full min-w-0 grid-cols-3 gap-0.5 rounded-[10px] bg-muted p-[3px] sm:flex sm:w-auto">
                <legend className="sr-only">Importance</legend>
                {IMPORTANCE.map((option) => {
                  const on = option.id === importance;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setImportance(option.id)}
                      className={cn(
                        "inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-[30px]",
                        on
                          ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/5"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {option.label}
                      <span className="tnum text-xs text-muted-foreground">
                        {events.filter(option.keep).length}
                      </span>
                    </button>
                  );
                })}
              </fieldset>
              <label className="flex h-11 w-full items-center gap-2 rounded-lg border bg-background px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring sm:h-9 sm:w-72">
                <Search className="size-4 shrink-0" />
                <span className="sr-only">Find an event</span>
                <input
                  type="search"
                  placeholder="Find a release or speaker"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
              <span className="tnum" aria-live="polite">
                Showing {visible.length} of {events.length}
              </span>
              <span
                aria-hidden="true"
                className="hidden h-4 w-px bg-border sm:block"
              />
              {error ? (
                <span
                  className="tnum inline-flex items-center gap-1.5 text-warning-foreground"
                  title={error.message}
                >
                  <span
                    aria-hidden="true"
                    className="size-[7px] rounded-full bg-warning"
                  />
                  Couldn&apos;t refresh · showing{" "}
                  {et(current.fetchedAt).toFormat("h:mm a")} data
                </span>
              ) : (
                <span
                  className="tnum inline-flex items-center gap-1.5"
                  title={current.provider}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-[7px] rounded-full",
                      current.mode === "demo" ? "bg-warning" : "bg-up",
                    )}
                  />
                  {current.mode === "demo" ? "Synthetic preview" : "Live"} ·
                  updated {et(current.fetchedAt).toFormat("h:mm a")}
                </span>
              )}
              {error && !error.expired ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={retry}
                >
                  Try again
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Refresh now"
                  disabled={loading}
                  onClick={retry}
                >
                  <RefreshCw
                    className={cn("size-3.5", loading && "animate-spin")}
                  />
                </Button>
              )}
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div
              className={cn(
                "hidden h-10 items-center gap-4 bg-muted/40 px-5 text-xs font-medium text-muted-foreground xl:grid",
                COLUMNS,
              )}
            >
              <span>Time</span>
              <span>Event</span>
              <span>Period</span>
              <span className="text-right">Actual</span>
              <span className="text-right">Consensus</span>
              <span className="text-right">Previous</span>
              <span className="text-right">vs. consensus</span>
            </div>
            {listed.map((day) => {
              const rows = visible.filter((e) => e.date === day);
              // In the current week, days already over fold into one line; a search opens everything.
              const collapsible = thisWeek && day < today && rows.length > 0;
              return (
                <Day
                  key={day}
                  day={day}
                  all={events.filter((e) => e.date === day)}
                  rows={rows}
                  now={now}
                  today={today}
                  nextId={next?.id ?? null}
                  collapsible={collapsible}
                  expanded={!collapsible || !!open[day] || q !== ""}
                  onToggle={() => setOpen((o) => ({ ...o, [day]: !o[day] }))}
                />
              );
            })}
          </div>
          <footer className="mt-5 flex flex-col gap-3">
            {current.sources?.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn(eyebrow, "mr-1")}>
                  Sources ·{" "}
                  {current.sources.filter((s) => s.status === "ok").length} of{" "}
                  {current.sources.length} connected
                </span>
                {current.sources.map((s) => {
                  const ok = s.status === "ok";
                  return (
                    <a
                      key={s.name}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      title={
                        ok
                          ? `${s.count} records in this range`
                          : `Unavailable: ${s.error ?? "no response"}`
                      }
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                        ok
                          ? "text-foreground/80 hover:bg-muted"
                          : "border-warning/40 bg-warning/10 text-warning-foreground",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1.5 rounded-full",
                          ok ? "bg-up" : "bg-warning",
                        )}
                      />
                      {s.name}
                      <span
                        className={cn("tnum", ok && "text-muted-foreground")}
                      >
                        {ok ? s.count : "unavailable"}
                      </span>
                    </a>
                  );
                })}
              </div>
            ) : null}
            <p className="max-w-3xl text-xs leading-[18px] text-muted-foreground">
              All times Eastern. Consensus is the economist survey from the
              feed in use, filled from FXStreet where the feed has none; model
              forecasts are never substituted. Hover a consensus to see its
              source. Kalshi figures are prediction-market prices before a
              release (the median outcome, or the likeliest for Fed decisions),
              not consensus, and never drive the colors. Blue and orange show direction
              against consensus, not whether a print is good or bad. Previous
              includes provider revisions, and a past time alone does not
              confirm a release. Separate measurements of one report can appear
              as separate records. Checked every minute; provider caching
              applies. Data:{" "}
              <a
                href="https://xoomar.com/markets/api/calendar"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                XOOMAR
              </a>{" "}
              and linked U.S. agencies.
            </p>
          </footer>
        </>
      )}
    </>
  );
}

function WeekControls({
  range,
  thisWeek,
  onChange,
}: {
  range: CalendarRange;
  thisWeek: boolean;
  onChange: (range: CalendarRange) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const shift = (weeks: number) =>
    onChange(
      calendarWeek(DateTime.fromISO(range.from).plus({ weeks }).toISODate()!),
    );
  const step =
    "grid h-full w-11 shrink-0 place-items-center outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:w-9";
  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <div className="flex h-11 min-w-0 flex-1 items-center rounded-lg border bg-background sm:h-9 sm:flex-none">
        <button
          type="button"
          aria-label="Previous week"
          onClick={() => shift(-1)}
          className={cn(step, "rounded-l-lg border-r")}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="tnum min-w-0 flex-1 truncate px-3 text-center text-sm font-semibold">
          {rangeLabel(range)}
        </span>
        <button
          type="button"
          aria-label="Next week"
          onClick={() => shift(1)}
          className={cn(step, "rounded-r-lg border-l")}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <Button
        variant="outline"
        size="lg"
        disabled={thisWeek}
        onClick={() => onChange(calendarWeek())}
        className={cn("h-11 sm:h-9", thisWeek && "hidden sm:inline-flex")}
      >
        This week
      </Button>
      <span className="relative shrink-0">
        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Jump to a week"
          className="size-11 sm:size-9"
          onClick={() => {
            const el = picker.current;
            if (!el) return;
            try {
              el.showPicker();
            } catch {
              el.focus();
            }
          }}
        >
          <CalendarDays />
        </Button>
        {/* The native picker opens from the button, anchored where it sits. */}
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0"
          value={range.from}
          onChange={(e) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))
              onChange(calendarWeek(e.target.value));
          }}
        />
      </span>
    </div>
  );
}

function WeekStrip({
  days,
  events,
  now,
  today,
  onPick,
}: {
  days: string[];
  events: EconomicEvent[];
  now: number;
  today: string;
  onPick: (day: string) => void;
}) {
  const weekend = days.filter((d) => DateTime.fromISO(d).weekday > 5);
  const weekendEvents = events.filter((e) => weekend.includes(e.date));
  const weekendFirst = weekendEvents[0]?.date;
  const weekendBody = (
    <>
      <span className="text-xs font-semibold tracking-wide uppercase">
        Sat–Sun
      </span>
      <span className="tnum text-[22px] leading-[26px] font-semibold">
        {weekend.map((d) => DateTime.fromISO(d).day).join("–")}
      </span>
      <span className="text-xs">
        {weekendEvents.length
          ? `${weekendEvents.length} ${weekendEvents.length === 1 ? "event" : "events"}`
          : "No events listed"}
      </span>
    </>
  );
  return (
    <nav
      aria-label="Days this week"
      className="mb-5 grid grid-cols-5 gap-1.5 lg:grid-cols-[repeat(5,minmax(0,1fr))_8.5rem] lg:gap-2"
    >
      {days
        .filter((d) => !weekend.includes(d))
        .map((day) => {
          const all = events.filter((e) => e.date === day);
          const date = DateTime.fromISO(day);
          const isToday = day === today;
          const past = day < today;
          const high = all.filter((e) => e.importance === 3).length;
          const lead = [...all].sort(
            (a, b) => (b.importance ?? 0) - (a.importance ?? 0),
          )[0];
          return (
            <a
              key={day}
              href={`#day-${day}`}
              aria-current={isToday ? "date" : undefined}
              onClick={() => onPick(day)}
              className={cn(
                "flex min-h-[76px] min-w-0 flex-col justify-center gap-1 rounded-xl border bg-card p-2 text-foreground transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring lg:justify-start lg:gap-3 lg:p-3.5",
                past && "bg-muted/40",
                isToday &&
                  "border-foreground ring-1 ring-foreground ring-inset",
              )}
            >
              <div className="flex items-center justify-center gap-2 lg:justify-between">
                <div className="flex flex-col items-center gap-0.5 lg:flex-row lg:items-baseline lg:gap-1.5">
                  <span
                    className={cn(
                      "text-[11px] font-semibold tracking-wide uppercase lg:text-xs",
                      isToday ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {date.toFormat("ccc")}
                  </span>
                  <span className="tnum text-lg leading-5 font-semibold lg:text-[22px] lg:leading-[26px]">
                    {date.day}
                  </span>
                </div>
                {isToday && (
                  <span className="hidden rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold text-background lg:inline">
                    Today
                  </span>
                )}
                {past && all.length > 0 && (
                  <span className="hidden items-center gap-1 text-xs text-muted-foreground lg:inline-flex">
                    <Check className="size-3" />
                    Released
                  </span>
                )}
              </div>
              <div className="hidden min-w-0 flex-col gap-0.5 lg:flex">
                <span className="truncate text-[13px] font-medium">
                  {lead?.name ?? "No events listed"}
                </span>
                <span className="tnum text-xs text-muted-foreground">
                  {isToday
                    ? `${all.filter((e) => isReleased(e, now)).length} of ${all.length} released`
                    : `${all.length} ${all.length === 1 ? "event" : "events"}${high ? ` · ${high} high` : ""}`}
                </span>
              </div>
            </a>
          );
        })}
      {weekend.length > 0 &&
        (weekendFirst ? (
          <a
            href={`#day-${weekendFirst}`}
            className="hidden flex-col gap-3 rounded-xl border bg-card p-3.5 text-muted-foreground transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring lg:flex"
          >
            {weekendBody}
          </a>
        ) : (
          <div className="hidden flex-col gap-3 rounded-xl border border-dashed p-3.5 text-muted-foreground lg:flex">
            {weekendBody}
          </div>
        ))}
    </nav>
  );
}

function NextRelease({
  event: e,
  now,
  today,
  teamSlug,
  askable,
}: {
  event: EconomicEvent;
  now: number;
  today: string;
  teamSlug: string | null;
  askable: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [asking, setAsking] = useState(false);
  const at = et(e.timestamp!);
  const when =
    e.date === today ? at.toFormat("h:mm a") : at.toFormat("ccc h:mm a");
  const sub = [e.period, e.unit, e.source].filter(Boolean).join(" · ");
  const revised =
    e.previousBeforeRevision !== null &&
    e.previousBeforeRevision !== e.previous;

  const ask = async () => {
    setAsking(true);
    try {
      const res = await startHootChat({ teamSlug, ticker: null });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      const question = `What should we watch in ${e.name}${e.period ? ` (${e.period})` : ""}, due ${at.toFormat("cccc h:mm a")} ET? Consensus is ${e.estimate ?? "not available"} and the previous reading was ${e.previous ?? "not available"}.${e.marketImplied ? ` ${e.marketImplied.source} traders price ${e.marketImplied.detail === "median" ? `a median of ${e.marketImplied.value}` : `${e.marketImplied.value} (${e.marketImplied.detail})`}.` : ""} Which of our holdings are most exposed to a surprise either way?`;
      if (!leaveHootQuestion(res.chatId, question, pageContextFor(pathname)))
        toast("Your chat is open. Paste your question to send it.");
      router.push(res.href);
    } catch {
      toast.error("Couldn't open a chat just now. Try again in a moment.");
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 lg:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className={cn(eyebrow, "flex items-center gap-1.5")}>
          <Clock className="size-3.5" />
          Next release
        </h2>
        <span className="tnum rounded-full bg-foreground/[0.07] px-2.5 py-1 text-xs font-semibold lg:text-[13px]">
          {untilText(at.toMillis() - now)} · {when}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xl leading-7 font-semibold tracking-tight lg:text-2xl lg:leading-[30px]">
          {e.name}
        </p>
        {sub && <p className="text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      <dl className="grid grid-cols-3 gap-4 border-t border-border/60 pt-4">
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Consensus</dt>
          <dd
            className="tnum text-lg leading-6 font-semibold lg:text-xl"
            title={consensusSource(e)}
          >
            {e.estimate ?? "—"}
          </dd>
          <MarketPrice e={e} className="text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Previous</dt>
          <dd className="flex flex-col gap-x-1.5 lg:flex-row lg:items-baseline">
            <span className="tnum text-lg leading-6 font-semibold text-foreground/80 lg:text-xl">
              {e.previous ?? "—"}
            </span>
            {revised && (
              <span
                className="tnum text-xs text-muted-foreground"
                title="Value before the provider revised it"
              >
                rev. from {e.previousBeforeRevision}
              </span>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Importance</dt>
          <dd className="flex h-6 items-center gap-2">
            <Meter importance={e.importance} />
            <span className="text-sm font-medium">
              {IMPORTANCE_LABEL[e.importance ?? 0]}
            </span>
          </dd>
        </div>
      </dl>
      {askable && (
        <div>
          <Button
            variant="outline"
            size="lg"
            disabled={asking}
            onClick={() => void ask()}
            className="h-11 w-full pl-2 sm:h-9 sm:w-auto"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hoot/mark.webp"
              alt=""
              width={20}
              height={20}
              className="size-5 object-contain"
            />
            {asking ? "Opening Hoot…" : "Ask Hoot what to watch"}
          </Button>
        </div>
      )}
    </div>
  );
}

function Ahead({
  events,
  today,
  thisWeek,
  className,
}: {
  events: EconomicEvent[];
  today: string;
  thisWeek: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("flex-col gap-2 rounded-xl border bg-card p-5", className)}
    >
      <div className="flex items-center justify-between gap-3 pb-1">
        <h2 className={eyebrow}>High importance ahead</h2>
        <span className="tnum text-xs text-muted-foreground">
          {events.length} {thisWeek ? "left this week" : "this week"}
        </span>
      </div>
      {events.length ? (
        <ol className="flex flex-col">
          {events.slice(0, 5).map((e) => (
            <li
              key={e.id}
              className="grid min-h-[42px] grid-cols-[6.25rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/60"
            >
              <span className="tnum text-[13px] text-muted-foreground">
                {e.date === today
                  ? "Today"
                  : DateTime.fromISO(e.date).toFormat("ccc")}{" "}
                {e.time}
              </span>
              <span className="truncate text-sm font-medium">{e.name}</span>
              <span className="tnum text-[13px] text-foreground/75">
                {e.estimate
                  ? `Cons. ${e.estimate}`
                  : (marketText(e) ??
                    (e.previous ? "No consensus" : ""))}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="border-t border-border/60 pt-3 text-sm text-muted-foreground">
          No high-importance releases left this week.
        </p>
      )}
      {events.length > 5 && (
        <p className="text-xs text-muted-foreground">
          {events.length - 5} more in the list below
        </p>
      )}
    </div>
  );
}

function Day({
  day,
  all,
  rows,
  now,
  today,
  nextId,
  collapsible,
  expanded,
  onToggle,
}: {
  day: string;
  all: EconomicEvent[];
  rows: EconomicEvent[];
  now: number;
  today: string;
  nextId: string | null;
  collapsible: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isToday = day === today;
  const past = day < today;
  const collapsed = collapsible && !expanded;
  const released = rows.filter((e) => isReleased(e, now)).length;
  let count = !all.length
    ? "No events listed"
    : rows.length
      ? `${rows.length} ${rows.length === 1 ? "event" : "events"}`
      : "No matching events";
  if (rows.length && past && released === rows.length)
    count += " · all released";
  if (rows.length && isToday) count += ` · ${released} released so far`;
  // The "now" line sits before today's first event still to come, or after the last one.
  const firstAhead = rows.findIndex((e) => isUpcoming(e, now));
  const nowAt = !isToday ? -1 : firstAhead === -1 ? rows.length : firstAhead;

  return (
    <section
      id={`day-${day}`}
      aria-labelledby={`day-${day}-title`}
      className="scroll-mt-6 border-t first-of-type:border-t-0 xl:first-of-type:border-t"
    >
      <div
        className={cn(
          "flex min-h-12 items-center gap-3 py-1.5 pr-1.5 pl-4 xl:py-2 xl:pr-5 xl:pl-5",
          past && "bg-muted/40",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 xl:flex-row xl:items-center xl:gap-3">
          <div className="flex items-center gap-2">
            <h3
              id={`day-${day}-title`}
              className="text-sm font-semibold whitespace-nowrap"
            >
              {DateTime.fromISO(day).toFormat("EEEE, MMM d")}
            </h3>
            {isToday && (
              <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background xl:text-xs">
                Today
              </span>
            )}
          </div>
          <span className="tnum text-xs whitespace-nowrap text-muted-foreground xl:text-[13px]">
            {count}
          </span>
          {collapsed && (
            <span className="min-w-0 truncate text-xs text-foreground/75 xl:flex-1 xl:text-[13px]">
              {daySummary(rows, now)}
            </span>
          )}
        </div>
        {collapsible && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggle}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring xl:h-[30px] xl:border xl:bg-background"
          >
            {expanded ? "Hide" : `Show ${rows.length}`}
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
      {!collapsed &&
        (rows.length ? (
          <div>
            {rows.map((e, i) => (
              <Fragment key={e.id}>
                {i === nowAt && <NowLine now={now} />}
                <EventRow
                  event={e}
                  now={now}
                  today={today}
                  isNext={e.id === nextId}
                />
              </Fragment>
            ))}
            {nowAt === rows.length && <NowLine now={now} />}
          </div>
        ) : (
          <p className="border-t border-border/60 px-4 py-3.5 text-[13px] text-muted-foreground xl:px-5">
            {all.length
              ? "No events match your filters on this day."
              : "No events listed for this day. Coverage may be incomplete."}
          </p>
        ))}
    </section>
  );
}

function NowLine({ now }: { now: number }) {
  return (
    <div className="flex h-6 items-center gap-2.5 border-t border-border/60 px-4 xl:px-5">
      <span className="tnum rounded-full bg-foreground px-2 py-px text-[11px] font-semibold text-background">
        Now · {DateTime.fromMillis(now, { zone: NY }).toFormat("h:mm a")}
      </span>
      <span
        aria-hidden="true"
        className="h-0.5 flex-1 rounded-full bg-foreground"
      />
    </div>
  );
}

function EventRow({
  event: e,
  now,
  today,
  isNext,
}: {
  event: EconomicEvent;
  now: number;
  today: string;
  isNext: boolean;
}) {
  const actual = shownActual(e, now);
  const done =
    e.date < today ||
    actual !== null ||
    (e.timestamp !== null && !isUpcoming(e, now));
  const meta = [e.unit, e.source].filter(Boolean).join(" · ");
  const revised =
    e.previousBeforeRevision !== null &&
    e.previousBeforeRevision !== e.previous;
  // The phone layout folds consensus and previous into one line under the name; it wraps only between values.
  const parts = [
    e.estimate && `Cons\u00a0${e.estimate}`,
    actual === null && marketText(e),
    actual === null && e.previous && `Prev\u00a0${e.previous}`,
  ].filter(Boolean);
  if (!parts.length && actual !== null) parts.push("No consensus");
  if (!parts.length && meta) parts.push(meta);
  const detail = (actual !== null ? " · " : "") + parts.join(" · ");
  const time = (
    <div className="flex flex-col pt-px xl:pt-0">
      <span
        className={cn(
          "tnum text-[13px] whitespace-nowrap",
          done ? "text-muted-foreground" : "text-foreground/85",
        )}
      >
        {e.time}
      </span>
      {e.tentative && (
        <span className="text-[11px] text-muted-foreground">Tentative</span>
      )}
    </div>
  );
  const name = (
    <p
      className={cn(
        "text-sm leading-[18px]",
        e.importance === 3 ? "font-semibold" : "font-medium",
      )}
    >
      {e.name}
      <span className="sr-only">
        , {IMPORTANCE_LABEL[e.importance ?? 0].toLowerCase()} importance
      </span>
    </p>
  );

  return (
    <div
      className={cn(
        "border-t border-border/60",
        isNext && "bg-foreground/[0.04]",
      )}
    >
      <div
        className={cn(
          "hidden min-h-14 items-center gap-4 px-5 py-2 xl:grid",
          COLUMNS,
        )}
      >
        {time}
        <div className="flex min-w-0 items-center gap-2.5">
          <Meter importance={e.importance} />
          <div className="min-w-0">
            {name}
            {meta && (
              <p className="truncate text-xs text-muted-foreground">{meta}</p>
            )}
          </div>
        </div>
        <span
          className={cn(
            "text-[13px]",
            e.period ? "text-foreground/70" : "text-muted-foreground",
          )}
        >
          {e.period ?? "—"}
        </span>
        <span
          className={cn(
            "tnum text-right text-sm",
            actual === null
              ? "text-muted-foreground"
              : "font-semibold text-foreground",
          )}
        >
          {actual ?? "—"}
        </span>
        <div className="flex flex-col items-end">
          <span
            className={cn(
              "tnum text-right text-sm",
              e.estimate ? "text-foreground/90" : "text-muted-foreground",
            )}
            title={consensusSource(e)}
          >
            {e.estimate ?? "—"}
          </span>
          {actual === null && <MarketPrice e={e} className="text-[11px]" />}
        </div>
        <div className="flex flex-col items-end">
          <span
            className={cn(
              "tnum text-sm",
              e.previous ? "text-foreground/70" : "text-muted-foreground",
            )}
          >
            {e.previous ?? "—"}
          </span>
          {revised && (
            <span
              className="tnum text-[11px] text-muted-foreground"
              title="Value before the provider revised it"
            >
              rev. from {e.previousBeforeRevision}
            </span>
          )}
        </div>
        <div className="flex justify-end">
          <Status
            event={e}
            actual={actual}
            now={now}
            today={today}
            isNext={isNext}
          />
        </div>
      </div>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2.5 px-4 py-3 xl:hidden">
        {time}
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <Meter importance={e.importance} className="mt-[3px]" />
            {name}
          </div>
          <div className="flex items-center justify-between gap-2 pl-[15px]">
            <span className="tnum min-w-0 text-xs text-foreground/70">
              {actual !== null && (
                <strong className="font-semibold text-foreground">
                  Actual&nbsp;{actual}
                </strong>
              )}
              {detail}
            </span>
            <Status
              event={e}
              actual={actual}
              now={now}
              today={today}
              isNext={isNext}
              compact
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The last column: a countdown before the release, the surprise after it. */
function Status({
  event: e,
  actual,
  now,
  today,
  isNext,
  compact = false,
}: {
  event: EconomicEvent;
  actual: string | null;
  now: number;
  today: string;
  isNext: boolean;
  compact?: boolean;
}) {
  const until = e.timestamp ? untilText(Date.parse(e.timestamp) - now) : "";
  if (isNext)
    return (
      <span className="tnum inline-flex h-6 shrink-0 items-center rounded-md bg-foreground px-2 text-xs font-semibold text-background">
        Next · {until}
      </span>
    );
  if (e.date === today && isUpcoming(e, now))
    return (
      <span className="tnum shrink-0 text-xs text-muted-foreground">
        {until}
      </span>
    );
  if (actual !== null) {
    const s = surprise(actual, e.estimate);
    if (s?.dir === "above" || s?.dir === "below")
      return (
        <span
          className={cn(
            "tnum inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold",
            s.dir === "above"
              ? "bg-above/10 text-above"
              : "bg-below/10 text-below",
          )}
        >
          <svg viewBox="0 0 8 8" className="size-2" aria-hidden="true">
            <path
              d={s.dir === "above" ? "M4 1 7.5 6.5h-7z" : "M4 7 .5 1.5h7z"}
              fill="currentColor"
            />
          </svg>
          {s.text}
        </span>
      );
    if (s?.dir === "inline")
      return (
        <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-muted px-2 text-xs font-semibold text-foreground/75">
          In line
        </span>
      );
    if (compact) return null;
    return s?.dir === "none" ? (
      <span className="text-xs text-muted-foreground">No consensus</span>
    ) : (
      <span className="text-[13px] text-muted-foreground">—</span>
    );
  }
  if (compact || e.date > today) return null;
  // A data release whose time has passed but whose actual hasn't arrived yet.
  if (e.date === today && e.timestamp && (e.estimate || e.previous))
    return <span className="text-xs text-muted-foreground">Awaiting</span>;
  return <span className="text-[13px] text-muted-foreground">—</span>;
}

function Meter({
  importance,
  className,
}: {
  importance: EconomicEvent["importance"];
  className?: string;
}) {
  const level = importance ?? 0;
  return (
    <span
      aria-hidden="true"
      className={cn("flex h-3 shrink-0 items-end gap-0.5", className)}
    >
      {[5, 8, 12].map((h, i) => (
        <span
          key={h}
          className={cn(
            "w-[3px] rounded-[1px]",
            i < level ? "bg-foreground" : "bg-foreground/20",
          )}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

function LoadingState() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <div className="grid grid-cols-5 gap-1.5 lg:gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl lg:h-24" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border">
        <div className="h-10 bg-muted/40" />
        {[70, 52, 84, 60].map((w) => (
          <div
            key={w}
            className="flex h-12 items-center gap-4 border-t border-border/60 px-4"
          >
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-2.5" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Loading this week&apos;s releases…
      </p>
    </div>
  );
}
