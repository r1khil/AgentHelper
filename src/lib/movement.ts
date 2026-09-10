import Decimal from "decimal.js";
import { DateTime } from "luxon";
import type { Observation, TradingSession, CalendarAdapter } from "./contracts";
export const POLICY = {
  version: "development-close-v1",
  benchmark: "SPX",
  thresholdPP: "4",
  timestampToleranceSeconds: 60,
  basis: "split-adjusted-price",
  reminderHour: 10,
  dueHour: 12,
  briefingHour: 8,
  timezone: "America/New_York",
} as const;
export class QualityError extends Error {}
export function calculate(
  holding: Observation | null,
  spx: Observation | null,
  session: TradingSession | undefined,
) {
  if (!session) throw new QualityError("Trading session is not configured");
  for (const [name, o] of [
    ["Holding", holding],
    ["SPX", spx],
  ] as const) {
    if (!o) throw new QualityError(`${name} observation is missing`);
    if (!o.official || o.session !== session.day)
      throw new QualityError(
        `${name} is unofficial or from a different session`,
      );
    if (o.corporateAction === "ambiguous" || o.basis !== POLICY.basis)
      throw new QualityError(
        `${name} corporate-action/reference-close basis is unresolved`,
      );
    const observed = DateTime.fromISO(o.observedAt);
    const close = DateTime.fromISO(session.close);
    if (
      !observed.isValid ||
      !close.isValid ||
      Math.abs(observed.toMillis() - close.toMillis()) >
        POLICY.timestampToleranceSeconds * 1000
    )
      throw new QualityError(`${name} observation is stale or misaligned`);
    try {
      if (
        !new Decimal(o.value).isFinite() ||
        !new Decimal(o.previousClose).isFinite() ||
        new Decimal(o.value).lte(0) ||
        new Decimal(o.previousClose).lte(0)
      )
        throw Error();
    } catch {
      throw new QualityError(`${name} price/reference close is invalid`);
    }
  }
  if (spx!.securityId !== "SPX")
    throw new QualityError("Actual SPX is required; proxies are prohibited");
  if (holding!.currency !== "USD" || spx!.currency !== "USD")
    throw new QualityError("Development policy only supports USD observations");
  if (
    Math.abs(Date.parse(holding!.observedAt) - Date.parse(spx!.observedAt)) >
    POLICY.timestampToleranceSeconds * 1000
  )
    throw new QualityError("Holding and SPX timestamps are misaligned");
  const ret = (o: Observation) =>
    new Decimal(o.value).div(o.previousClose).minus(1).times(100);
  const a = ret(holding!),
    b = ret(spx!),
    relative = a.minus(b);
  return {
    holdingReturn: a.toString(),
    spxReturn: b.toString(),
    relativeMove: relative.toString(),
    qualifies: relative.abs().gte(POLICY.thresholdPP),
  };
}
export function deadline(day: string, calendar: CalendarAdapter) {
  const next = calendar.next(day);
  if (!next) throw new QualityError("Next trading day is not configured");
  return {
    due: DateTime.fromISO(next.day, { zone: POLICY.timezone })
      .set({ hour: 12 })
      .toJSDate(),
    reminder: DateTime.fromISO(next.day, { zone: POLICY.timezone })
      .set({ hour: 10 })
      .toJSDate(),
  };
}
export function calendarFrom(sessions: TradingSession[]): CalendarAdapter {
  const sorted = [...sessions].sort((a, b) => a.day.localeCompare(b.day));
  return {
    session: (day) => sorted.find((s) => s.day === day),
    next: (day) => sorted.find((s) => s.day > day),
  };
}
