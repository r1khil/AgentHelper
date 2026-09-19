import { DateTime } from "luxon";
import { NY, isTradingDay, previousTradingDay } from "../providers/calendar";

export const PERIOD_KEYS = ["1d", "7d", "mtd", "qtd", "ytd", "1y", "itd", "custom"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  "1d": "1D",
  "7d": "7D",
  mtd: "MTD",
  qtd: "QTD",
  ytd: "YTD",
  "1y": "1Y",
  itd: "Since inception",
  custom: "Custom",
};

export type ResolvedPeriod = {
  key: PeriodKey;
  /** Base date: returns are measured from this day's close. Excluded from the period. */
  start: string;
  end: string;
  /** True when the requested start fell before inception. */
  clamped: boolean;
};

function onOrBefore(iso: string) {
  return isTradingDay(iso) ? iso : previousTradingDay(iso);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function parsePeriodKey(v: string | undefined): PeriodKey {
  return (PERIOD_KEYS as readonly string[]).includes(v ?? "") ? (v as PeriodKey) : "itd";
}

/** `inception` is the first ledger day; `latest` the last valuation day. */
export function resolvePeriod(key: PeriodKey, opts: { from?: string; to?: string; inception: string; latest: string }): ResolvedPeriod {
  const { inception, latest } = opts;
  let end = latest;
  if (key === "custom" && opts.to && ISO.test(opts.to)) end = opts.to < latest ? onOrBefore(opts.to) : latest;
  const e = DateTime.fromISO(end, { zone: NY });

  let start: string;
  switch (key) {
    // Last completed session: measured from the previous session's close.
    case "1d": start = previousTradingDay(end); break;
    // Trailing calendar week.
    case "7d": start = onOrBefore(e.minus({ days: 7 }).toISODate()!); break;
    case "mtd": start = previousTradingDay(e.startOf("month").toISODate()!); break;
    case "qtd": start = previousTradingDay(e.startOf("quarter").toISODate()!); break;
    case "ytd": start = previousTradingDay(e.startOf("year").toISODate()!); break;
    case "1y": start = onOrBefore(e.minus({ years: 1 }).toISODate()!); break;
    case "custom": start = opts.from && ISO.test(opts.from) ? previousTradingDay(opts.from) : inception; break;
    default: start = inception;
  }
  const clamped = start < inception;
  if (clamped) start = inception;
  if (end < start) end = start;
  return { key, start, end, clamped };
}

/** Hide presets that would silently shorten to the ledger's inception. */
export function availablePeriods(bounds: { inception: string; latest: string }): PeriodKey[] {
  return PERIOD_KEYS.filter((key) => {
    if (key === "custom") return false;
    if (key === "itd") return true;
    const period = resolvePeriod(key, bounds);
    return !period.clamped && period.start < period.end;
  });
}
