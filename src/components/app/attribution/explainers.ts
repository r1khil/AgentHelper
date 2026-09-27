/** Plain-language definitions shown in tooltips on the attribution pages. */
export const EXPLAIN = {
  portfolio: "The Fund's total return over the period, including cash and reinvested dividends. Deposits and withdrawals are excluded.",
  index: "The S&P 500 index's price return over the period, from official closes. The same basis as the internal sheet and the major-movement rule.",
  benchmark: "The sector benchmark: saved S&P 500 sector weights applied to the 11 Select Sector SPDR ETFs, built so the active return can be split sector by sector. It tracks the index closely but not exactly, because the sector ETFs cap their largest holdings.",
  active: "Portfolio return minus the S&P 500's price return. Positive means the Fund beat the index. The Fund's return includes dividends and the index's doesn't, so over longer periods this flatters the Fund by about the index's dividend yield (roughly 1.3% a year); the sector benchmark comparison includes dividends on both sides.",
  allocation: "Measured against the sector benchmark. The result of sector bets. Positive when the Fund was overweight sectors that beat the index, or underweight sectors that lagged it. Holding cash shows up here.",
  selection: "Measured against the sector benchmark. The result of stock picking. Positive when the Fund's holdings in a sector beat that sector's ETF, measured at the index's sector weight.",
  interaction: "Measured against the sector benchmark. The combined effect of sizing and picking: positive when the Fund was overweight a sector where its picks also beat the sector. Usually small.",

  effectsChart: "Each bar splits a sector's impact on active return into allocation, selection and interaction. Bars to the right helped against the sector benchmark; bars to the left hurt. Sectors are sorted from most helpful to least.",
  cumulativeChart: "Growth of the Fund and the S&P 500 from the start of the period, both starting at 0%. The gap between the lines is the active return.",

  sectors: "GICS sectors. Each holding is assigned one on the Ledger page. Cash and unclassified holdings have no benchmark, so their whole effect counts as allocation.",
  avgWeight: "Average share of the Fund held in this sector across the period, measured at the start of each day.",
  benchWeight: "Average share of the S&P 500 in this sector over the period, from the saved sector weights.",
  activeWeight: "Fund weight minus index weight. Positive is an overweight.",
  sectorReturn: "Return of the Fund's holdings in this sector over the period.",
  benchReturn: "Return of the sector's Select Sector SPDR ETF, used as the index's return for this sector.",
  contribution: "How many points of the Fund's total return came from here: roughly weight times return, compounded daily. All contributions add up to the portfolio return.",
  totalEffect: "Allocation plus selection plus interaction for this sector. The column adds up to the active return against the sector benchmark.",

  holdingWeight: "Average share of the Fund in this holding over the period. Zero-weight days before a purchase or after a sale are included.",
  holdingReturn: "Total return of the holding while the Fund owned it, including reinvested dividends and any gap between trade price and that day's close.",
  contributors: "Holdings ranked by how many points they added to or took from the Fund's return. A large position with a small move can outrank a small position with a big one.",
  teams: "Each team's holdings grouped together. Contribution is in points of the whole Fund's return, so the rows plus cash add up to the portfolio return.",

  teamReturn: "Return of this team's holdings as if they were their own portfolio, scaled to 100% with no cash.",
  teamBenchmark: "Return of the S&P 500 sectors assigned to this team, weighted as they are in the index and using the sector ETFs.",
  teamSelection: "Stock picking: how the team's holdings did against their sector ETFs. Includes the interaction effect.",
  teamAllocation: "How the team spread its capital across its sectors compared with the index. Zero for a team with a single sector.",
  teamActive: "Team return minus the sector benchmark's return. Both include dividends. Positive means the team's holdings beat the S&P 500 sectors they cover.",
  teamWeight: "Average share of the Fund held in this team's holdings over the period, measured at the start of each day.",
  fundContribution: "Points of the whole Fund's return that came from this team's holdings.",

  // Transparency mode: the per-day working behind a sector row.
  breakdown: "Transparency mode. Expands the row to show the daily Brinson-Fachler inputs, the Carino scaling, the holdings behind the sector, and the stored price rows that fed the numbers.",
  wp: "Sector weight in the portfolio at the start of the day: prior value plus buys at cost, over prior NAV plus external flows.",
  wb: "Sector weight in the benchmark that day: the saved S&P 500 weight, drifted by sector returns since the weight set's as-of date.",
  rp: "The Fund's return in this sector that day: the sector's contribution divided by its weight. Borrowed from the benchmark when the sector was not held.",
  rb: "The sector ETF's total return that day (close plus dividend over the prior close). Borrowed from the portfolio when the sector is not in the benchmark, such as cash.",
  Rb: "The whole benchmark's return that day: the sum of sector weight times sector ETF return.",
  rawEffect: "One-day Brinson-Fachler effects computed from the four numbers to the left. Allocation = (wp − wb)(rb − Rb), selection = wb(rp − rb), interaction = (wp − wb)(rp − rb).",
  coef: "Carino coefficient k/K for the day. Multiplying each day's effects by it makes the daily effects add up exactly to the period's compounded active return.",
  scaledEffect: "The raw effects times the day's Carino coefficient. These columns sum to the sector row above.",
  growth: "Portfolio growth before this day. Daily contributions are multiplied by it so they add up to the compounded period return.",
  priced: "How each holding was valued that day: a stored close, the prior close carried forward (no close stored), or the trade price (no close stored at all yet).",
  lineage: "The stored rows behind this sector for the period: daily closes per ticker, dividend and split events, the sector ETF's closes, and which saved benchmark weight set was in effect on which days.",
} as const;
