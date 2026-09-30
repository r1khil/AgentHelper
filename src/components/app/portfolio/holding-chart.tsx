"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { Segmented } from "@/components/app/panel";
import { fmtCurrency, fmtDay, fmtDayMonth, fmtMoney, fmtNumber, fmtTime } from "@/lib/format";
import type { TradeMark } from "@/lib/portfolio/holding";
import { LineChart, toneFor, type ChartLine, type ChartMarker } from "./line-chart";

const RANGES = ["1D", "1W", "1M", "6M", "1Y", "All"] as const;
type Range = (typeof RANGES)[number];
type Bar = { date: string; close: number };
type Day = { status: "loading" } | { status: "error" } | { status: "ready"; bars: { t: string; close: number }[] };

const noon = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

function startOf(range: Exclude<Range, "1D">, last: string): string | null {
  const d = DateTime.fromISO(last, { zone: "utc" });
  if (range === "1W") return d.minus({ days: 7 }).toISODate();
  if (range === "1M") return d.minus({ months: 1 }).toISODate();
  if (range === "6M") return d.minus({ months: 6 }).toISODate();
  if (range === "1Y") return d.minus({ years: 1 }).toISODate();
  return null;
}

const said = (m: TradeMark) => `${m.side === "buy" ? "Bought" : "Sold"} ${fmtNumber(m.shares)} at ${fmtMoney(m.price)} on ${fmtDayMonth(m.date)}`;

/**
 * A holding's price, a 220px line with the fund's own trades on it as ink dots. Daily closes come with the page; 1D is
 * fetched when chosen. `marks` are empty for readers who don't see position sizes.
 */
export function HoldingChart({ ticker, bars, marks, currency }: { ticker: string; bars: Bar[]; marks: TradeMark[]; currency?: string }) {
  const [range, setRange] = useState<Range>("6M");
  const [day, setDay] = useState<Day>({ status: "loading" });

  useEffect(() => {
    if (range !== "1D" || day.status === "ready") return;
    let live = true;
    fetch(`/api/overview/intraday?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ bars: { t: string; close: number }[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setDay({ status: "ready", bars: d.bars }))
      .catch(() => live && setDay({ status: "error" }));
    return () => {
      live = false;
    };
  }, [range, ticker, day.status]);

  const view = useMemo(() => {
    if (range === "1D") {
      if (day.status !== "ready" || day.bars.length < 2) return null;
      const pts = day.bars.map((b) => ({ t: Date.parse(b.t), v: b.close }));
      const line: ChartLine = { points: pts, tone: toneFor(pts.at(-1)!.v - pts[0].v), note: "five-minute steps" };
      return { lines: [line], markers: [] as ChartMarker[], shown: [] as TradeMark[], formatX: (t: number) => fmtTime(new Date(t)) };
    }
    const last = bars.at(-1)?.date;
    if (!last) return null;
    const from = startOf(range, last);
    const slice = from ? bars.filter((b) => b.date >= from) : bars;
    if (slice.length < 2) return null;
    const pts = slice.map((b) => ({ t: noon(b.date), v: b.close }));
    const line: ChartLine = { points: pts, tone: toneFor(pts.at(-1)!.v - pts[0].v) };
    // A trade sits on the close of its day, or of the nearest session before it.
    const shown = marks.filter((m) => m.date >= slice[0].date && m.date <= last);
    const markers = shown.map((m) => {
      const bar = [...slice].reverse().find((b) => b.date <= m.date) ?? slice[0];
      return { t: noon(bar.date), v: bar.close, label: said(m) };
    });
    return { lines: [line], markers, shown, formatX: (t: number) => fmtDay(new Date(t).toISOString().slice(0, 10)) };
  }, [range, day, bars, marks]);

  const available = (r: Range) => {
    if (r === "1D") return true;
    const last = bars.at(-1)?.date;
    const from = last && r !== "All" ? startOf(r, last) : null;
    return r === "All" || (!!from && !!bars[0] && bars[0].date <= DateTime.fromISO(from, { zone: "utc" }).plus({ days: 7 }).toISODate()!);
  };
  const legend = view?.shown.length === 1 ? `Fund ${view.shown[0].side === "buy" ? "bought" : "sold"} ${fmtNumber(view.shown[0].shares)} on ${fmtDayMonth(view.shown[0].date)}` : view && view.shown.length > 1 ? `${view.shown.length} fund trades` : null;

  return (
    <div className="flex flex-col">
      <div className="mt-[22px]">
        {view ? (
          <LineChart key={range} lines={view.lines} markers={view.markers} label={`${ticker} price, ${range === "All" ? "all history" : range}${view.markers.length ? `, with ${view.markers.length} fund ${view.markers.length === 1 ? "trade" : "trades"} marked` : ""}`} formatX={view.formatX} formatY={(v) => fmtCurrency(v, currency)} />
        ) : (
          <div className="grid h-[220px] place-items-center text-body text-muted-foreground" role="status">
            {range === "1D" ? (day.status === "error" ? <span className="text-caution-foreground">The day&rsquo;s prices could not be loaded just now.</span> : day.status === "loading" ? "Loading the day’s prices…" : "No prices yet today.") : "No price history is available for this range."}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-1 border-b pb-3.5">
        <Segmented
          label="Chart range"
          segments={RANGES.map((r) => ({
            key: r,
            label: r,
            active: r === range,
            onClick: () => setRange(r),
            disabled: !available(r),
            title: !available(r) ? "The price history loaded for this holding does not reach back that far" : undefined,
          }))}
        />
        <span className="flex-1" />
        {legend && (
          <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <span aria-hidden className="size-2 rounded-full bg-foreground" />
            {legend}
          </span>
        )}
      </div>
    </div>
  );
}
