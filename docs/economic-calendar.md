# Economic Calendar

## Integration

The team sidebar links to `/t/[team]/economic-calendar` next to Earnings. This is the same U.S. macro feed for every team, behind the existing app authentication and team access checks. `/api/economic-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` requires an onboarded account and accepts up to 31 days. The UI selects Monday–Sunday weeks in America/New_York, initially the current week.

Existing integrations were inspected: Yahoo supplies prices, Finnhub supplies company news/earnings, EDGAR supplies filings, and the existing `providers/calendar.ts` is a trading-day utility. None implements a complete macro calendar contract. The new adapter uses Trading Economics' country/date endpoint and reuses the provider cache (memory/Postgres) and request spacing. No database migration or new runtime dependency is needed.

Set **TRADING_ECONOMICS_API_KEY** on the server to a credential entitled to the full U.S. economic calendar. Confirm your subscription permits the app's intended display/use. The credential is transmitted in the Authorization header, never in the URL or client bundle. Missing configuration produces a visible unavailable state; it does not silently return an empty or synthetic feed.

Sources checked September 19, 2026:
- [Country and date endpoint](https://docs.tradingeconomics.com/economic_calendar/country/)
- [Response schema](https://docs.tradingeconomics.com/economic_calendar/schema/)
- [Authentication](https://docs.tradingeconomics.com/get_started/authentication/)
- [Rate limits](https://docs.tradingeconomics.com/get_started/rate-limits/)

## Data behavior

`EconomicCalendarProvider` is the replaceable provider contract. The adapter requests **all** U.S. events in the range without indicator, category, importance or upcoming-only filters. Unknown/new releases, auctions, speakers and entries without numeric values are retained automatically. Only repeated provider IDs are deduplicated, taking the latest update. Importance/search filters operate on the loaded feed; the UI displays filtered and total counts.

UTC provider timestamps are converted to Eastern time with DST. Requests include the UTC day after the selected end, then filter on Eastern dates so late Sunday events aren't lost. Reporting period is the provider's Reference, consensus is Forecast (never TEForecast), Previous is the revised previous figure, and Revised is shown as its pre-revision value. Zero is a value; blanks are unavailable. Future Actual cells are blank. A past timestamp alone never invents an Actual or marks a speech as a numeric release. Numeric cells have no directional green/red interpretation.

The visible page polls every 30 seconds and refreshes on tab return. Shared data has a 15-second cache; provider publication and cache/poll timing can delay display, so this is near-real-time polling, not tick-by-tick streaming. Failed refreshes retain and explicitly label the last received data. Week changes cannot render the prior week's events under new dates; obsolete requests are aborted. Manual refresh respects the same shared cache. The provider's documented 1,000-row response ceiling and malformed responses fail visibly instead of quietly truncating. The weekly UI remains well below the row ceiling in normal use; the API asks for a shorter range if the ceiling is reached.

## Development preview

Run `ECONOMIC_CALENDAR_PREVIEW=1 npm run dev -- --webpack` and visit `/dev/economic-calendar`. Its clearly labeled synthetic fixtures exercise desktop/mobile layout, filtering and dates. Only the two exact `/dev/economic-calendar` and `/api/dev/economic-calendar` paths skip auth, only with that explicit flag and NODE_ENV=development. Both are unavailable in production. The live service never imports fixtures. Mock events and values are not evidence of provider coverage.

## Coverage acceptance — pending, not ready to merge

No full-access Trading Economics credential was available during implementation. Therefore neither real current-week rendering nor parity with MarketWatch has been certified. The integration must stay draft until live coverage passes; do not treat the synthetic preview or API documentation as a substitute.

The reference image contains **nine visible events** under September 21–25: two Barkin appearances, manufacturing/services flash PMI, weekly jobless claims, new home sales, Kansas City Fed survey, durable goods, and Michigan final sentiment. Capacity utilization and leading indicators are also visible above those dated sections. The crop does not establish the full count for the preceding week; the year is not printed. September 21–25 falls Monday–Friday in 2026, consistent with the task date, but use a confirmed full-week reference for final acceptance.

To complete validation with a licensed credential:

1. Run `npx tsx scripts/check-economic-calendar.ts 2026-09-21 2026-09-27` (dotenv loads `.env`; use DOTENV_CONFIG_PATH for another local file). It writes all normalized events, exact count and category counts to `/tmp/owl-calendar-coverage-2026-09-21.json` without credentials.
2. Compare every event in the reference, matching equivalent provider names and dates. In particular verify both Fed appearances, both flash PMIs, the regional survey, labor, housing, durable goods and sentiment. Do not infer coverage from aggregate counts alone.
3. Compare a complete representative week (including lower-profile releases) against the full MarketWatch week; record counts, matched/missing names and categories. Run additional weeks to inspect inflation/PCE, payrolls, GDP and FOMC/minutes as scheduled.
4. If a meaningful set of events is missing, replace the adapter or obtain the correct entitlement and rerun validation. Do not compensate with a curated production list.
5. Observe an actual release in the live UI, confirm Actual updates while Estimate/Previous remain, and verify the authenticated deployed route. Only then mark the PR ready.

## Main integration review

Original visuals divergence: `5ea5b06`; existing charts commit: `c105569`. Fetched and fast-forwarded visuals to `f2b1fe5` before implementation. Reviewed incoming charts, source citation resolution/previews and earnings document labels, including changes outside conflicts. The calendar uses existing theme/table/card components and an independent API/type namespace, and does not change chart math, citations, Drive metadata or earnings filters. Its only shared behavior changes are one sidebar item and an explicitly development-only preview exception in the proxy. Tests cover existing chart, citation, document-label and earnings features alongside the calendar.

## Validation performed

- 277 tests passed across 39 files, including date/DST boundaries, unfamiliar event retention, speeches, zeros/nulls, reporting periods, revision handling, consensus separation, release updates, country/schema failures, row-limit detection, authentication, API errors and production preview gating. Existing charts, citations, earnings labels and other app tests passed on the combined main + visuals tree.
- `npm run typecheck`, `npm run lint`, and `npm run build -- --webpack` passed. The default Turbopack builder cannot bind its CSS-worker port in this environment; the supported Webpack production build completes and lists the new app/API routes.
- Real-browser development-preview checks: current week, next-week blank Actual cells, high-importance filtering (6 of 24 synthetic events), speaker search, previous/current navigation, native date change to October 7 selecting October 5–11, and desktop/mobile layout. A browser-local simulated release exercises Actual updates without changing Estimate/Previous. These checks validate application behavior, not live provider coverage.
- The authenticated Supabase/database route and licensed provider path still need live end-to-end acceptance. No authentication or provider secrets were available in this checkout.
