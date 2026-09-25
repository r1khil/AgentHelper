import type { BucketKey, GicsSector } from "./sectors";

export type Trade = { date: string; ticker: string; side: "buy" | "sell"; shares: number; price: number; fees: number };
export type CashFlow = { date: string; kind: "deposit" | "withdrawal" | "fee" | "interest"; amount: number };
export type Split = { ticker: string; date: string; ratio: number };

/** ticker -> ISO date -> value (close, or dividend per share on its ex-date). */
export type DateSeries = Map<string, Map<string, number>>;

export type SecurityMeta = { ticker: string; name: string; sector: GicsSector | null; teamId: string | null };

export type DayPosition = {
  ticker: string;
  /** Start-of-day weight: (prior value + buys at cost) / (prior NAV + external flow). */
  weight: number;
  ret: number;
  contribution: number;
  pnl: number;
  sharesEnd: number;
  valueEnd: number;
  /** How the day's close was obtained: a real close, the prior close carried forward, or the trade price (no close at all). */
  priced: "close" | "carried" | "trade";
};

export type PortfolioDay = {
  date: string;
  navStart: number;
  navEnd: number;
  extFlow: number;
  ret: number;
  cashWeight: number;
  cashContribution: number;
  cashEnd: number;
  positions: DayPosition[];
};

export type LedgerQuality = {
  /** Held or traded but no close that day; valued at that day's trade price, else the last close carried forward. */
  stale: { ticker: string; date: string }[];
  /** No close on or before the date; valued at trade price. */
  unpriced: string[];
  oversold: { ticker: string; date: string; shares: number }[];
};

export type BenchmarkWeightSet = { asOf: string; weights: Partial<Record<GicsSector, number>> };

export type BenchmarkDay = {
  date: string;
  weights: Record<GicsSector, number>;
  returns: Record<GicsSector, number>;
  ret: number;
  /** `asOf` of the saved weight set in effect (after drift) on this day. */
  weightSetAsOf: string;
  /** Sector ETFs with no close this day whose prior close was carried forward. */
  staleEtfs: string[];
};

export type BenchmarkQuality = {
  /** Days that fall before the first saved weight set. */
  beforeFirstWeights: boolean;
  staleEtf: { ticker: string; date: string }[];
};

export type Effects = { allocation: number; selection: number; interaction: number };

export type BucketDay = Effects & { wp: number; wb: number; rp: number; rb: number };

export type BucketInput = { weight: number; ret: number };

export type { BucketKey, GicsSector };
