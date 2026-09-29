import "server-only";
import { DateTime } from "luxon";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { parsePeriodKey, resolvePeriod, type ResolvedPeriod } from "./periods";
import { SECTOR_LABELS } from "./sectors";
import type { LoadedSeries } from "./store";

export type PageQuery = { period?: string | string[]; from?: string | string[]; to?: string | string[]; all?: string | string[] };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function periodFromQuery(query: PageQuery, loaded: { inception: string; latest: string }): { period: ResolvedPeriod; queryString: string; from?: string; to?: string } {
  const key = parsePeriodKey(one(query.period));
  const from = one(query.from);
  const to = one(query.to);
  const period = resolvePeriod(key, { from, to, inception: loaded.inception, latest: loaded.latest });
  const params = new URLSearchParams({ period: key });
  if (key === "custom") {
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }
  return { period, queryString: `?${params}`, from, to };
}

/** Plain-language data problems, each pointing at where to fix it. */
export function qualityNotices(loaded: LoadedSeries, period: ResolvedPeriod, opts: { canEdit: boolean }) {
  const out: { text: string; href?: string; action?: string; word?: "Stale" | "Missing" | "Check" | "Partial" }[] = [];
  const ledger = opts.canEdit ? `/t/${FUND_SCOPE_SLUG}/activity` : undefined;
  if (period.clamped) out.push({ text: `The ledger starts on ${fmtDate(loaded.inception)}, so this period is measured from that date.` });

  const inPeriod = <T extends { date: string }>(xs: T[]) => xs.filter((x) => x.date > period.start && x.date <= period.end);
  const stale = [...new Set(inPeriod(loaded.quality.ledger.stale).map((s) => s.ticker))];
  if (stale.length) out.push({ text: `Missing closes for ${stale.join(", ")} were filled with that day's trade price or the prior close.` });
  if (loaded.quality.ledger.unpriced.length) out.push({ text: `No price history yet for ${loaded.quality.ledger.unpriced.join(", ")}; valued at trade price until the next price run.` });
  const staleEtf = [...new Set(inPeriod(loaded.quality.benchmark.staleEtf).map((s) => s.ticker))];
  if (staleEtf.length) out.push({ text: `Benchmark closes are missing for ${staleEtf.join(", ")}.` });

  const lastSet = loaded.weightSets.at(-1);
  if (!lastSet) {
    out.push({ text: "No S&P 500 sector weights saved, so allocation and selection cannot be calculated.", href: ledger ? `${ledger}?tab=benchmark` : undefined, action: "Add weights" });
  } else {
    if (loaded.quality.benchmark.beforeFirstWeights && lastSet && loaded.weightSets[0].asOf >= period.start) {
      out.push({ text: `Benchmark weights start ${fmtDate(loaded.weightSets[0].asOf)}; earlier days use that first set.` });
    }
    const age = Math.floor(DateTime.fromISO(period.end).diff(DateTime.fromISO(lastSet.asOf), "days").days);
    if (age > 100) out.push({ text: `Benchmark weights were saved ${fmtDate(lastSet.asOf)}, ${age} days ago. These numbers use them until an exec saves a new set.`, href: ledger ? `${ledger}?tab=benchmark` : undefined, action: "Update weights", word: "Stale" });
  }

  const held = new Set(loaded.series.portfolio.filter((d) => d.date > period.start && d.date <= period.end).flatMap((d) => d.positions.map((p) => p.ticker)));
  const unclassified = [...held].filter((t) => !loaded.series.meta.get(t)?.sector);
  if (unclassified.length) out.push({ text: `No sector set for ${unclassified.join(", ")}.`, href: ledger ? `${ledger}?tab=securities` : undefined, action: "Classify" });
  return out;
}

export function sectorEffectPoints(result: { sectors: { key: keyof typeof SECTOR_LABELS | "cash" | "unclassified"; allocation: number; selection: number; interaction: number; total: number }[] }) {
  return result.sectors.map((s) => ({
    sector: s.key === "cash" ? "Cash" : s.key === "unclassified" ? "Unclassified" : SECTOR_LABELS[s.key],
    allocation: s.allocation * 10_000,
    selection: s.selection * 10_000,
    interaction: s.interaction * 10_000,
    total: s.total * 10_000,
  }));
}

/** S&P 500 index price return over (start, end]. Null until closes for both ends are stored. */
export function indexReturn(loaded: Pick<LoadedSeries, "index">, period: Pick<ResolvedPeriod, "start" | "end">): number | null {
  const base = loaded.index.get(period.start);
  const end = loaded.index.get(period.end);
  if (base === undefined || end === undefined || base <= 0) return null;
  return end / base - 1;
}

/** Cumulative index return at each date from the period's base close; null where a close is missing. */
export function indexCumulative(loaded: Pick<LoadedSeries, "index">, period: Pick<ResolvedPeriod, "start">, dates: string[]): (number | null)[] {
  const base = loaded.index.get(period.start);
  return dates.map((d) => {
    if (base === undefined || base <= 0) return null;
    if (d === period.start) return 0;
    const close = loaded.index.get(d);
    return close === undefined ? null : close / base - 1;
  });
}

/** SPY total return over the period, shown beside the constructed benchmark as a sanity check. */
export function referenceReturn(loaded: LoadedSeries, period: ResolvedPeriod): number | null {
  const base = loaded.reference.get(period.start);
  if (!base) return null;
  let growth = 1;
  let prev = base;
  for (const d of [...loaded.reference.keys()].filter((x) => x > period.start && x <= period.end).sort()) {
    const close = loaded.reference.get(d)!;
    growth *= (close + (loaded.referenceDividends.get(d) ?? 0)) / prev;
    prev = close;
  }
  return growth - 1;
}
