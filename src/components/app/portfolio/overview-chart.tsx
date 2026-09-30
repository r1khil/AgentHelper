"use client";

import { useEffect, useMemo, useState } from "react";
import { Segmented } from "@/components/app/panel";
import { DEFAULT_RANGE, OVERVIEW_RANGES, rangeReach, sliceRange, type ChartPoint, type DailyRange, type OverviewRange } from "@/lib/portfolio/chart";
import { fmtDay, fmtDayMonth, fmtTime, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LineChart, toneFor, type ChartLine } from "./line-chart";

type Path = { t: string; portfolio: number }[];
type DayState = { status: "loading" } | { status: "error" } | { status: "ready"; points: Path };

const noon = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

/**
 * The fund's value over time, or a team's (`team`, its slug). The daily ranges come from the server (the ledger, with
 * today's weights replayed before it); 1D is fetched when chosen, since the first fetch of a day pulls five-minute bars
 * for every holding.
 */
export function OverviewChart({ points, dayBase, inception, note, team, subject = "Fund" }: { points: ChartPoint[]; dayBase: number; inception: string; note?: string | null; team?: string; /** Whose value it is, for the chart's label: "Fund", or the team's name. */ subject?: string }) {
  const [range, setRange] = useState<OverviewRange>(DEFAULT_RANGE);
  const [day, setDay] = useState<DayState>({ status: "loading" });
  const reach = useMemo(() => rangeReach(points), [points]);

  useEffect(() => {
    if (range !== "1D" || day.status === "ready") return;
    let live = true;
    fetch(`/api/daily-performance/path${team ? `?team=${encodeURIComponent(team)}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ points: Path }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setDay({ status: "ready", points: d.points }))
      .catch(() => live && setDay({ status: "error" }));
    return () => {
      live = false;
    };
  }, [range, day.status, team]);

  const view = useMemo(() => {
    if (range === "1D") {
      if (day.status !== "ready" || day.points.length < 2) return null;
      const pts = day.points.map((p) => ({ t: Date.parse(p.t), v: dayBase * (1 + p.portfolio) }));
      const line: ChartLine = { points: pts, tone: toneFor(pts.at(-1)!.v - dayBase), note: "five-minute steps" };
      return { lines: [line], joinAt: undefined, replayShown: false, formatX: (t: number) => fmtTime(new Date(t)) };
    }
    const slice = sliceRange(points, range as DailyRange);
    const firstLedger = slice.findIndex((p) => !p.replay);
    if (firstLedger < 0) return null;
    const replay = slice.slice(0, firstLedger + 1);
    const ledger = slice.slice(firstLedger);
    const at = (p: ChartPoint) => ({ t: noon(p.date), v: p.value });
    const lines: ChartLine[] = [];
    if (replay.length > 1) lines.push({ points: replay.map(at), tone: "neutral", dashed: true, note: "today's weights replayed" });
    lines.push({ points: ledger.map(at), tone: toneFor((ledger.at(-1)?.value ?? 0) - (ledger[0]?.value ?? 0)) });
    return { lines, joinAt: replay.length > 1 ? noon(ledger[0].date) : undefined, replayShown: replay.length > 1, formatX: (t: number) => fmtDay(new Date(t).toISOString().slice(0, 10)) };
  }, [range, day, points, dayBase]);

  const solid = view?.lines.at(-1)?.tone ?? "neutral";
  const label =
    range === "1D"
      ? `${subject} value so far today, in five-minute steps.`
      : `${subject} value over ${range === "All" ? "its whole history" : range}. Before ${fmtDayMonth(inception)} the line is a replay of today's weights; after it, the ledger's real history.`;

  return (
    <div className="flex flex-col">
      <div className="mt-[22px]">
        {view ? (
          <LineChart resetKey={range} lines={view.lines} label={label} joinAt={view.joinAt} valueOnly={range !== "1D"} formatX={view.formatX} formatY={(v) => fmtUsd(v)} />
        ) : (
          <div className="grid h-[220px] place-items-center text-body text-muted-foreground" role="status">
            {range === "1D" ? (day.status === "error" ? <span className="text-caution-foreground">The day&rsquo;s path could not be loaded just now.</span> : day.status === "loading" ? "Loading the day’s path…" : "No prices yet today.") : "Not enough history to draw a line yet."}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-1 border-b pb-3.5">
        <Segmented
          label="Chart range"
          segments={OVERVIEW_RANGES.map((r) => ({
            key: r,
            label: r,
            active: r === range,
            onClick: () => setRange(r),
            disabled: r !== "1D" && r !== "All" && !reach[r],
            title: r !== "1D" && r !== "All" && !reach[r] ? "The price history stored so far does not reach back that far" : undefined,
          }))}
        />
        <span className="flex-1" />
        <span className="flex items-center gap-3.5 text-caption text-muted-foreground">
          {range === "1D" ? (
            <span className="flex items-center gap-1.5">
              <span className={cn("h-[3px] w-3.5", solid === "down" ? "bg-down-line" : "bg-up-line")} aria-hidden />
              Today so far, five-minute steps
            </span>
          ) : (
            <>
              {view?.replayShown && (
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 border-t-2 border-dashed border-series-neutral" aria-hidden />
                  Before {fmtDayMonth(inception)}: today&rsquo;s weights replayed
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className={cn("h-[3px] w-3.5", solid === "down" ? "bg-down-line" : solid === "up" ? "bg-up-line" : "bg-series-neutral")} aria-hidden />
                Ledger history
              </span>
            </>
          )}
        </span>
      </div>
      {note && <p className="pt-2 text-caption text-caution-foreground">{note}</p>}
    </div>
  );
}
