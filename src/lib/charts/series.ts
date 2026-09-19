export type Observation = {
  date: string;
  values: Record<string, number | null>;
};
export type PerformancePoint = Observation & {
  time: number;
  returns: Record<string, number | null>;
};
export const RANGES = ["1W", "1M", "3M", "6M", "YTD", "1Y", "ALL"] as const;
export type TimeRange = (typeof RANGES)[number];

const DAY = 86_400_000;
function timestamp(date: string) {
  const time = Date.parse(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === date
    ? time
    : NaN;
}

/** Daily observations only. Sort and deduplicate without filling missing prices. */
export function normalizeObservations(data: Observation[]): Observation[] {
  const byDate = new Map<string, Observation>();
  for (const point of data) {
    if (!Number.isFinite(timestamp(point.date))) continue;
    byDate.set(point.date, {
      date: point.date,
      values: Object.fromEntries(
        Object.entries(point.values).map(([key, value]) => [
          key,
          value !== null && Number.isFinite(value) && value >= 0 ? value : null,
        ]),
      ),
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Only compare observed closes from the same session; never forward-fill either series. */
export function alignPrices(
  holding: { date: string; close: number }[],
  benchmark: { date: string; close: number }[],
): Observation[] {
  const other = new Map(benchmark.map((p) => [p.date, p.close]));
  return normalizeObservations(
    holding.map((p) => ({
      date: p.date,
      values: { holding: p.close, benchmark: other.get(p.date) ?? null },
    })),
  ).filter(
    (p) =>
      p.values.holding !== null &&
      p.values.holding > 0 &&
      p.values.benchmark !== null &&
      p.values.benchmark > 0,
  );
}

export function rangeStart(
  end: string,
  range: Exclude<TimeRange, "ALL">,
): number {
  const date = new Date(timestamp(end));
  if (range === "1W") return date.getTime() - 7 * DAY;
  // YTD uses the prior year's closing observation as its base.
  if (range === "YTD") return Date.UTC(date.getUTCFullYear(), 0, 1) - DAY;
  const months = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 }[range];
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

/** Anchor to the last supplied observation, not today's clock (which may be stale). */
export function availableRanges(data: Observation[]): TimeRange[] {
  if (data.length < 2) return [];
  const first = timestamp(data[0].date);
  const last = data.at(-1)!.date;
  return RANGES.filter(
    (range) => range === "ALL" || first <= rangeStart(last, range),
  );
}

export function selectRange(
  data: Observation[],
  range: TimeRange,
): Observation[] {
  if (range === "ALL" || data.length < 2) return data;
  const cutoff = rangeStart(data.at(-1)!.date, range);
  // Base at the last available close on/before the cutoff, including weekends/holidays.
  let base = 0;
  for (let i = 0; i < data.length && timestamp(data[i].date) <= cutoff; i++)
    base = i;
  return data.slice(base);
}

export function performance(data: Observation[]): PerformancePoint[] {
  const base = data[0]?.values ?? {};
  return data.map((point) => ({
    ...point,
    time: timestamp(point.date),
    returns: Object.fromEntries(
      Object.entries(point.values).map(([key, value]) => {
        const start = base[key];
        return [
          key,
          value !== null && start != null && start > 0
            ? (value / start - 1) * 100
            : null,
        ];
      }),
    ),
  }));
}

/** Snap to actual observations, including on an irregular calendar. */
export function nearestPoint(data: PerformancePoint[], time: number): number {
  let low = 0;
  let high = data.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (data[mid].time < time) low = mid + 1;
    else high = mid;
  }
  return low > 0 && time - data[low - 1].time <= data[low].time - time
    ? low - 1
    : low;
}
