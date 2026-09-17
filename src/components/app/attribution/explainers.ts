/** Plain-language definitions shown in tooltips on the attribution pages. */
export const EXPLAIN = {
  portfolio: "The Fund's total return over the period, including cash and reinvested dividends. Deposits and withdrawals are excluded.",
  benchmark: "What the S&P 500 returned, built from its sector weights and the 11 Select Sector SPDR ETFs so it can be compared sector by sector.",
  active: "Portfolio return minus benchmark return. Positive means the Fund beat the index. Allocation, selection and interaction add up to this number.",
  allocation: "The result of sector bets. Positive when the Fund was overweight sectors that beat the index, or underweight sectors that lagged it. Holding cash shows up here.",
  selection: "The result of stock picking. Positive when the Fund's holdings in a sector beat that sector's ETF, measured at the index's sector weight.",
  interaction: "The combined effect of sizing and picking: positive when the Fund was overweight a sector where its picks also beat the sector. Usually small.",

  effectsChart: "Each bar splits a sector's impact on active return into allocation, selection and interaction. Bars to the right helped against the index; bars to the left hurt. Sectors are sorted from most helpful to least.",
  cumulativeChart: "Growth of the Fund and the benchmark from the start of the period, both starting at 0%. The gap between the lines is the active return.",

  sectors: "GICS sectors. Each holding is assigned one on the Ledger page. Cash and unclassified holdings have no benchmark, so their whole effect counts as allocation.",
  avgWeight: "Average share of the Fund held in this sector across the period, measured at the start of each day.",
  benchWeight: "Average share of the S&P 500 in this sector over the period, from the saved sector weights.",
  activeWeight: "Fund weight minus index weight. Positive is an overweight.",
  sectorReturn: "Return of the Fund's holdings in this sector over the period.",
  benchReturn: "Return of the sector's Select Sector SPDR ETF, used as the index's return for this sector.",
  contribution: "How many points of the Fund's total return came from here: roughly weight times return, compounded daily. All contributions add up to the portfolio return.",
  totalEffect: "Allocation plus selection plus interaction for this sector. The column adds up to the active return.",

  holdingWeight: "Average share of the Fund in this holding over the period. Zero-weight days before a purchase or after a sale are included.",
  holdingReturn: "Total return of the holding while the Fund owned it, including reinvested dividends and any gap between trade price and that day's close.",
  contributors: "Holdings ranked by how many points they added to or took from the Fund's return. A large position with a small move can outrank a small position with a big one.",
  teams: "Each team's holdings grouped together. Contribution is in points of the whole Fund's return, so the rows plus cash add up to the portfolio return.",

  teamReturn: "Return of this team's holdings as if they were their own portfolio, scaled to 100% with no cash.",
  teamBenchmark: "Return of the S&P 500 sectors assigned to this team, weighted as they are in the index and using the sector ETFs.",
  teamSelection: "Stock picking: how the team's holdings did against their sector ETFs. Includes the interaction effect.",
  teamAllocation: "How the team spread its capital across its sectors compared with the index. Zero for a team with a single sector.",
  fundContribution: "Points of the whole Fund's return that came from this team's holdings.",
} as const;
