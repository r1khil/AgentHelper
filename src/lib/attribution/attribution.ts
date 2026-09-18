import { brinsonDay } from "./brinson";
import { carinoDetail, compound, priorGrowth } from "./linking";
import { GICS_SECTORS, type BucketKey, type GicsSector } from "./sectors";
import type { BenchmarkDay, BucketInput, DayPosition, Effects, PortfolioDay, SecurityMeta } from "./types";

export type AttributionSeries = {
  portfolio: PortfolioDay[];
  /** Empty until benchmark sector weights are saved. */
  benchmark: BenchmarkDay[];
  meta: Map<string, SecurityMeta>;
};

export type SectorRow = Effects & {
  key: BucketKey;
  avgPortfolioWeight: number;
  avgBenchmarkWeight: number;
  portfolioReturn: number | null;
  benchmarkReturn: number | null;
  contribution: number;
  total: number;
};

export type HoldingRow = {
  ticker: string;
  name: string;
  sector: GicsSector | null;
  teamId: string | null;
  avgWeight: number;
  ret: number;
  contribution: number;
};

export type TeamRow = { teamId: string | null; avgWeight: number; ret: number; contribution: number };

export type CumulativePoint = { date: string; portfolio: number; benchmark: number | null; active: number | null };

export type AttributionResult = {
  start: string;
  end: string;
  days: number;
  portfolioReturn: number;
  benchmarkReturn: number | null;
  activeReturn: number | null;
  effects: Effects | null;
  sectors: SectorRow[];
  holdings: HoldingRow[];
  teams: TeamRow[];
  cashContribution: number;
  cumulative: CumulativePoint[];
  /** Per-day working behind every sector row; only built when requested (transparency mode). */
  breakdown?: AttributionBreakdown;
};

export type BreakdownPosition = {
  ticker: string;
  weight: number;
  ret: number;
  contribution: number;
  /** Dollar P&L for the day (fund level, not renormalised), when known. */
  pnl: number | null;
  priced: DayPosition["priced"] | null;
};

/** One sector on one day: the Brinson inputs, the raw one-day effects, and how Carino scaled them. */
export type SectorDayBreakdown = {
  date: string;
  /** Sector weight in the sleeve and its one-day return (contribution / weight). */
  wp: number;
  rp: number;
  /** Portfolio growth before this day; daily contributions are scaled by it. */
  growth: number;
  contributionRaw: number;
  contributionScaled: number;
  positions: BreakdownPosition[];
  bench: {
    wb: number;
    rb: number;
    /** Whole-benchmark return that day. */
    Rb: number;
    /** `rb` was borrowed from `rp` (sector absent from the benchmark) or `rp` from `rb` (sector not held). */
    borrowed: "rb" | "rp" | null;
    raw: Effects;
    coef: number;
    scaled: Effects;
  } | null;
};

export type SectorBreakdown = { key: BucketKey; days: SectorDayBreakdown[]; sums: Effects & { contribution: number } };

export type AttributionBreakdown = {
  linking: {
    Rp: number;
    Rb: number | null;
    K: number | null;
    days: { date: string; rp: number; rb: number | null; k: number | null; coef: number | null; growth: number }[];
  };
  sectors: SectorBreakdown[];
};

export type AttributionOptions = { breakdown?: boolean };

/** One day, already expressed as weights that sum to 1 and contributions that sum to `rp`. */
type SleeveDay = {
  date: string;
  rp: number;
  positions: { ticker: string; weight: number; ret: number; contribution: number; pnl?: number; priced?: DayPosition["priced"] }[];
  cash: { weight: number; contribution: number } | null;
  bench: { weights: Partial<Record<GicsSector, number>>; returns: Record<GicsSector, number>; ret: number } | null;
};

function bucketOf(meta: Map<string, SecurityMeta>, ticker: string): BucketKey {
  return meta.get(ticker)?.sector ?? "unclassified";
}

