import { fmtAccounting, fmtChangeMoney, fmtUsd } from "@/lib/format";

/** Invented review fixtures. Never imported by production portfolio loaders or calculation engines. */
export const NAV = 4_820_000;
export const CASH_WEIGHT = 7;
export type Holding = {
  ticker: string;
  name: string;
  sector: string;
  weight: number;
  price: number;
  day: number;
  period: number;
  vol: number;
  beta: number;
  risk: number;
  color: string;
};
export const HOLDINGS: Holding[] = [
  {
    ticker: "MSFT",
    name: "Microsoft",
    sector: "Technology",
    weight: 14,
    price: 512.4,
    day: 1.12,
    period: 3.2,
    vol: 22.1,
    beta: 1.08,
    risk: 17,
    color: "#5776a8",
  },
  {
    ticker: "GOOG",
    name: "Alphabet",
    sector: "Consumer & communication",
    weight: 12,
    price: 291.6,
    day: 0.86,
    period: 1.4,
    vol: 25.2,
    beta: 1.16,
    risk: 14,
    color: "#826d9e",
  },
  {
    ticker: "NVDA",
    name: "NVIDIA",
    sector: "Technology",
    weight: 10,
    price: 182.3,
    day: -1.64,
    period: -2.1,
    vol: 43.8,
    beta: 1.72,
    risk: 23,
    color: "#698b54",
  },
  {
    ticker: "JPM",
    name: "JPMorgan Chase",
    sector: "Financials",
    weight: 9,
    price: 305.2,
    day: 0.34,
    period: 0.6,
    vol: 20.4,
    beta: 1.02,
    risk: 9,
    color: "#52838b",
  },
  {
    ticker: "AMZN",
    name: "Amazon",
    sector: "Consumer & communication",
    weight: 8,
    price: 244.8,
    day: 0.52,
    period: 1.8,
    vol: 28.3,
    beta: 1.22,
    risk: 10,
    color: "#ab8855",
  },
  {
    ticker: "KKR",
    name: "KKR & Co.",
    sector: "Financials",
    weight: 8,
    price: 136.9,
    day: -1.08,
    period: -1.2,
    vol: 31.1,
    beta: 1.31,
    risk: 11,
    color: "#8e6588",
  },
  {
    ticker: "UNH",
    name: "UnitedHealth",
    sector: "Healthcare",
    weight: 7,
    price: 331.5,
    day: 0.16,
    period: 1.1,
    vol: 24.6,
    beta: 0.72,
    risk: 5,
    color: "#638595",
  },
  {
    ticker: "CRM",
    name: "Salesforce",
    sector: "Technology",
    weight: 7,
    price: 267.2,
    day: 0.63,
    period: 1.9,
    vol: 29.1,
    beta: 1.14,
    risk: 5,
    color: "#5a91ad",
  },
  {
    ticker: "ABBV",
    name: "AbbVie",
    sector: "Healthcare",
    weight: 6,
    price: 221.8,
    day: 0.28,
    period: 2.6,
    vol: 18.8,
    beta: 0.61,
    risk: 2,
    color: "#778eaa",
  },
  {
    ticker: "CAT",
    name: "Caterpillar",
    sector: "Industrials",
    weight: 5,
    price: 434.5,
    day: -0.46,
    period: -0.8,
    vol: 24.5,
    beta: 1.09,
    risk: 2,
    color: "#a38c4e",
  },
  {
    ticker: "GE",
    name: "GE Aerospace",
    sector: "Industrials",
    weight: 4,
    price: 287.6,
    day: 0.42,
    period: 1.7,
    vol: 26.1,
    beta: 1.12,
    risk: 1,
    color: "#547098",
  },
  {
    ticker: "COST",
    name: "Costco",
    sector: "Consumer & communication",
    weight: 3,
    price: 936.2,
    day: -0.12,
    period: 2.2,
    vol: 19.2,
    beta: 0.68,
    risk: 1,
    color: "#ab6973",
  },
];
export const SECTORS = [
  { name: "Technology", benchmark: 33, color: "#426d59" },
  { name: "Consumer & communication", benchmark: 21, color: "#8aa397" },
  { name: "Financials", benchmark: 14, color: "#b2c7bc" },
  { name: "Healthcare", benchmark: 11, color: "#a49d81" },
  { name: "Industrials", benchmark: 9, color: "#c0bba7" },
  { name: "Other benchmark sectors", benchmark: 12, color: "#cdd3cf" },
];
export const PERIODS = {
  ledger: {
    label: "Since Sep 17",
    dates: "Sep 17 – Sep 29, 2026",
    benchmark: 1.12,
  },
  day: {
    label: "Last session",
    dates: "Sep 29, 2026 · close to close",
    benchmark: 0.17,
  },
} as const;
export type Period = keyof typeof PERIODS;
export const contribution = (h: Holding, period: Period) =>
  h.weight * (period === "day" ? h.day : h.period); // basis points
export const fundReturn = (period: Period) =>
  HOLDINGS.reduce((s, h) => s + contribution(h, period), 0) / 100;
export const sectorWeight = (name: string) =>
  HOLDINGS.filter((h) => h.sector === name).reduce((s, h) => s + h.weight, 0);
export const money = fmtUsd;
export const signed = fmtChangeMoney;

/** Allocation arithmetic only. Risk and forward returns require the real engines and are not estimated by this mock. */
export function allocationChange(
  ticker: string,
  target: number,
  source: string,
) {
  const holding = HOLDINGS.find((h) => h.ticker === ticker);
  const funding = HOLDINGS.find((h) => h.ticker === source);
  if (!holding || !Number.isFinite(target) || target < 0 || target > 100)
    return {
      ok: false as const,
      error: "Enter a target weight between 0% and 100%.",
    };
  if (source === ticker || (source !== "cash" && !funding))
    return {
      ok: false as const,
      error: "Choose a different holding or cash to fund the change.",
    };
  const delta = target - holding.weight;
  const available = funding?.weight ?? CASH_WEIGHT;
  const afterFunding = available - delta;
  if (afterFunding < 0 || afterFunding > 100)
    return {
      ok: false as const,
      error: `This change needs ${fmtAccounting(delta, 1)} percentage points; ${source === "cash" ? "cash" : source} has ${fmtAccounting(available, 1)}%.`,
    };
  const weights = HOLDINGS.map((h) => ({
    ...h,
    nextWeight:
      h.ticker === ticker
        ? target
        : h.ticker === source
          ? afterFunding
          : h.weight,
  }));
  return {
    ok: true as const,
    delta,
    afterFunding,
    cash: source === "cash" ? afterFunding : CASH_WEIGHT,
    weights,
  };
}
