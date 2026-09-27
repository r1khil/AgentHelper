/**
 * The execs' price target sheet ("Owl Fund Price Targets"): a live Google Sheet outside the app's Drive folder.
 * The app reads it and nothing else: the Drive connection's scopes (drive.readonly + drive.file) make writes impossible,
 * and the reader in `read.ts` only issues GETs against the tabs listed here.
 *
 * The allowlist lives in code on purpose: widening what Hoot can see is a reviewed change, not an Admin setting.
 */
export const PT_SHEET_FILE_ID = "1_ZJ5pUUolDZFGD-yTpKbqQtSNuVQspAlofTs3fNhhJk";

export type PtTabConfig = {
  name: string;
  /** Row holding the column labels (1-based). */
  headerRow: number;
  /** Labels that must appear in the header row; if one is missing the tab's layout changed and it is not read. */
  required: string[];
  /** What the tab holds, for the reader (and Hoot) to know where to look. */
  about: string;
};

/** Approved 2026-09-26. Left out on purpose: Credit Spreads (Hoot gets rates and spreads from FRED) and Sells/Unbought Pitches. */
export const PT_SHEET_TABS: PtTabConfig[] = [
  {
    name: "Price Targets",
    headerRow: 1,
    required: ["Ticker", "Current Price", "Cost Basis", "Target Price", "% Off Target"],
    about: "Per holding: price, cost basis, target price, % off target, return, market cap, beta, purchase date, 52-week range, earnings date, last price target, benchmark and months into the investment horizon.",
  },
  {
    name: "Portfolio Data",
    headerRow: 1,
    required: ["Ticker", "Quantity", "Current Price", "Total Position", "Owl Fund Weights", "S&P Weights"],
    about: "Per holding and sector: quantity, position value, fund vs S&P weight, over/underweight, earnings expectation, NTM P/E, contribution, beta; portfolio statistics on the right.",
  },
  {
    name: "Weightings",
    headerRow: 1,
    required: ["Ticker", "Quantity", "Total Position", "Owl Fund Weights", "Buy / Sell"],
    about: "Per holding and sector weights vs the S&P, plus the execs' trade-planning columns (buy/sell, volume, price per share, value of trade).",
  },
  {
    name: "MAG-7 Exposure",
    headerRow: 1,
    required: ["Ticker", "OF Overall Exposure", "SPX", "OF Direct Weight"],
    about: "The fund's exposure to each Magnificent 7 stock, direct and through each ETF held, vs the S&P weight.",
  },
  {
    name: "Daily Performance",
    headerRow: 2,
    required: ["All Holdings", "By Weighting", "Daily Delta"],
    about: "The day's moves: holdings and weights, the daily delta and its contributions, ETF contributions, and the S&P 500 and Dow moves. Several side-by-side blocks, not one table.",
  },
  {
    name: "Sector Performance",
    headerRow: 1,
    required: ["ETF Name", "Ticker", "1-Day Performance", "YTD Performance"],
    about: "Sector ETF returns over 1 day, 1 week, 1 month, YTD and 1 year.",
  },
  {
    name: "2025 Time-Weighted Returns",
    headerRow: 1,
    required: ["Date", "Beginning Value", "Holding Period Return (HPR)"],
    about: "Fund value by period, AUM infusions, holding-period returns and the fund's YTD performance.",
  },
];

/** Cached reads are reused for this long; the sheet is live, so keep it short. */
export const PT_SHEET_CACHE_MS = 5 * 60_000;

/** Upper bound on cells kept per tab, so a runaway paste cannot flood a chat. */
export const PT_SHEET_MAX_CELLS_PER_TAB = 25_000;