function attribute(days: SleeveDay[], meta: Map<string, SecurityMeta>, range: { start: string; end: string }, opts: AttributionOptions = {}): AttributionResult {
  const hasBench = days.length > 0 && days.every((d) => d.bench);
  const rps = days.map((d) => d.rp);
  const growth = priorGrowth(rps);
  const carino = hasBench ? carinoDetail(days.map((d) => ({ rp: d.rp, rb: d.bench!.ret }))) : null;
  const coef = carino?.coef ?? [];
  const n = days.length;
  const breakdown = opts.breakdown ? new Map<BucketKey, SectorDayBreakdown[]>() : null;

  type SectorAcc = Effects & { wp: number; wb: number; contribution: number; rpGrowth: number; rbGrowth: number; held: boolean; inBench: boolean };
  const sectors = new Map<BucketKey, SectorAcc>();
  const sectorAcc = (k: BucketKey) => {
    let a = sectors.get(k);
    if (!a) sectors.set(k, (a = { allocation: 0, selection: 0, interaction: 0, wp: 0, wb: 0, contribution: 0, rpGrowth: 1, rbGrowth: 1, held: false, inBench: false }));
    return a;
  };
  const holdings = new Map<string, { weight: number; growth: number; contribution: number }>();
  const teams = new Map<string | null, { weight: number; growth: number; contribution: number }>();
  let cashContribution = 0;

  const cumulative: CumulativePoint[] = [{ date: range.start, portfolio: 0, benchmark: hasBench ? 0 : null, active: hasBench ? 0 : null }];
  let gp = 1;
  let gb = 1;

  days.forEach((day, i) => {
    const port: Partial<Record<BucketKey, { w: number; c: number }>> = {};
    const teamDay = new Map<string | null, { w: number; c: number }>();
    for (const p of day.positions) {
      const key = bucketOf(meta, p.ticker);
      const b = (port[key] ??= { w: 0, c: 0 });
      b.w += p.weight;
      b.c += p.contribution;

      const h = holdings.get(p.ticker) ?? { weight: 0, growth: 1, contribution: 0 };
      h.weight += p.weight;
      h.growth *= 1 + p.ret;
      h.contribution += p.contribution * growth[i];
      holdings.set(p.ticker, h);

      const teamId = meta.get(p.ticker)?.teamId ?? null;
      const t = teamDay.get(teamId) ?? { w: 0, c: 0 };
      t.w += p.weight;
      t.c += p.contribution;
      teamDay.set(teamId, t);
    }
    for (const [teamId, t] of teamDay) {
      const acc = teams.get(teamId) ?? { weight: 0, growth: 1, contribution: 0 };
      acc.weight += t.w;
      if (t.w > 0) acc.growth *= 1 + t.c / t.w;
      acc.contribution += t.c * growth[i];
      teams.set(teamId, acc);
    }
    if (day.cash) {
      port.cash = { w: day.cash.weight, c: day.cash.contribution };
      cashContribution += day.cash.contribution * growth[i];
    }

    const portInput: Partial<Record<BucketKey, BucketInput>> = {};
    for (const [k, v] of Object.entries(port) as [BucketKey, { w: number; c: number }][]) {
      portInput[k] = { weight: v.w, ret: v.w !== 0 ? v.c / v.w : 0 };
      const acc = sectorAcc(k);
      acc.wp += v.w;
      acc.contribution += v.c * growth[i];
      if (v.w > 0) { acc.rpGrowth *= 1 + v.c / v.w; acc.held = true; }
    }

    const positionsOf = (k: BucketKey): BreakdownPosition[] =>
      day.positions
        .filter((p) => bucketOf(meta, p.ticker) === k)
        .map((p) => ({ ticker: p.ticker, weight: p.weight, ret: p.ret, contribution: p.contribution, pnl: p.pnl ?? null, priced: p.priced ?? null }));
    const pushDay = (k: BucketKey, bench: SectorDayBreakdown["bench"]) => {
      if (!breakdown) return;
      const v = port[k];
      const row: SectorDayBreakdown = {
        date: day.date,
        wp: v?.w ?? 0,
        rp: v && v.w !== 0 ? v.c / v.w : (bench?.rb ?? 0),
        growth: growth[i],
        contributionRaw: v?.c ?? 0,
        contributionScaled: (v?.c ?? 0) * growth[i],
        positions: k === "cash" ? [] : positionsOf(k),
        bench,
      };
      breakdown.set(k, [...(breakdown.get(k) ?? []), row]);
    };

    if (hasBench && day.bench) {
      const benchInput: Partial<Record<BucketKey, BucketInput>> = {};
      for (const s of GICS_SECTORS) {
        const w = day.bench.weights[s] ?? 0;
        if (w <= 0) continue;
        benchInput[s] = { weight: w, ret: day.bench.returns[s] };
        const acc = sectorAcc(s);
        acc.wb += w;
        acc.rbGrowth *= 1 + day.bench.returns[s];
        acc.inBench = true;
      }
      const effects = brinsonDay(portInput, benchInput, day.bench.ret);
      for (const [k, e] of Object.entries(effects) as [BucketKey, (typeof effects)[BucketKey] & Effects][]) {
        const acc = sectorAcc(k);
        acc.allocation += e.allocation * coef[i];
        acc.selection += e.selection * coef[i];
        acc.interaction += e.interaction * coef[i];
        if (breakdown) {
          const raw = { allocation: e.allocation, selection: e.selection, interaction: e.interaction };
          pushDay(k, {
            wb: e.wb,
            rb: e.rb,
            Rb: day.bench.ret,
            borrowed: e.wb === 0 ? "rb" : e.wp === 0 ? "rp" : null,
            raw,
            coef: coef[i],
            scaled: { allocation: raw.allocation * coef[i], selection: raw.selection * coef[i], interaction: raw.interaction * coef[i] },
          });
        }
      }
      gb *= 1 + day.bench.ret;
    } else if (breakdown) {
      for (const k of Object.keys(port) as BucketKey[]) pushDay(k, null);
    }
    gp *= 1 + day.rp;
    cumulative.push({ date: day.date, portfolio: gp - 1, benchmark: hasBench ? gb - 1 : null, active: hasBench ? gp - gb : null });
  });

  const order: BucketKey[] = [...GICS_SECTORS, "unclassified", "cash"];
  const sectorRows: SectorRow[] = order
    .filter((k) => sectors.has(k))
    .map((key) => {
      const a = sectors.get(key)!;
      return {
        key,
        avgPortfolioWeight: n ? a.wp / n : 0,
        avgBenchmarkWeight: n ? a.wb / n : 0,
        portfolioReturn: a.held ? a.rpGrowth - 1 : null,
        benchmarkReturn: a.inBench ? a.rbGrowth - 1 : null,
        contribution: a.contribution,
        allocation: a.allocation,
        selection: a.selection,
        interaction: a.interaction,
        total: a.allocation + a.selection + a.interaction,
      };
    });

  const totals = sectorRows.reduce<Effects>(
    (s, r) => ({ allocation: s.allocation + r.allocation, selection: s.selection + r.selection, interaction: s.interaction + r.interaction }),
    { allocation: 0, selection: 0, interaction: 0 },
  );
  const portfolioReturn = compound(rps);
  const benchmarkReturn = hasBench ? gb - 1 : null;

  const breakdownOut: AttributionBreakdown | undefined = breakdown
    ? {
        linking: {
          Rp: portfolioReturn,
          Rb: carino ? carino.Rb : null,
          K: carino ? carino.K : null,
          days: days.map((d, i) => ({ date: d.date, rp: d.rp, rb: carino ? d.bench!.ret : null, k: carino ? carino.k[i] : null, coef: carino ? carino.coef[i] : null, growth: growth[i] })),
        },
        sectors: order
          .filter((k) => breakdown.has(k))
          .map((key) => {
            const rows = breakdown.get(key)!;
            const sums = rows.reduce(
              (s, r) => ({
                allocation: s.allocation + (r.bench?.scaled.allocation ?? 0),
                selection: s.selection + (r.bench?.scaled.selection ?? 0),
                interaction: s.interaction + (r.bench?.scaled.interaction ?? 0),
                contribution: s.contribution + r.contributionScaled,
              }),
              { allocation: 0, selection: 0, interaction: 0, contribution: 0 },
            );
            return { key, days: rows, sums };
          }),
      }
    : undefined;

  return {
    start: range.start,
    end: range.end,
    days: n,
    portfolioReturn,
    benchmarkReturn,
    activeReturn: benchmarkReturn === null ? null : portfolioReturn - benchmarkReturn,
    effects: hasBench ? totals : null,
    sectors: sectorRows,
    holdings: [...holdings.entries()]
      .map(([ticker, h]) => ({
        ticker,
        name: meta.get(ticker)?.name ?? ticker,
        sector: meta.get(ticker)?.sector ?? null,
        teamId: meta.get(ticker)?.teamId ?? null,
        avgWeight: n ? h.weight / n : 0,
        ret: h.growth - 1,
        contribution: h.contribution,
      }))
      .sort((a, b) => b.contribution - a.contribution),
    teams: [...teams.entries()]
      .map(([teamId, t]) => ({ teamId, avgWeight: n ? t.weight / n : 0, ret: t.growth - 1, contribution: t.contribution }))
      .sort((a, b) => b.contribution - a.contribution),
    cashContribution,
    cumulative,
    ...(breakdownOut ? { breakdown: breakdownOut } : {}),
  };
}

