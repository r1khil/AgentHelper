import type { CashFlow, DateSeries, DayPosition, LedgerQuality, PortfolioDay, Split, Trade } from "./types";

const EPS_SHARES = 1e-4;

/**
 * Restate trades on today's split basis so they line up with split-adjusted closes.
 * A split on the trade date itself is already in the executed price.
 */
export function adjustForSplits(trades: Trade[], splits: Split[]): Trade[] {
  if (!splits.length) return trades;
  return trades.map((t) => {
    let factor = 1;
    for (const s of splits) if (s.ticker === t.ticker && s.date > t.date && s.ratio > 0) factor *= s.ratio;
    return factor === 1 ? t : { ...t, shares: t.shares * factor, price: t.price / factor };
  });
}

export type LedgerIssue = { level: "error" | "warning"; message: string };

/** Date rules only. Oversells need prices and dividends, so they come from buildPortfolioDays. */
export function validateLedger(
  trades: Trade[],
  cashFlows: CashFlow[],
  opts: { today: string; isTradingDay: (isoDate: string) => boolean },
): LedgerIssue[] {
  const issues: LedgerIssue[] = [];
  for (const t of trades) {
    if (t.date > opts.today) issues.push({ level: "error", message: `${t.ticker} trade on ${t.date} is in the future.` });
    else if (!opts.isTradingDay(t.date)) issues.push({ level: "error", message: `${t.date} is not a trading day.` });
  }
  for (const f of cashFlows) {
    if (f.date > opts.today) issues.push({ level: "error", message: `Cash flow on ${f.date} is in the future.` });
  }
  return issues;
}

function bucketByDay<T extends { date: string }>(items: T[], days: string[]): Map<string, T[]> {
  // Anything dated on a non-valuation day settles on the next valuation day.
  const out = new Map<string, T[]>();
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  let i = 0;
  for (const day of days) {
    const bucket: T[] = [];
    while (i < sorted.length && sorted[i].date <= day) bucket.push(sorted[i++]);
    if (bucket.length) out.set(day, bucket);
  }
  return out;
}

function lastCloseBefore(series: Map<string, number> | undefined, date: string): number | undefined {
  if (!series) return undefined;
  let best: string | undefined;
  for (const d of series.keys()) if (d < date && (best === undefined || d > best)) best = d;
  return best === undefined ? undefined : series.get(best);
}

/**
 * Replays the ledger into one record per valuation day.
 *
 * Convention: external flows and buys happen at the start of the day (buys at trade price),
 * sells at the end of the day. Weights are taken on D = prior NAV + external flow, so position
 * contributions plus the cash contribution add up to the day's NAV return exactly.
 * Dividends reinvest on the ex-date at that day's close, for shares held coming into the day.
 */
export function buildPortfolioDays(input: {
  trades: Trade[];
  cashFlows: CashFlow[];
  prices: DateSeries;
  dividends: DateSeries;
  days: string[];
}): { days: PortfolioDay[]; quality: LedgerQuality } {
  const { prices, dividends, days } = input;
  const quality: LedgerQuality = { stale: [], unpriced: [], oversold: [] };
  const tradesByDay = bucketByDay(input.trades, days);
  const flowsByDay = bucketByDay(input.cashFlows, days);

  const shares = new Map<string, number>();
  const lastClose = new Map<string, number>();
  let cash = 0;
  let navPrev = 0;
  const out: PortfolioDay[] = [];

  for (const date of days) {
    const flows = flowsByDay.get(date) ?? [];
    let extFlow = 0;
    let cashPnl = 0;
    for (const f of flows) {
      if (f.kind === "deposit") extFlow += f.amount;
      else if (f.kind === "withdrawal") extFlow -= f.amount;
      else if (f.kind === "interest") cashPnl += f.amount;
      else cashPnl -= f.amount;
    }
    const D = navPrev + extFlow;

    const dayTrades = tradesByDay.get(date) ?? [];
    const tickers = new Set<string>([...shares.keys()]);
    for (const t of dayTrades) tickers.add(t.ticker);

    const positions: DayPosition[] = [];
    let cashDelta = extFlow + cashPnl;
    let basisTotal = 0;
    let holdingsValue = 0;

    for (const ticker of [...tickers].sort()) {
      const sharesStart = shares.get(ticker) ?? 0;
      const mine = dayTrades.filter((t) => t.ticker === ticker);
      if (sharesStart <= 0 && !mine.length) continue;

      let buyShares = 0, buyCost = 0, sellShares = 0, sellProceeds = 0, fees = 0, lastPrice: number | undefined;
      for (const t of mine) {
        if (t.side === "buy") { buyShares += t.shares; buyCost += t.shares * t.price; }
        else { sellShares += t.shares; sellProceeds += t.shares * t.price; }
        fees += t.fees;
        lastPrice = t.price;
      }

      let prevClose = lastClose.get(ticker);
      if (prevClose === undefined && sharesStart > 0) prevClose = lastCloseBefore(prices.get(ticker), date);
      let close = prices.get(ticker)?.get(date);
      if (close === undefined) {
        if (prevClose !== undefined) { close = prevClose; quality.stale.push({ ticker, date }); }
        else { close = lastPrice ?? 0; if (!quality.unpriced.includes(ticker)) quality.unpriced.push(ticker); }
      }
      const startValue = sharesStart * (prevClose ?? close);

      const div = sharesStart > 0 ? (dividends.get(ticker)?.get(date) ?? 0) : 0;
      const drip = div > 0 && close > 0 ? (sharesStart * div) / close : 0;

      let sharesEnd = sharesStart + drip + buyShares - sellShares;
      if (sharesEnd < -EPS_SHARES) quality.oversold.push({ ticker, date, shares: -sharesEnd });
      if (Math.abs(sharesEnd) < EPS_SHARES || sharesEnd < 0) sharesEnd = 0;

      const valueEnd = sharesEnd * close;
      const basis = startValue + buyCost;
      const pnl = valueEnd - startValue - buyCost + sellProceeds - fees;
      cashDelta += sellProceeds - buyCost - fees;
      basisTotal += basis;
      holdingsValue += valueEnd;

      positions.push({
        ticker,
        weight: D > 0 ? basis / D : 0,
        ret: basis > 0 ? pnl / basis : 0,
        contribution: D > 0 ? pnl / D : 0,
        pnl,
        sharesEnd,
        valueEnd,
      });

      if (sharesEnd > 0) shares.set(ticker, sharesEnd);
      else shares.delete(ticker);
      lastClose.set(ticker, close);
    }

    cash += cashDelta;
    const navEnd = cash + holdingsValue;
    out.push({
      date,
      navStart: navPrev,
      navEnd,
      extFlow,
      ret: D > 0 ? (navEnd - navPrev - extFlow) / D : 0,
      cashWeight: D > 0 ? (D - basisTotal) / D : 0,
      cashContribution: D > 0 ? cashPnl / D : 0,
      cashEnd: cash,
      positions,
    });
    navPrev = navEnd;
  }

  return { days: out, quality };
}

/** Shares, value and weight per ticker at the end of the last valuation day. */
export function latestPositions(days: PortfolioDay[]): { ticker: string; shares: number; value: number; weight: number }[] {
  const last = days.at(-1);
  if (!last || last.navEnd <= 0) return [];
  return last.positions
    .filter((p) => p.sharesEnd > 0)
    .map((p) => ({ ticker: p.ticker, shares: p.sharesEnd, value: p.valueEnd, weight: p.valueEnd / last.navEnd }));
}
