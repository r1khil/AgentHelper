"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
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
  openingTab,
  rangeLabel,
  releaseGroups,
  shownActual,
  surprise,
  todayIn,
  untilText,
  type ReleaseGroup,
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
/** "week", "weekend", or one weekday's ISO date. */
type Tab = string;

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

// Time, release, actual, consensus, previous, vs. consensus. Below xl each release stacks instead.
const COLUMNS =
  "xl:grid-cols-[4rem_minmax(0,1fr)_5.75rem_5.75rem_6.5rem_8.25rem]";
// Release details line up with the release column: row padding, time column, gap.
const DETAILS_INSET = "xl:pl-[98px]";
/** High and medium releases stay full size; low and unrated ones recede so the day reads at a glance. */
const LOOK = {
  3: {
    row: "xl:min-h-11",
    name: "text-sm font-semibold",
    num: "text-sm",
    actual: "font-semibold",
  },
  2: {
    row: "xl:min-h-[38px]",
    name: "text-sm font-medium",
    num: "text-sm",
    actual: "font-semibold",
  },
  1: {
    row: "xl:min-h-8",
    name: "text-[13px] text-foreground/75",
    num: "text-[13px]",
    actual: "font-medium",
  },
} as const;
const look = (e: EconomicEvent) =>
  LOOK[e.importance === 3 ? 3 : e.importance === 2 ? 2 : 1];
const eyebrow =
  "text-xs font-semibold tracking-wider text-muted-foreground uppercase";
const et = (iso: string) => DateTime.fromISO(iso).setZone(NY);
const weekday = (d: string) => DateTime.fromISO(d).weekday <= 5;
const domId = (e: EconomicEvent) => `release-${e.id.replace(/[^\w-]/g, "-")}`;
const leadEvent = (events: EconomicEvent[]) =>
  [...events].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))[0]
    ?.name ?? "No events listed";
const revised = (e: EconomicEvent) =>
  e.previousBeforeRevision !== null && e.previousBeforeRevision !== e.previous;
const consensusSource = (e: EconomicEvent) =>
  e.estimate && e.estimateSource
    ? `Consensus from ${e.estimateSource}`
    : undefined;
const marketText = (e: EconomicEvent) =>
  e.marketImplied &&
  `${e.marketImplied.source}\u00a0${e.marketImplied.value}${e.marketImplied.detail === "median" ? "" : ` (${e.marketImplied.detail})`}`;