function inRange<T extends { date: string }>(days: T[], range: { start: string; end: string }) {
  return days.filter((d) => d.date > range.start && d.date <= range.end);
}

/** Fund-level attribution over (start, end]. */
export function computeAttribution(series: AttributionSeries, range: { start: string; end: string }, opts: AttributionOptions = {}): AttributionResult {
  const benchByDate = new Map(series.benchmark.map((b) => [b.date, b]));
  const days: SleeveDay[] = inRange(series.portfolio, range).map((d) => ({
    date: d.date,
    rp: d.ret,
    positions: d.positions,
    cash: { weight: d.cashWeight, contribution: d.cashContribution },
    bench: benchByDate.get(d.date) ?? null,
  }));
  return attribute(days, series.meta, range, opts);
}

export type TeamAttributionResult = AttributionResult & {
  /** The team's holdings' share of the whole fund's return over the period. */
  fundContribution: number;
  avgFundWeight: number;
};

/**
 * A team's sleeve: its holdings renormalised to 100% (no cash), against the benchmark
 * renormalised over the sectors assigned to the team.
 */
export function computeTeamAttribution(
  series: AttributionSeries,
  range: { start: string; end: string },
  teamId: string,
  teamSectors: GicsSector[],
  opts: AttributionOptions = {},
): TeamAttributionResult {
  const benchByDate = new Map(series.benchmark.map((b) => [b.date, b]));
  const fundDays = inRange(series.portfolio, range);
  const fundGrowth = priorGrowth(fundDays.map((d) => d.ret));
  let fundContribution = 0;
  let fundWeight = 0;

  const days: SleeveDay[] = [];
  fundDays.forEach((d, i) => {
    const mine = d.positions.filter((p) => series.meta.get(p.ticker)?.teamId === teamId);
    const W = mine.reduce((s, p) => s + p.weight, 0);
    const C = mine.reduce((s, p) => s + p.contribution, 0);
    fundContribution += C * fundGrowth[i];
    fundWeight += W;
    // Days the team holds nothing are left out of its sleeve.
    if (W <= 0) return;

    let bench: SleeveDay["bench"] = null;
    const b = benchByDate.get(d.date);
    const WB = b ? teamSectors.reduce((s, k) => s + b.weights[k], 0) : 0;
    if (b && WB > 0) {
      const weights: Partial<Record<GicsSector, number>> = {};
      let ret = 0;
      for (const k of teamSectors) {
        weights[k] = b.weights[k] / WB;
        ret += (b.weights[k] / WB) * b.returns[k];
      }
      bench = { weights, returns: b.returns, ret };
    }
    days.push({
      date: d.date,
      rp: C / W,
      positions: mine.map((p) => ({ ticker: p.ticker, weight: p.weight / W, ret: p.ret, contribution: p.contribution / W, pnl: p.pnl, priced: p.priced })),
      cash: null,
      bench,
    });
  });

  const result = attribute(days, series.meta, range, opts);
  return { ...result, fundContribution, avgFundWeight: fundDays.length ? fundWeight / fundDays.length : 0 };
}
