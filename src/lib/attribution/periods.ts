import { DateTime } from "luxon";
import { NY, isTradingDay, previousTradingDay } from "../providers/calendar";

export const PERIOD_KEYS = ["1d", "7d", "1m", "6m", "ytd", "1y", "itd", "custom"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

/** The live session, Performance's "Today" (`?period=today`): not a closed period, so not one of PERIOD_KEYS. */
export const TODAY_KEY = "today";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  "1d": "1D",
  "7d": "7D",
  "1m": "1M",
  "6m": "6M",
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

/** Performance opens on the whole ledger ("Since Sep 17"), the gap the page is about; Today and 1D are a click away. */
export const DEFAULT_PERIOD: PeriodKey = "itd";

export function parsePeriodKey(v: string | undefined): PeriodKey {
  return (PERIOD_KEYS as readonly string[]).includes(v ?? "") ? (v as PeriodKey) : DEFAULT_PERIOD;
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
    // Trailing calendar month and half-year.
    case "1m": start = onOrBefore(e.minus({ months: 1 }).toISODate()!); break;
    case "6m": start = onOrBefore(e.minus({ months: 6 }).toISODate()!); break;
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

export type PeriodOption = { key: PeriodKey; /** Starts before the ledger does, so it shows results since inception. */ clamped: boolean };

/** Every preset, always, so the control never changes shape; a preset older than the ledger says so instead of hiding. */
export function periodOptions(bounds: { inception: string; latest: string }): PeriodOption[] {
  return PERIOD_KEYS.filter((key) => key !== "custom").map((key) => ({ key, clamped: key !== "itd" && resolvePeriod(key, bounds).clamped }));
}
