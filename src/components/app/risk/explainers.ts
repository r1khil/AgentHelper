/** Plain-language definitions shown in tooltips on the Risk pages. Each names its formula and data source. */
export const RISK_EXPLAIN = {
  lookback:
    "How much recent history to judge today's holdings by: the last 126, 252 or 504 trading days of daily closes from Yahoo Finance. 6 months reacts fastest to the current market but is noisier; 2 years is steadier but slower to notice a change. 1 year is the usual default. Figures from the Fund's own history since inception don't change.",
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
  stressTests:
    "Historical stress tests: today's positions and weights (from the trade ledger, cash included) bought at the window's first close and held without rebalancing to its last close, using stored split-adjusted closes with dividends reinvested on their ex-dates. They replay what happened, so they show exposures a beta alone misses, such as sector bets. They are not forecasts.",
  stressFund:
    "Return of today's portfolio over the window, buy-and-hold: Σ wᵢ × (Gᵢ − 1), where wᵢ is today's weight and Gᵢ is the growth of $1 in the holding from the first close to the last, dividends reinvested. Cash earns 0%.",
  stressMarket: "SPY's total return over the same closes, dividends reinvested: the investable S&P 500.",
  stressBenchmark:
    "The sector benchmark over the window: the S&P 500 sector weights the Risk page uses today (for a team, its own sectors rescaled to 100%), each invested in its Select Sector SPDR ETF and held without rebalancing.",
  stressActive: "Portfolio return minus the sector benchmark's return over the window, in percentage points. Positive means today's bets would have held up better than the benchmark.",
  stressDollars: "The window's return applied to today's value (NAV for the Fund, the team's holdings for a team): what the same move would cost or add now.",
  stressWorst: "The three holdings with the most negative contribution: weight × the holding's return over the window. Contributions add up to the portfolio's return.",
  stressProxy:
    "Holdings with no stored close at the window's start (they had not listed yet) are stood in for by their sector ETF, or by SPY when they have no sector, for the whole window. Treating them as cash would understate the loss.",
  stressRebalanced:
    "The same starting weights rebalanced back every day, the way Backtesting replays a portfolio. Buy-and-hold lets winners grow and losers shrink, so over long windows the two can differ by a few points.",
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

  // Exposure page.
  exposure:
    "Where the portfolio's money is today compared with its benchmark, from the same positions and benchmark weights as the Risk page. Weights don't depend on the lookback window; the share of active risk does.",
  largestActiveBet:
    "The sector whose weight differs most from the benchmark's, in percentage points (portfolio weight minus benchmark weight; an underweight counts too). It is measured by sector because the benchmark is the Select Sector SPDR ETFs: against it every single stock counts as fully active, so a stock-level answer needs the index's own holdings.",
  top10: "Share of the portfolio's value in its ten largest positions, from the ledger's latest positions at the last close.",

  // ETF look-through.
  lookthrough:
    "Each ETF replaced by the stocks it holds: an ETF's weight × each constituent's weight in the ETF, added to any direct holding of the same company (share classes such as GOOG and GOOGL count as one). Holdings lists come from the issuers' daily files (State Street, iShares, First Trust, Roundhill), refreshed weekly; where an issuer can't be read, Yahoo's top 10 holdings stand in. Anything a list doesn't cover stays in “not looked through”, so the rows add back to 100%. An exposure view only: risk figures already see ETF and stock overlap through their returns.",
  lookthroughCoverage:
    "How much of each ETF its stored holdings list accounts for: the sum of the constituents' weights. Cash, T-bills held as collateral, futures and swaps on stocks that can't be named are not stocks, so a full list usually covers 99.5–100%. “Top 10 only” means the issuer's file couldn't be read and only Yahoo's largest holdings are known. A list is marked stale when it is more than two weeks older than the positions.",
  combinedExposure:
    "The company's total weight in the portfolio: what is held directly plus its share of every ETF held (ETF weight × the company's weight in that ETF).",
  notLookedThrough:
    "ETF weight that isn't matched to named stocks: the part of each ETF its list doesn't cover, and whole ETFs with no stored list. It is kept as its own row rather than spread over the names.",
  overlap: "Held directly and through at least one ETF, so the position is bigger than the direct holding alone.",
  throughEtfSectors:
    "Sector weights with each ETF split into its holdings, each stock in its own GICS sector (from the Fund's classification, then the sector SPDR that holds it, then the issuer's label). An ETF's not-looked-through part stays in the ETF's own sector and is counted as assumed. Benchmark weights are unchanged. Risk shares are measured on the ETFs as held, so they appear only in the as-held view.",
  stockActive:
    "Each company's weight in the portfolio (through the ETFs) minus its weight in the benchmark's own holdings: SPY for the Fund, a team's sector SPDRs at the team's sector weights. Positive is an overweight; a company the portfolio doesn't own is an underweight of its full index weight. In percentage points of the portfolio, cash included.",
  stockLargestBet:
    "The company whose weight differs most from its weight in the benchmark's holdings (SPY for the Fund), through the ETFs. Often an underweight in a mega-cap the portfolio doesn't own. The sector-level bet, against the sector ETFs, is shown beneath it.",
  activeShare:
    "Active Share = ½ × Σ |portfolio weight − benchmark weight| over every company in either, with each side's stock weights scaled to add to 100% (cash and the not-looked-through part are left out). 0% is an index fund; 100% shares no names with the index. Above about 60% is usually called active management.",
  overUnder:
    "The sum of all overweights and the sum of all underweights, cash included. Both sides of the book add up to 100%, so the two always cancel; either one is the share of the portfolio positioned differently from the benchmark at sector level.",

  // Factor and macro sensitivities (Exposure page).
  factors:
    "How the portfolio has moved with seven market factors over the selected window. One multivariate regression (ordinary least squares with an intercept) of each holding's daily total return on the seven factor returns at once; the portfolio's beta is the weight-sum of its holdings' betas, which equals regressing the whole portfolio's return. Size, value and momentum are spreads between ETFs, because the raw ETFs move almost one-for-one with the S&P 500. Descriptive only: past co-movement, not a forecast or a recommendation.",
  factorBeta:
    "The factor beta: how much the portfolio's daily return has moved per unit of the factor's return, holding the other six factors fixed. A rates beta of −0.12 means the portfolio has moved like being 12% of its value short TLT. Check any row in Excel with LINEST(portfolio returns, factor returns, TRUE, TRUE) on the downloads.",
  factorT:
    "t-stat: the beta divided by its standard error. Below 2 in absolute value the beta can't be told apart from zero with the usual 95% confidence, so it is greyed out and never described as a position.",
  factorR2: "R²: the share of the daily return's variance the seven factors explain together. The rest is specific to the holdings (stock picking and sector bets the factors don't capture).",
  factorBenchmarkRow:
    "The same regression on the sector benchmark: the S&P 500 sector weights the Risk page uses, each invested in its Select Sector SPDR ETF. It shows the exposures the index itself carries.",
  factorActiveRow:
    "Portfolio minus benchmark: the regression of the active return (portfolio return minus benchmark return), whose betas are exactly the difference of the two rows. These are the factor tilts the portfolio adds on top of the index.",
  factorHoldings:
    "Each holding's own regression over the same days. A holding with too little price history uses its sector ETF's returns, the same rule the rest of the Risk page follows. Greyed cells have |t| < 2.",

  // Where the active risk comes from.
  activeRiskSection:
    "Tracking error is measured with the holdings long and the benchmark's sector ETFs short, so every difference from the index is a bet, including sectors the portfolio holds less of. Each position's share is aᵢ × (Σa)ᵢ ÷ aᵀΣa (Euler decomposition of the tracking-error variance): the holdings plus the benchmark side add up to 100%, and a negative share means the position reduces tracking error.",
  holdingActiveRiskShare:
    "Share of the tracking error (variance of the difference from the benchmark) that comes from this holding: aᵢ × (Σa)ᵢ ÷ aᵀΣa, where a is the active weights. Negative means it offsets other bets, for example a stock that moves like a sector the portfolio is underweight.",
  benchmarkSide:
    "The benchmark's sector ETFs at their S&P 500 weights, held short in the tracking-error calculation. Their share is the part of active risk from how the portfolio differs from the index sector by sector, including sectors it holds little or none of. It is negative when the portfolio's own holdings in those sectors cancel it out.",
  teContribution: "Points of annualized tracking error from this position: its share of active risk × tracking error. The column adds up to the tracking error.",
  marginalTe:
    "Marginal tracking error: ∂TE/∂wᵢ = (Σa)ᵢ ÷ TE, annualized. It is how many percentage points tracking error would change if 1 percentage point more of this holding were bought with cash (cash has no risk). Positive adds to tracking error, negative reduces it. It is a first-order estimate; the exact recomputation is in the working.",

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
