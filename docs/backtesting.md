# Backtesting

`/backtesting` is a top-level workspace page. It reads the current active holding weights from the same database records used by Holdings. Exec/admin users see the fund's holdings; other users see their own team's holdings. Missing weights block a replay rather than substituting equal weights. Fund-wide duplicate ticker rows are counted once. The uninvested remainder of the current saved holding weights is shown as an editable cash position; neither holding nor cash weights are preset to example values. Saved weights over 100% block the page rather than producing negative cash. Cash earns 0% by default.

The original is an immutable snapshot. Modified weights exist only in the browser, must be nonnegative and total 100%, and never update holdings or the trade ledger. Editing one weight does not change any other weight; the user may explicitly offset a holding against cash. All displayed weights, totals, and changes have two decimal places. Existing weight precision is retained for untouched positions in calculations. Each request reloads the authorized snapshot and checks its version, so a stale screen cannot accidentally compare against a different portfolio. Changes to the controls are explicitly marked as unapplied until another run completes. Hoot's backtest overrides follow the same no-redistribution rule and require explicit offsets.

## Prices and calculations

- Server-only loader calls the existing Yahoo provider with four-symbol bounded concurrency. The provider caches adjusted daily closes for 15 minutes using the existing memory/database provider cache. No API keys are sent to the browser.
- SPY (default), QQQ and IWM are ETF total-return proxies. All histories must be USD denominated and have adjusted closes; there is no fallback to unadjusted close.
- The requested start session includes its return from the preceding observed benchmark close. The provider fetch starts 14 calendar days earlier to obtain that baseline. End dates must be before today in New York, and ranges are limited to five years.
- Benchmark observations define trading sessions. Prices are sorted and deduplicated. A holding's allocation acts as cash at 0% return until its first available adjusted close. That close establishes its return basis, and later sessions use its observed closes. Yahoo can reject an entirely prelisting range; the loader treats it as empty only after confirming the ticker has current USD history and a first trade after the requested end date. Missing prices after trading starts, other provider failures, conflicting duplicates, invalid closes and benchmark gaps observed in holding histories block the replay. Prices are never forward-filled.
- Each day: `r_i = adjustedClose_i / priorAdjustedClose_i - 1`, `r_p = sum(weight_i * r_i)`, including cash with `r_cash = 0`. Fixed weights mean daily rebalancing. Period return is `product(1 + r_p) - 1`; benchmark compounds independently. Active return is the difference, not separately compounded daily active returns.
- Daily holding contribution is `weight_i * r_i`. Period contribution accumulates `priorPortfolioNAV * dailyContribution` with starting NAV 1. Each portfolio's contributions sum to its compounded return; contribution deltas sum to the modified-minus-original return delta.
- Volatility: sample daily standard deviation times square root of 252. Drawdown: most negative NAV / prior peak - 1, including initial NAV 1. Capture: ratio of geometric mean daily portfolio and benchmark returns on benchmark-positive or benchmark-negative days. Empty subsets and single-day volatility display unavailable. Flat benchmark days are excluded from capture; active-return ties use a 1e-12 tolerance.
- Current membership introduces hindsight and survivorship bias. Cash is modeled at 0%; FX, costs, fees, taxes and historical trades are excluded. This is a hypothetical allocation comparison, not ledger attribution.

## Validation and local preview

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build -- --webpack`.

For browser QA without a configured database/login:

```
BACKTESTING_PREVIEW=1 npm run dev -- --webpack --hostname 127.0.0.1 --port 3107
```

Open `http://127.0.0.1:3107/dev/backtesting`. The preview is labeled synthetic and supports June 1–August 31, 2026. It exercises the real workspace and calculation engine through a separate fixture endpoint. Both preview routes are disabled outside explicitly opted-in development. Neither route loads real holdings or bypasses authentication for `/backtesting` or `/api/backtesting`.

Verification performed for the cash update: 647 tests, typecheck, lint, and a Webpack production build passed. The synthetic browser preview blocked an overweight scenario, ran after an explicit cash offset, and identified a newer holding's early cash period. A 390px viewport had no page overflow or browser errors. A real Yahoo request for a prelisting RDDT range returned an empty history after the new listing-date check. Authenticated production portfolio reads still require the deployment's existing database and Supabase configuration; the local synthetic preview does not validate a production account.