/** A prediction market's price for a release, set apart from consensus: it isn't a survey. */
function MarketPrice({
  e,
  className,
}: {
  e: EconomicEvent;
  className?: string;
}) {
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
  // A tab someone picked counts only for the week they picked it in; otherwise the calendar opens on today.
  const [picked, setPicked] = useState<{ from: string; tab: Tab } | null>(null);
  const [row, setRow] = useState<string | null>(null);
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null);

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

  // Picking an upcoming release opens its day; bring its row into view once it renders.
  useEffect(() => {
    if (jump)
      document
        .getElementById(jump.id)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [jump]);

  // Never display the previous week's data under the newly selected dates.
  const current =
    feed?.from === range.from && feed?.to === range.to ? feed : null;
  const events = current?.events ?? [];
  const today = now === null ? null : todayIn(now);
  const thisWeek = today !== null && today >= range.from && today <= range.to;
  const tab =
    picked?.from === range.from ? picked.tab : openingTab(range, today);
  const days = rangeDays(range);
  const weekend = days.filter((d) => !weekday(d));
  const scope = events.filter((e) =>
    tab === "week"
      ? true
      : tab === "weekend"
        ? weekend.includes(e.date)
        : e.date === tab,
  );
  const q = search.toLowerCase().trim();
  const keep = IMPORTANCE.find((i) => i.id === importance)!.keep;
  const visible = scope.filter(
    (e) =>
      keep(e) &&
      `${e.name} ${e.category ?? ""} ${e.source ?? ""}`
        .toLowerCase()
        .includes(q),
  );
  const listed =
    tab === "week"
      ? // Weekend days only get a section when the feed lists something on them.
        days.filter((d) => weekday(d) || events.some((e) => e.date === d))
      : tab === "weekend"
        ? weekend.filter((d) => events.some((e) => e.date === d))
        : [tab];
  const next = now === null ? null : nextRelease(events, now);
  const ahead =
    now === null || today === null
      ? []
      : events.filter((e) => e.importance === 3 && isAhead(e, now, today));
  const retry = () => setRefresh((n) => n + 1);
  const pickTab = (t: Tab) => {
    setPicked({ from: range.from, tab: t });
    setRow(null);
  };
  const pickAhead = (e: EconomicEvent) => {
    setPicked({ from: range.from, tab: weekday(e.date) ? e.date : "weekend" });
    setImportance("all");
    setSearch("");
    setRow(e.id);
    setJump((j) => ({ id: domId(e), n: (j?.n ?? 0) + 1 }));
  };
  const changeRange = (r: CalendarRange) => {
    setRange(r);
    setRow(null);
  };

  return (
    <div className="mx-auto w-full max-w-[61rem]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Economic Calendar
          </h1>
          {current && (
            <FeedStatus
              feed={current}
              error={error}
              loading={loading}
              onRetry={retry}
            />
          )}
        </div>
        <WeekControls
          range={range}
          thisWeek={thisWeek}
          onChange={changeRange}
        />
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
          {(next || ahead.length > 0) && (
            <UpNext
              next={next}
              ahead={ahead}
              now={now}
              today={today}
              thisWeek={thisWeek}
              teamSlug={teamSlug}
              askable={!preview && !livePreview}
              onPick={pickAhead}
            />
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
          <section
            aria-label="Releases"
            className="overflow-hidden rounded-xl border bg-card"
          >
            <DayTabs
              days={days}
              events={events}
              now={now}
              today={today}
              selected={tab}
              onPick={pickTab}
            />
            <div className="flex flex-col gap-2.5 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-5">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
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
                          "inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-7",
                          on
                            ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/5"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {option.label}
                        <span className="tnum text-xs text-muted-foreground">
                          {scope.filter(option.keep).length}
                        </span>
                      </button>
                    );
                  })}
                </fieldset>
                <label className="flex h-11 w-full items-center gap-2 rounded-lg border bg-background px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring sm:h-[34px] sm:w-64">
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
              <span
                className="tnum self-end text-xs text-muted-foreground lg:self-auto lg:text-[13px]"
                aria-live="polite"
              >
                Showing {visible.length} of {scope.length}
              </span>
            </div>
            <div
              className={cn(
                "hidden items-end gap-3.5 border-b border-border/70 px-5 pb-2 text-xs text-muted-foreground xl:grid",
                COLUMNS,
              )}
            >
              <span>Time</span>
              <span>Release</span>
              <span className="text-right">Actual</span>
              <span className="text-right">Consensus</span>
              <span className="text-right">Previous</span>
              <span className="pl-1">vs. consensus</span>
            </div>
            <div className="border-t border-border/70 xl:border-t-0">
              {listed.length ? (
                listed.map((day, i) => {
                  const rows = visible.filter((e) => e.date === day);
                  // In the week view of the current week, days already over fold into one line; a search opens everything.
                  const collapsible =
                    tab === "week" &&
                    thisWeek &&
                    day < today &&
                    rows.length > 0;
                  return (
                    <Day
                      key={day}
                      day={day}
                      first={i === 0}
                      heading={tab === "week" || tab === "weekend"}
                      all={events.filter((e) => e.date === day)}
                      rows={rows}
                      now={now}
                      today={today}
                      nextId={next?.id ?? null}
                      collapsible={collapsible}
                      expanded={!collapsible || !!open[day] || q !== ""}
                      onToggle={() =>
                        setOpen((o) => ({ ...o, [day]: !o[day] }))
                      }
                      openRow={row}
                      onRow={(id) => setRow((r) => (r === id ? null : id))}
                      askable={!preview && !livePreview}
                      teamSlug={teamSlug}
                    />
                  );
                })
              ) : (
                <p className="px-4 py-3.5 text-[13px] text-muted-foreground xl:px-5">
                  No events listed for the weekend. Coverage may be incomplete.
                </p>
              )}
            </div>
          </section>
          <AboutData feed={current} />
        </>
      )}
    </div>
  );
}

