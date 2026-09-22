# Backtesting

`/backtesting` is a top-level workspace page. It reads the current active holding weights from the same database records used by Holdings. Exec/admin users see the fund's holdings; other users see their own team's holdings. Missing weights block a replay rather than substituting equal weights. The invested sleeve is normalized to 100%; cash is excluded and that assumption is displayed before running.

The original is an immutable snapshot. Modified weights exist only in the browser, must be nonnegative and total 100%, and never update holdings or the trade ledger. Each request reloads the authorized snapshot and checks its version, so a stale screen cannot accidentally compare against a different portfolio. Changes to the controls are explicitly marked as unapplied until another run completes.

## Prices and calculations

- Server-only loader calls the existing Yahoo provider with four-symbol bounded concurrency. The provider caches adjusted daily closes for 15 minutes using the existing memory/database provider cache. No API keys are sent to the browser.
- SPY (default), QQQ and IWM are ETF total-return proxies. All histories must be USD denominated and have adjusted closes; there is no fallback to unadjusted close.
- The requested start session includes its return from the preceding observed benchmark close. The provider fetch starts 14 calendar days earlier to obtain that baseline. End dates must be before today in New York, and ranges are limited to five years.
- Benchmark observations define trading sessions. Prices are sorted and deduplicated. Conflicting duplicate prices, invalid closes, missing holding endpoints and benchmark gaps observed in holding histories block the whole replay. Prices are never forward-filled and missing days are never assigned zero returns.
- Each day: `r_i = adjustedClose_i / priorAdjustedClose_i - 1`, `r_p = sum(weight_i * r_i)`. Fixed weights mean daily rebalancing. Period return is `product(1 + r_p) - 1`; benchmark compounds independently. Active return is the difference, not separately compounded daily active returns.
- Daily holding contribution is `weight_i * r_i`. Period contribution accumulates `priorPortfolioNAV * dailyContribution` with starting NAV 1. Each portfolio's contributions sum to its compounded return; contribution deltas sum to the modified-minus-original return delta.
- Volatility: sample daily standard deviation times square root of 252. Drawdown: most negative NAV / prior peak - 1, including initial NAV 1. Capture: ratio of geometric mean daily portfolio and benchmark returns on benchmark-positive or benchmark-negative days. Empty subsets and single-day volatility display unavailable. Flat benchmark days are excluded from capture; active-return ties use a 1e-12 tolerance.
- Current membership introduces hindsight and survivorship bias. Cash, FX, costs, fees, taxes and historical trades are excluded. This is a hypothetical allocation comparison, not ledger attribution.

## Validation and local preview

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build -- --webpack`.

For browser QA without a configured database/login:

```
BACKTESTING_PREVIEW=1 npm run dev -- --webpack --hostname 127.0.0.1 --port 3107
```

Open `http://127.0.0.1:3107/dev/backtesting`. The preview is labeled synthetic and supports June 1–August 31, 2026. It exercises the real workspace and calculation engine through a separate fixture endpoint. Both preview routes are disabled outside explicitly opted-in development. Neither route loads real holdings or bypasses authentication for `/backtesting` or `/api/backtesting`.

Verification performed: unchanged-weight and edited-weight runs; invalid-total blocking; daily heatmap selection; three-series chart with keyboard interval selection; custom date range and benchmark changes; contribution and summary deltas; mobile layout at 390px without page overflow; live server-side SPY/AAPL adjusted history. All 473 tests, typecheck, lint, and the Webpack production build passed. Authenticated production portfolio reads require the deployment's existing database and Supabase configuration; the local synthetic preview does not establish those credentials or validate a production account.
