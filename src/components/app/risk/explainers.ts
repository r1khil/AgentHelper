/** Plain-language definitions shown in tooltips on the Risk pages. Each names its formula and data source. */
export const RISK_EXPLAIN = {
  exAnte:
    "Forward-looking (holdings-based) risk: today's positions and weights, applied to each holding's daily total returns over the lookback window. It answers “how much does the portfolio we own now tend to move?”, not how the Fund itself has done.",
  vol: "Annualized volatility: the standard deviation of the portfolio's daily return, times √252. Computed as √(wᵀΣw) × √252, where w is today's weights and Σ is the sample covariance matrix of daily total returns. A 15% volatility means a typical year lands within about ±15% of its average.",
  beta: "Sensitivity to the S&P 500 (SPY total return). Each holding's beta is cov(holding, SPY) ÷ var(SPY) on daily returns; the portfolio's beta is the weighted sum. A beta of 1.1 means the portfolio has tended to move 1.1% for each 1% move in the market. Cash has a beta of 0.",
  trackingError:
    "Annualized standard deviation of the return difference between the portfolio and the sector benchmark: √(aᵀΣa) × √252, where a is the active weights (the Fund's holdings, minus the benchmark's sector ETFs at its S&P 500 sector weights). Higher means the Fund's results will differ more from the index.",
  var: "Value at risk, 1 day, 95%, historical simulation: today's weights are applied to each day in the window, and VaR is the loss on the 5th-percentile day (Excel PERCENTILE.INC). On about 1 day in 20 the portfolio would be expected to lose at least this much, if the window's days repeated.",
  es: "Expected shortfall (conditional VaR): the average loss on the days at or beyond the VaR cutoff. It says how bad the bad days are, not just where they start.",
  parametric: "Parametric VaR assumes normally distributed returns: 1.645 × the daily volatility. When historical VaR is higher, the window had fatter tails than a normal distribution.",
  stress: "A simple beta stress test: the S&P 500 falling 10% times the portfolio's beta. It ignores anything specific to individual holdings.",
  effectiveN:
    "Effective number of positions: 1 ÷ HHI, where the Herfindahl-Hirschman index (HHI) is the sum of squared position weights (rescaled to the invested portion). 29 equal positions give 29; a portfolio dominated by a few names scores far lower than its count.",
  top5: "Share of the Fund's value in its five largest positions.",
  cash: "Cash and equivalents from the ledger, as a share of NAV. Cash is modeled as riskless: it lowers volatility and beta.",

  sectorWeight: "Share of the portfolio in the sector today, from the ledger's latest positions at the last close.",
  benchWeight: "The S&P 500's weight in the sector today: the saved sector weights, drifted by the sector ETFs' returns since their as-of date (the same weights attribution uses).",
  activeWeight: "Portfolio weight minus benchmark weight. Positive is an overweight.",
  riskShare: "Share of the portfolio's total risk (variance) that comes from here. Euler decomposition: wᵢ × (Σw)ᵢ ÷ wᵀΣw. The column adds up to 100%. A holding can be small by weight but large by risk if it is volatile and moves with the rest of the portfolio; a negative share means it offsets the rest.",
  activeRiskShare:
    "Share of the tracking error (variance of active return) from this sector: its holdings plus the short position in its benchmark ETF. Adds up to 100%. Shows which active bets drive the difference from the index.",

  holdingVol: "The holding's own annualized volatility over the window: standard deviation of daily total returns × √252.",
  holdingBeta: "cov(holding, SPY) ÷ var(SPY) on daily total returns over the window.",
  corr: "Correlation of the holding's daily returns with the portfolio's. Near 1 means it moves with everything else and adds risk; near 0 or negative means it diversifies.",
  contribution: "Points of the portfolio's annualized volatility from this holding: wᵢ × (Σw)ᵢ ÷ σ, annualized. The column adds up to the portfolio's volatility.",

  correlation:
    "Pairwise correlation of daily total returns over the window for the largest holdings, grouped by sector. Dark cells are pairs that tend to move together, so they add to each other's risk rather than diversifying it.",
  realized:
    "Backward-looking (ex-post) risk measured from the Fund's own daily NAV returns in the ledger, net of deposits and withdrawals. It reflects what the Fund actually held each day, so it differs from the forward-looking numbers when positions have changed.",
  sharpe: "Annualized Sharpe ratio: mean daily return above the 13-week Treasury bill (^IRX) × 252, divided by the standard deviation of those excess returns × √252.",
  drawdown: "Decline from the highest value reached so far. The Fund's line uses its daily NAV returns; the S&P 500's uses SPY total return over the same days.",
  coverage:
    "How many days in the window each symbol has its own return for. A holding with fewer than 60 is modeled with its sector ETF (a proxy); a holding with a few missing days has those days filled with its sector ETF's return that day.",
} as const;