function FeedStatus({
  feed,
  error,
  loading,
  onRetry,
}: {
  feed: CalendarFeed;
  error: LoadError | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const at = et(feed.fetchedAt).toFormat("h:mm a");
  return (
    <div className="tnum flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
      {error ? (
        <>
          <span
            aria-hidden="true"
            className="size-[7px] rounded-full bg-warning"
          />
          <span className="text-warning-foreground" title={error.message}>
            Couldn&apos;t refresh · showing {at} data
          </span>
          {!error.expired && (
            <Button
              variant="outline"
              size="xs"
              disabled={loading}
              onClick={onRetry}
            >
              Try again
            </Button>
          )}
        </>
      ) : (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "size-[7px] rounded-full",
              feed.mode === "demo" ? "bg-warning" : "bg-up",
            )}
          />
          <span>
            {feed.mode === "demo" ? "Synthetic preview" : "Live"} · updated {at}{" "}
            ET ·{" "}
            <a
              href="#about-data"
              className="text-foreground/70 underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              {feed.provider}
            </a>
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Refresh now"
            disabled={loading}
            onClick={onRetry}
            className="max-sm:size-9"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </>
      )}
    </div>
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

/** Opens a Hoot chat with a question already written, from anywhere on the page. */
function useAskHoot(teamSlug: string | null) {
  const router = useRouter();
  const pathname = usePathname();
  const [asking, setAsking] = useState(false);
  const ask = async (question: string) => {
    setAsking(true);
    try {
      const res = await startHootChat({ teamSlug, ticker: null });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (!leaveHootQuestion(res.chatId, question, pageContextFor(pathname)))
        toast("Your chat is open. Paste your question to send it.");
      router.push(res.href);
    } catch {
      toast.error("Couldn't open a chat just now. Try again in a moment.");
    } finally {
      setAsking(false);
    }
  };
  return { asking, ask };
}

function hootQuestion(e: EconomicEvent, now: number) {
  const name = `${e.name}${e.period ? ` (${e.period})` : ""}`;
  const actual = shownActual(e, now);
  if (actual !== null)
    return `${name} came in at ${actual} against a consensus of ${e.estimate ?? "none published"}; the previous reading was ${e.previous ?? "not available"}. What does that mean for our holdings?`;
  if (!e.timestamp)
    return `What should we know about ${name} on ${DateTime.fromISO(e.date).toFormat("cccc, MMM d")}? Which of our holdings could it affect?`;
  const at = et(e.timestamp).toFormat("cccc h:mm a");
  if (!isUpcoming(e, now))
    return `What came out of ${name} on ${at} ET, and which of our holdings could it affect?`;
  return `What should we watch in ${name}, due ${at} ET? Consensus is ${e.estimate ?? "not available"} and the previous reading was ${e.previous ?? "not available"}.${e.marketImplied ? ` ${e.marketImplied.source} traders price ${e.marketImplied.detail === "median" ? `a median of ${e.marketImplied.value}` : `${e.marketImplied.value} (${e.marketImplied.detail})`}.` : ""} Which of our holdings are most exposed to a surprise either way?`;
}

function AskHoot({
  event: e,
  now,
  teamSlug,
  label,
  className,
}: {
  event: EconomicEvent;
  now: number;
  teamSlug: string | null;
  label: string;
  className?: string;
}) {
  const { asking, ask } = useAskHoot(teamSlug);
  return (
    <Button
      variant="outline"
      size="lg"
      disabled={asking}
      onClick={() => void ask(hootQuestion(e, now))}
      className={cn("pl-2", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hoot/mark.webp"
        alt=""
        width={20}
        height={20}
        className="size-5 object-contain"
      />
      {asking ? "Opening Hoot…" : label}
    </Button>
  );
}

/** Consensus, market price and previous in one line, for the Up next bar. */
function Figures({ e }: { e: EconomicEvent }) {
  const parts: ReactNode[] = [];
  if (e.estimate)
    parts.push(<span title={consensusSource(e)}>Cons. {e.estimate}</span>);
  if (e.marketImplied) parts.push(<MarketPrice e={e} />);
  if (e.previous)
    parts.push(
      <span>
        Prev. {e.previous}
        {revised(e) && ` (rev. from ${e.previousBeforeRevision})`}
      </span>,
    );
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && " · "}
      {part}
    </Fragment>
  ));
}

function UpNext({
  next,
  ahead,
  now,
  today,
  thisWeek,
  teamSlug,
  askable,
  onPick,
}: {
  next: EconomicEvent | null;
  ahead: EconomicEvent[];
  now: number;
  today: string;
  thisWeek: boolean;
  teamSlug: string | null;
  askable: boolean;
  onPick: (e: EconomicEvent) => void;
}) {
  const at = next && et(next.timestamp!);
  return (
    <section
      aria-label="Coming up"
      className="mb-5 overflow-hidden rounded-xl border bg-card"
    >
      {next && at && (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 p-4 lg:flex-nowrap lg:py-3.5 lg:pr-4 lg:pl-[18px]">
          <span className="tnum inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full bg-foreground px-2.5 text-xs font-semibold text-background">
            <Clock className="size-3" />
            Next · {untilText(at.toMillis() - now)}
          </span>
          <div className="order-1 flex w-full min-w-0 flex-col gap-0.5 lg:order-none lg:w-auto lg:flex-1 lg:flex-row lg:flex-wrap lg:items-baseline lg:gap-x-3">
            <h2 className="text-[17px] leading-[22px] font-semibold tracking-tight lg:text-base">
              {next.name}
            </h2>
            <span className="tnum text-[13px] text-muted-foreground">
              {[
                `${next.date === today ? "Today" : at.toFormat("ccc")} ${at.toFormat("h:mm a")}`,
                next.period,
                next.unit,
                next.source,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {(next.estimate || next.marketImplied || next.previous) && (
              <span className="tnum text-[13px] text-foreground/85">
                <Figures e={next} />
              </span>
            )}
          </div>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-xs text-foreground/70 lg:ml-0 lg:text-[13px]">
            <Meter importance={next.importance} />
            {IMPORTANCE_LABEL[next.importance ?? 0]}
          </span>
          {askable && (
            <AskHoot
              event={next}
              now={now}
              teamSlug={teamSlug}
              label="Ask Hoot what to watch"
              className="order-2 h-11 w-full lg:order-none lg:h-8 lg:w-auto"
            />
          )}
        </div>
      )}
      <div
        className={cn(
          "flex flex-col px-4 py-1.5 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start lg:gap-3.5 lg:pl-[18px]",
          next && "border-t border-border/60 bg-muted/40",
        )}
      >
        <h2 className="pt-2 text-xs leading-4 font-semibold whitespace-nowrap text-foreground/70">
          High importance ahead{" "}
          <span className="font-normal text-muted-foreground">
            · {ahead.length} {thisWeek ? "left this week" : "this week"}
          </span>
        </h2>
        {ahead.length ? (
          <ol className="flex min-w-0 flex-col lg:flex-row lg:flex-wrap lg:gap-x-5">
            {ahead.slice(0, 5).map((e) => {
              const right = e.estimate
                ? `cons. ${e.estimate}`
                : marketText(e) || (e.previous ? "no consensus" : "");
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onPick(e)}
                    className="tnum flex min-h-12 w-full flex-col items-start justify-center gap-px rounded-sm py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-8 lg:w-auto lg:flex-row lg:items-center lg:gap-1.5 lg:py-0"
                  >
                    <span className="text-xs text-muted-foreground lg:text-[13px]">
                      {e.date === today
                        ? "Today"
                        : DateTime.fromISO(e.date).toFormat("ccc")}{" "}
                      {e.time}
                      {right && <span className="lg:hidden"> · {right}</span>}
                    </span>
                    <span className="text-sm leading-[18px] font-medium underline decoration-border underline-offset-[3px] lg:text-[13px]">
                      {e.name}
                    </span>
                    {right && (
                      <span className="hidden text-[13px] text-foreground/70 lg:inline">
                        {right}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            {ahead.length > 5 && (
              <li className="flex items-center py-2 text-xs text-muted-foreground lg:min-h-8 lg:py-0">
                {ahead.length - 5} more in the list below
              </li>
            )}
          </ol>
        ) : (
          <p className="py-2 text-[13px] text-muted-foreground lg:flex lg:min-h-8 lg:items-center lg:py-0">
            No high-importance releases left this week.
          </p>
        )}
      </div>
    </section>
  );
}

function DayTabs({
  days,
  events,
  now,
  today,
  selected,
  onPick,
}: {
  days: string[];
  events: EconomicEvent[];
  now: number;
  today: string;
  selected: Tab;
  onPick: (tab: Tab) => void;
}) {
  const counted = (list: EconomicEvent[]) => {
    const high = list.filter((e) => e.importance === 3).length;
    return list.length
      ? `${list.length} ${list.length === 1 ? "event" : "events"}${high ? ` · ${high} high` : ""}`
      : "No events listed";
  };
  const weekend = days.filter((d) => !weekday(d));
  const weekendEvents = events.filter((e) => weekend.includes(e.date));
  const dayNum = (d: string) => String(DateTime.fromISO(d).day);
  const span = (list: string[]) =>
    list.length ? `${dayNum(list[0])}–${dayNum(list[list.length - 1])}` : "";
  const tabs = [
    {
      key: "week",
      dow: "Week",
      num: span(days),
      phoneNum: "All",
      count: counted(events),
      short: String(events.length),
      lead: leadEvent(events),
      label: `Whole week, ${counted(events)}`,
      today: false,
      past: false,
      phoneHidden: false,
    },
    ...days.filter(weekday).map((day) => {
      const list = events.filter((e) => e.date === day);
      const date = DateTime.fromISO(day);
      const isToday = day === today;
      const past = day < today && list.length > 0;
      const out = list.filter((e) => isReleased(e, now)).length;
      const count = isToday
        ? `${out} of ${list.length} released`
        : counted(list);
      return {
        key: day,
        dow: date.toFormat("ccc"),
        num: dayNum(day),
        phoneNum: dayNum(day),
        count,
        short: isToday ? `${out}/${list.length}` : String(list.length),
        lead: leadEvent(list),
        label: `${date.toFormat("cccc, MMM d")}${isToday ? ", today" : ""}, ${count}${past ? ", released" : ""}`,
        today: isToday,
        past,
        phoneHidden: false,
      };
    }),
    ...(weekend.length
      ? [
          {
            key: "weekend",
            dow: "Sat–Sun",
            num: span(weekend),
            phoneNum: span(weekend),
            count: counted(weekendEvents),
            short: String(weekendEvents.length),
            lead: leadEvent(weekendEvents),
            label: `Weekend, ${counted(weekendEvents)}`,
            today: false,
            past: false,
            // Phones show the weekend only when something is listed on it.
            phoneHidden: weekendEvents.length === 0,
          },
        ]
      : []),
  ];
  const phoneColumns = tabs.filter((t) => !t.phoneHidden).length;
  return (
    <nav
      aria-label="Choose a day"
      className={cn(
        "grid bg-muted/40 lg:grid-cols-7",
        phoneColumns === 7 ? "grid-cols-7" : "grid-cols-6",
      )}
    >
      {tabs.map((t, i) => {
        const on = t.key === selected;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={on}
            aria-label={t.label}
            title={`Lead event: ${t.lead}`}
            onClick={() => onPick(t.key)}
            className={cn(
              "flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-0.5 border-b px-0.5 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:items-start lg:gap-[3px] lg:px-3 lg:py-2.5",
              i > 0 && "border-l border-l-border/70",
              on
                ? "border-b-transparent bg-card shadow-[inset_0_2px_0_var(--color-foreground)]"
                : "hover:bg-muted/60",
              !on &&
                t.today &&
                "max-lg:ring-1 max-lg:ring-foreground max-lg:ring-inset",
              !on && t.past && "text-foreground/75",
              t.phoneHidden && "hidden lg:flex",
            )}
          >
            <span className="text-[11px] font-semibold tracking-wide uppercase lg:hidden">
              {t.dow === "Sat–Sun" ? "Wknd" : t.dow}
            </span>
            <span className="tnum text-[17px] leading-5 font-semibold lg:hidden">
              {t.phoneNum}
            </span>
            <span className="tnum text-[11px] text-muted-foreground lg:hidden">
              {t.short}
            </span>
            <span className="hidden min-w-0 items-center gap-1.5 whitespace-nowrap lg:flex">
              <span
                className={cn(
                  "text-[11px] font-semibold tracking-wider uppercase",
                  on || t.today ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {t.dow}
              </span>
              <span className="tnum text-base leading-5 font-semibold">
                {t.num}
              </span>
              {t.today && (
                <span className="rounded-full bg-foreground px-1.5 py-px text-[10px] font-semibold text-background">
                  Today
                </span>
              )}
              {t.past && <Check className="size-3 text-muted-foreground" />}
            </span>
            <span className="tnum hidden max-w-full truncate text-xs text-muted-foreground lg:block">
              {t.count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function Day({
  day,
  first,
  heading,
  all,
  rows,
  now,
  today,
  nextId,
  collapsible,
  expanded,
  onToggle,
  openRow,
  onRow,
  askable,
  teamSlug,
}: {
  day: string;
  first: boolean;
  heading: boolean;
  all: EconomicEvent[];
  rows: EconomicEvent[];
  now: number;
  today: string;
  nextId: string | null;
  collapsible: boolean;
  expanded: boolean;
  onToggle: () => void;
  openRow: string | null;
  onRow: (id: string) => void;
  askable: boolean;
  teamSlug: string | null;
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
  const groups = collapsed ? [] : releaseGroups(rows);
  // The "now" line sits before today's first time slot still to come, or after the last one.
  const firstAhead = groups.findIndex(
    (g) => g.time !== null && g.events.some((e) => isUpcoming(e, now)),
  );
  const nowAt = !isToday ? -1 : firstAhead === -1 ? groups.length : firstAhead;
  const label = DateTime.fromISO(day).toFormat("EEEE, MMM d");

  return (
    <section id={`day-${day}`} aria-label={label} className="scroll-mt-6">
      {heading && (
        <div
          className={cn(
            "flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 xl:flex-nowrap xl:px-5",
            !first && "border-t",
            past && "bg-muted/40",
          )}
        >
          <h3 className="text-sm font-semibold whitespace-nowrap">{label}</h3>
          {isToday && (
            <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background xl:text-xs">
              Today
            </span>
          )}
          <span className="tnum text-xs whitespace-nowrap text-muted-foreground xl:text-[13px]">
            {count}
          </span>
          {collapsed && (
            <span className="order-last w-full min-w-0 truncate text-xs text-foreground/75 xl:order-none xl:w-auto xl:flex-1 xl:text-[13px]">
              {daySummary(rows, now)}
            </span>
          )}
          {collapsible && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={onToggle}
              className="ml-auto inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring xl:h-7 xl:border xl:bg-background"
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
      )}
      {!collapsed &&
        (rows.length ? (
          <div className="pb-1.5">
            {groups.map((g, i) => (
              <Fragment key={`${g.time}-${g.source}-${i}`}>
                {i === nowAt && <NowLine now={now} />}
                <GroupLine group={g} first={i === 0} now={now} />
                {g.events.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    group={g}
                    now={now}
                    today={today}
                    isNext={e.id === nextId}
                    open={openRow === e.id}
                    onToggle={() => onRow(e.id)}
                    askable={askable}
                    teamSlug={teamSlug}
                  />
                ))}
              </Fragment>
            ))}
            {nowAt === groups.length && <NowLine now={now} />}
          </div>
        ) : (
          <p
            className={cn(
              "px-4 py-3.5 text-[13px] text-muted-foreground xl:px-5",
              heading && "border-t border-border/60",
            )}
          >
            {all.length
              ? "No events match your filters on this day."
              : "No events listed for this day. Coverage may be incomplete."}
          </p>
        ))}
    </section>
  );
}

/** A report's line: its time (once per slot), source, and whatever period and unit its rows share. */
function GroupLine({
  group: g,
  first,
  now,
}: {
  group: ReleaseGroup;
  first: boolean;
  now: number;
}) {
  const ahead = g.events.some((e) => isUpcoming(e, now));
  return (
    <div
      className={cn(
        "flex items-baseline gap-2 px-4 pt-3.5 xl:grid xl:grid-cols-[4rem_minmax(0,1fr)] xl:gap-3.5 xl:px-5 xl:pt-3 xl:pb-0.5",
        g.time !== null && !first && "border-t border-border/60",
      )}
    >
      <span
        className={cn(
          "tnum shrink-0 text-xs font-semibold xl:text-[13px] xl:font-medium",
          ahead ? "text-foreground" : "text-muted-foreground",
          g.time === null && "hidden xl:block",
        )}
      >
        {g.time}
      </span>
      <span className="min-w-0 text-xs text-muted-foreground xl:truncate">
        {[g.source, g.period, g.unit].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}

function NowLine({ now }: { now: number }) {
  return (
    <div className="mt-1.5 flex h-[30px] items-center gap-2.5 px-4 xl:px-5">
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
  group,
  now,
  today,
  isNext,
  open,
  onToggle,
  askable,
  teamSlug,
}: {
  event: EconomicEvent;
  group: ReleaseGroup;
  now: number;
  today: string;
  isNext: boolean;
  open: boolean;
  onToggle: () => void;
  askable: boolean;
  teamSlug: string | null;
}) {
  const actual = shownActual(e, now);
  // Speeches and other events without figures leave the number columns empty rather than filling them with dashes.
  const figures = actual !== null || e.estimate !== null || e.previous !== null;
  const meta = [
    group.period === null ? e.period : null,
    group.unit === null ? e.unit : null,
    e.tentative && "Tentative",
  ]
    .filter(Boolean)
    .join(" · ");
  const L = look(e);
  const id = domId(e);
  // Phones fold the numbers into one line under the name; it wraps only between values.
  const phone = [
    e.estimate && `Cons\u00a0${e.estimate}`,
    actual === null && marketText(e),
    e.previous && `Prev\u00a0${e.previous}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const phoneLine =
    figures || isNext || (e.date === today && isUpcoming(e, now));
  const name = (className: string) => (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={`${id}-details`}
      onClick={onToggle}
      className={cn(
        "rounded-sm text-left leading-[18px] outline-none hover:underline hover:decoration-border hover:underline-offset-[3px] focus-visible:ring-2 focus-visible:ring-ring",
        L.name,
        className,
      )}
    >
      {e.name}
      <span className="sr-only">
        , {IMPORTANCE_LABEL[e.importance ?? 0].toLowerCase()} importance
      </span>
    </button>
  );
  const status = (compact: boolean) => (
    <Status
      event={e}
      actual={actual}
      now={now}
      today={today}
      isNext={isNext}
      compact={compact}
    />
  );

  return (
    <div
      id={id}
      className={cn("scroll-mt-24", isNext && "bg-foreground/[0.04]")}
    >
      <div
        className={cn(
          "hidden items-center gap-3.5 px-5 xl:grid",
          COLUMNS,
          L.row,
          meta && "py-1.5",
        )}
      >
        <span aria-hidden="true" />
        <div className="flex min-w-0 items-center gap-2.5">
          <Meter importance={e.importance} />
          <div className="flex min-w-0 flex-col gap-px">
            {name("block max-w-full truncate")}
            {meta && (
              <p className="truncate text-xs text-muted-foreground">{meta}</p>
            )}
          </div>
        </div>
        <span
          className={cn(
            "tnum text-right",
            L.num,
            actual === null
              ? "text-muted-foreground/70"
              : cn("text-foreground", L.actual),
          )}
        >
          {figures && (actual ?? "—")}
        </span>
        <div className="flex flex-col items-end">
          <span
            className={cn(
              "tnum text-right",
              L.num,
              e.estimate ? "text-foreground/90" : "text-muted-foreground/70",
            )}
            title={consensusSource(e)}
          >
            {figures && (e.estimate ?? "—")}
          </span>
          {actual === null && <MarketPrice e={e} className="text-[11px]" />}
        </div>
        <div className="flex flex-col items-end">
          <span
            className={cn(
              "tnum",
              L.num,
              e.previous ? "text-foreground/70" : "text-muted-foreground/70",
            )}
          >
            {figures && (e.previous ?? "—")}
          </span>
          {revised(e) && (
            <span
              className="tnum text-[11px] text-muted-foreground"
              title="Value before the provider revised it"
            >
              rev. from {e.previousBeforeRevision}
            </span>
          )}
        </div>
        <div className="flex pl-1">{status(false)}</div>
      </div>
      <div className="px-4 pb-1.5 xl:hidden">
        <div className="flex items-center gap-2">
          <Meter importance={e.importance} />
          {name("flex min-h-11 min-w-0 flex-1 items-center")}
        </div>
        {meta && (
          <p className="-mt-2.5 pb-1 pl-[15px] text-xs text-muted-foreground">
            {meta}
          </p>
        )}
        {phoneLine && (
          <div className="-mt-1.5 flex min-h-[22px] items-center justify-between gap-2 pl-[15px]">
            <span className="tnum min-w-0 text-xs text-foreground/70">
              {actual !== null && (
                <strong className="font-semibold text-foreground">
                  Actual&nbsp;{actual}
                </strong>
              )}
              {actual !== null && phone && " · "}
              {phone}
            </span>
            {status(true)}
          </div>
        )}
      </div>
      {open && (
        <ReleaseDetails
          id={`${id}-details`}
          event={e}
          actual={actual}
          now={now}
          today={today}
          isNext={isNext}
          askable={askable}
          teamSlug={teamSlug}
        />
      )}
    </div>
  );
}

/** Every field of one release in one place, including the ones the row only shows on hover. */
function ReleaseDetails({
  id,
  event: e,
  actual,
  now,
  today,
  isNext,
  askable,
  teamSlug,
}: {
  id: string;
  event: EconomicEvent;
  actual: string | null;
  now: number;
  today: string;
  isNext: boolean;
  askable: boolean;
  teamSlug: string | null;
}) {
  const s = surprise(actual, e.estimate);
  const m = e.marketImplied;
  const at = e.timestamp ? et(e.timestamp) : null;
  let status: string;
  if (actual !== null)
    status =
      s?.dir === "above" || s?.dir === "below"
        ? `Released, ${s.text} consensus`
        : s?.dir === "inline"
          ? "Released, in line with consensus"
          : "Released";
  else if (at && isUpcoming(e, now))
    status = isNext
      ? `Next release, ${untilText(at.toMillis() - now)}`
      : `Scheduled, ${e.date === today ? "today" : at.toFormat("cccc")} ${at.toFormat("h:mm a")}`;
  else if (!at)
    status = `${e.time}, ${DateTime.fromISO(e.date).toFormat("cccc, MMM d")}`;
  else
    status =
      e.estimate || e.previous
        ? "Time passed, no figure reported yet"
        : "Time passed";
  if (e.tentative) status += " (tentative)";
  const link =
    "underline decoration-border underline-offset-2 hover:decoration-foreground";
  const fields: [string, ReactNode][] = [
    ["Period", e.period ?? "—"],
    [
      "Source",
      e.sourceUrl ? (
        <a href={e.sourceUrl} target="_blank" rel="noreferrer" className={link}>
          {e.source ?? "Source"}
        </a>
      ) : (
        (e.source ?? "—")
      ),
    ],
    ["Unit", e.unit ?? "—"],
    ["Importance", IMPORTANCE_LABEL[e.importance ?? 0]],
    [
      "Consensus",
      e.estimate
        ? `${e.estimate}, economist survey${e.estimateSource ? ` via ${e.estimateSource}` : ""}`
        : "None published",
    ],
    [
      "Market price",
      m ? (
        <>
          <a href={m.url} target="_blank" rel="noreferrer" className={link}>
            {m.source} {m.value}
          </a>
          ,{" "}
          {m.detail === "median"
            ? "median outcome"
            : `likeliest outcome, ${m.detail}`}
          . A prediction-market price, not consensus.
        </>
      ) : (
        "None"
      ),
    ],
    [
      "Previous",
      e.previous
        ? revised(e)
          ? `${e.previous}, revised from ${e.previousBeforeRevision}`
          : e.previous
        : "—",
    ],
    ["Status", status],
  ];
  return (
    <div id={id} className={cn("px-4 pt-1 pb-3 xl:pr-5", DETAILS_INSET)}>
      <div className="flex flex-col gap-3 rounded-lg bg-muted/70 p-3 xl:flex-row xl:items-start xl:gap-5 xl:px-4 xl:py-3.5">
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-2.5 xl:grid-cols-4 xl:gap-x-5 xl:gap-y-3">
          {fields.map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-[11px] text-muted-foreground xl:text-xs">
                {k}
              </dt>
              <dd className="tnum text-[13px] leading-[18px] break-words">
                {v}
              </dd>
            </div>
          ))}
        </dl>
        {askable && (
          <AskHoot
            event={e}
            now={now}
            teamSlug={teamSlug}
            label="Ask Hoot"
            className="h-11 w-full xl:h-8 xl:w-auto"
          />
        )}
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
      <span className="tnum inline-flex h-[22px] shrink-0 items-center rounded-md bg-foreground px-2 text-xs font-semibold whitespace-nowrap text-background">
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
            "tnum inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold whitespace-nowrap",
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
        <span className="inline-flex h-[22px] shrink-0 items-center rounded-md bg-muted px-2 text-xs font-semibold text-foreground/75">
          In line
        </span>
      );
    // No consensus shows as the dash in the Consensus column; only a comparison that can't be made gets one here.
    if (compact || s?.dir === "none") return null;
    return <span className="text-[13px] text-muted-foreground">—</span>;
  }
  if (compact || e.date > today) return null;
  // A data release whose time has passed but whose actual hasn't arrived yet.
  if (e.date === today && e.timestamp && (e.estimate || e.previous))
    return <span className="text-xs text-muted-foreground">Awaiting</span>;
  return e.estimate || e.previous ? (
    <span className="text-[13px] text-muted-foreground">—</span>
  ) : null;
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

function AboutData({ feed }: { feed: CalendarFeed }) {
  const sources = feed.sources ?? [];
  const credits = sources.length ? sources.map((s) => s.name) : [feed.provider];
  return (
    <footer
      id="about-data"
      className="mt-6 grid scroll-mt-6 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8"
    >
      <div className="flex flex-col gap-3">
        <h2 className={eyebrow}>About this data</h2>
        {sources.length > 0 && (
          <>
            <p className="text-[13px] text-foreground/80">
              Sources · {sources.filter((s) => s.status === "ok").length} of{" "}
              {sources.length} connected
            </p>
            <div className="flex flex-wrap gap-2 lg:flex-col lg:items-start">
              {sources.map((s) => {
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
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors lg:h-7",
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
                    <span className={cn("tnum", ok && "text-muted-foreground")}>
                      {ok ? s.count : "unavailable"}
                    </span>
                  </a>
                );
              })}
            </div>
          </>
        )}
      </div>
      <ul className="grid list-disc gap-x-8 gap-y-2.5 pl-[18px] text-[13px] leading-[19px] text-foreground/70 lg:grid-cols-2 lg:pt-7">
        <li>
          All times are Eastern. Click a release name to see all of its details.
        </li>
        <li>
          Blue and orange show direction against consensus, not whether a print
          is good or bad.
        </li>
        <li>
          Consensus is the economist survey from the feed in use, filled from
          FXStreet where the feed has none. Model forecasts are never
          substituted. A release&apos;s details name its consensus source.
        </li>
        <li>
          Kalshi figures are prediction-market prices before a release (the
          median outcome, or the likeliest for Fed decisions). They are not
          consensus and never drive the colors.
        </li>
        <li>
          Previous includes provider revisions. A past time alone does not
          confirm a release.
        </li>
        <li>
          Separate measurements of one report can arrive as separate records.
          They are grouped under the report&apos;s source and time.
        </li>
        <li>Checked every minute; provider caching applies.</li>
        <li>Data: {credits.join(", ")}, and the linked U.S. agencies.</li>
      </ul>
    </footer>
  );
}

function LoadingState() {
  return (
    <div role="status" className="flex flex-col gap-5">
      <Skeleton className="h-[106px] rounded-xl lg:h-[98px]" />
      <div className="overflow-hidden rounded-xl border">
        <div className="grid h-[60px] grid-cols-6 border-b bg-muted/40 lg:grid-cols-7">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className={cn(
                "flex items-center border-l px-3 first:border-l-0",
                i === 6 && "hidden lg:flex",
              )}
            >
              <Skeleton className="h-2.5 w-3/4" />
            </div>
          ))}
        </div>
        {[70, 52, 84, 60].map((w) => (
          <div
            key={w}
            className="flex h-11 items-center gap-4 border-t border-border/60 px-4 first:border-t-0"
          >
            <Skeleton className="h-2.5 w-12" />
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
