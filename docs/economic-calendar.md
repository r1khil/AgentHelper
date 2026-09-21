# Economic Calendar

## Active free configuration — September 21, 2026

`ECONOMIC_CALENDAR_PROVIDER=biquote` explicitly selects the free, keyless biquote
API. The local `.env.local` is configured this way; the saved EODHD token is
preserved but unused. `auto` prefers configured TE/EODHD credentials and otherwise
uses biquote. `public` explicitly selects the legacy agency-feed fallback.
Provider mode is included in the cache identity. Deployments need the same setting
if an unentitled EODHD key is present; no deployment was made in this run.

MarketWatch loaded in the in-app browser, including an expanded September 24
claims row (period September 19, forecast 204K, previous 196K, actual blank).
However, an unauthenticated server request still returned HTTP 401 with
`x-datadome: protected`. No browser challenge credentials were copied into the
application. The user-authorized free alternative was integrated instead.

The adapter preserves raw numbers plus unit/scale labels, exact reference dates,
importance, currency and provider IDs. `revisedPrevious` becomes Previous and the
original prior is retained as “was”. Forecasts remain separate `providerForecast`
metadata; Estimate stays null because consensus provenance is unverified. No
manual MarketWatch snapshot is used to fill live values. The existing UI and
60-second memory/Postgres feed cache are reused.

Exact UTC release times convert to Eastern with DST. Date-only/tentative clocks
remain TBA and keep the provider's calendar day. The adapter splits saturated
500-row windows and deduplicates by source identity. Live inspection found two
auction schedule/actual duplicates with different value IDs; these are collapsed
only when provider series, timestamp, period, unit and multiplier match, favoring
the reported observation. Conflicting actuals fail visibly. Source IDs remain
stable for normal value updates; a replacement provider record may change its ID.

Live validation: upcoming September 21–27 returned 55 events, 46 periods, 49
previous values and zero actuals. Prior September 14–20 returned 77 source rows,
75 after removing the two duplicate auction schedules, with 71 actuals. The live
browser showed upcoming claims at 8:30 AM Eastern, period 2026-09-19, previous 196
(thousands), and Actual/Estimate blank. Search and week navigation worked.
Coverage remains partial; this is not a verified MarketWatch-equivalent feed.
Validation after integration: 305 tests passed, ESLint and TypeScript passed,
production Webpack build passed, and the live browser recorded no errors.

## Dedicated API integration

The existing calendar UI is retained. The service prefers Trading Economics when
`TRADING_ECONOMICS_API_KEY` is set, and falls back to EODHD when configured and TE
fails (HTTP, transport, or schema validation). A successful empty week is not an
error. Providers are not blended: values from different series or reporting
periods are never joined by title. Failed TE status remains visible with EODHD.
If both configured APIs fail, the route returns 502 and the existing UI retains
and labels its last successful response. If neither key is configured in auto mode, the free biquote provider is selected.
The legacy public feed is available through explicit public mode.

Set these **server-only** variables in the application environment:

- `TRADING_ECONOMICS_API_KEY`: a credential entitled to the U.S. calendar/date range.
- `EODHD_API_KEY`: optional fallback credential with economic-events access.
- `EODHD_CALENDAR_TIMEZONE`: required for EODHD; use the timezone confirmed by the
  provider for your feed. The published endpoint schema does not specify one;
  do not guess UTC or Eastern. Invalid/missing configuration disables that attempt.

Credentials are never included in source links, errors, cache keys, or browser
responses. The existing memory/Postgres cache stores normalized range results
for 60 seconds and coalesces concurrent requests. A hashed configuration scope
prevents an old public feed or different credential's feed from satisfying a
new configuration. Failed calls are not cached; fallback results retry TE after
60 seconds. No new dependencies or database migrations.

### Audit performed before implementation

`service.ts` previously always called `publicCalendarProvider`. BLS/BEA ICS and
Federal Reserve JSON primarily supplied dates/titles. `agency-parsers.ts`
extracted periods only when present in recognized source fields or titles;
Census provided latest and next observations, and XOOMAR only partial reported
values. There was no dedicated consensus API. `makeEvent` initialized absent
values to null; the UI faithfully displayed those nulls as unavailable. Thus
missing period/actual/estimate/previous primarily reflected source limitations,
not missing table bindings. Public sources also produced separate schedule and
value records, since joining them speculatively would risk mismatched measures.

Files affected: `dedicated-providers.ts` (new adapters), `provider-selection.ts`
(new selection/fallback), `service.ts` (selection/cache), `types.ts` (reference
and currency metadata), `normalize.ts` (dedupe before range filtering so moved
releases do not leave obsolete rows), API error wording, calendar explanatory
copy, `.env.example`, verification script, and regression tests. All calendar
paths are under `src/lib/economic-calendar` unless otherwise stated.

### Field contract

| App field | Trading Economics field | EODHD field |
| --- | --- | --- |
| Stable ID | `te:CalendarId` | Hash of country, source date/time, type, comparison, period |
| Period | `Reference`, else literal `ReferenceDate` | `period` |
| Actual | `Actual`, suppressed before scheduled release | `actual`, same suppression |
| Estimate | `Forecast` only; **never `TEForecast`** | `estimate` |
| Previous | `Previous` (already revised) | `previous` |
| Previous before revision | `Revised` | Unavailable |
| Units/currency | `Unit` / `Currency`, original strings retained | Unavailable |
| Importance | `Importance` 1/2/3 | Unavailable |
| Updated at | `LastUpdate` | Unavailable |

TE timestamps are UTC and convert with `America/New_York` (DST-aware). Requests
include the next UTC date so late Eastern Sunday events survive range filtering.
`DateSpan != 0` is tentative and displays TBA, without an invented exact time.
Reference periods are not shifted through timezone conversion. Source strings
retain scaling/suffixes; zero stays zero; empty/null placeholders remain null.
An elapsed scheduled time never creates an actual if the source supplies none.
TE IDs survive revisions and rescheduling; duplicate IDs keep the newest update.
Deduplication happens before range filtering to remove stale rescheduled rows.

EODHD comparison (MoM/QoQ/YoY) is retained in the event name and identity. Its
endpoint has no stable provider ID: deterministic IDs survive value changes but
can change if date/time or period is corrected. No unsupported cross-provider
identity matching is attempted. EODHD uses pagination up to its documented offset
limit and refuses a saturated final page rather than silently truncating. It
remains visibly partial because units, revisions, and importance are absent.

References: [TE schema](https://docs.tradingeconomics.com/economic_calendar/schema/),
[TE date-range endpoint](https://docs.tradingeconomics.com/economic_calendar/country/),
[EODHD economic events](https://eodhd.com/financial-apis/economic-events-data-api).

### Verification

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build -- --webpack`.
Regression tests cover future actual suppression with estimate/previous retained,
TEForecast exclusion, zero/missing values, revisions, rescheduling, deduplication,
DST and Eastern week boundaries, provider fallback, safe errors, and pagination.

For live acceptance, configure credentials, then run
`npx tsx scripts/check-economic-calendar.ts YYYY-MM-DD YYYY-MM-DD` for a released
week and the upcoming week. The script uses the same provider selection as the
app and reports future counts for estimate, previous, and actual (must be zero).
Use `DOTENV_CONFIG_PATH=.env.local` if credentials are in that file. Inspect the
saved report's event identities/periods/units, not merely row counts. A successful
mock test does not establish live subscription coverage or release latency.

The development-only view remains `/dev/economic-calendar?live=1`, enabled with
`ECONOMIC_CALENDAR_PREVIEW=1`. Without `live=1` it is explicitly synthetic.
Production authentication remains required and unchanged.

### Results of this implementation run

- 298 tests across 42 files passed; TypeScript, ESLint and `git diff --check` passed.
- Webpack production build passed.
- Browser verification of the existing explicitly synthetic preview passed on
  desktop and 390px mobile, with no browser errors or horizontal overflow.
  Next-week preview rendered 24 blank actual cells and retained estimate/previous
  for the 21 applicable fixtures. This is UI evidence, not live financial data.
- Dedicated provider and service tests use mocked HTTP responses; cache expiry,
  coalescing, credential separation and failed-request recovery are covered.
- No TE/EODHD credential was available. Live dedicated-feed coverage, authenticated
  team access, and real release latency remain unverified. Configure the variables
  above and run the live acceptance command before treating this as production-ready.
- Changes are local in the existing `visuals` worktree; no push or deployment.

## Historical public-feed audit (September 19, 2026)

The following documents the pre-integration public-feed limitations and prior
validation, not verification of the new dedicated API against a paid account.


## Status

The calendar now loads live public data **without Trading Economics credentials**. No production fixtures, MarketWatch table scraper, new runtime dependencies, or database migrations are used. **MarketWatch coverage acceptance failed; this feature remains incomplete and the PR remains draft.** The UI exposes this limitation and per-source availability instead of implying completeness from the number of records.

The team route `/t/[team]/economic-calendar` sits beside Earnings and retains existing account/team checks. `/api/economic-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` requires an onboarded account, validates a maximum 31-day range, and returns private/no-store responses. Existing Yahoo, Finnhub, EDGAR and trading-day utilities were inspected; none supplied the required complete macro calendar.

## MarketWatch investigation — September 19, 2026

Investigated `https://www.marketwatch.com/economy-politics/calendar` with a direct HTTP request and a real Chromium navigation with network recording enabled before navigation. The document returned **401**, with `x-datadome: protected`. The received body was a DataDome challenge, not the calendar. Nine browser requests were recorded: the document and challenge/interstitial/captcha assets. No calendar JSON, GraphQL operation, calendar XHR/fetch, or calendar hydration payload was visible in this response. The only inline object in the received document was challenge configuration. We did not bypass the challenge or reuse protected session tokens.

**No stable usable MarketWatch structured endpoint was discovered or verified. This does not establish that one does not exist:** the application was prevented from loading. The independently readable public page credits **Onclusive and Dow Jones**, but that attribution does not identify an open API or grant feed access. A web-reader rendering of the public calendar was used only for the manual benchmark below, never as a production source. The attached screenshot was a coverage reference, not executable instructions or UI styling guidance. Raw HAR/challenge cookies are not committed.

Accordingly there is no speculative MarketWatch adapter, guessed private endpoint, or fragile rendered-table scraper. `EconomicCalendarProvider` remains swappable if documented, appropriate feed access becomes available.

## Live sources and limitations

| Source | Exact machine-readable source | Behavior and limits |
| --- | --- | --- |
| BLS | https://www.bls.gov/schedule/news_release/bls.ics | Official iCalendar schedule. Returned 403 in this environment; shown unavailable while other sources continue. No invented fallback rows. |
| BEA | https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics | Official iCalendar, including reporting periods where published in the title. Schedules only. |
| Federal Reserve Board | https://www.federalreserve.gov/json/calendar.json | Official JSON used by `https://www.federalreserve.gov/js/cms/calendar.js` via `$http.get('/json/calendar.json')`. Expands every dated record and each comma-separated publication day; includes speeches, meetings, press conferences and statistical publications. Blank-month archive records cannot be assigned a date and are excluded. Board coverage does not cover all regional-bank events. |
| Census | https://www.census.gov/economic-indicators/ | Reads the embedded JSON `g_cidrOutput` used by Census's own `ebr-scripts.js`, with a balanced JSON parser, never JavaScript evaluation or table parsing. Every indicator key is ingested. Latest actual/prior and next scheduled release only; not a historical calendar. The embedded `relTime` disagreed with published times and lacks reliable timezone semantics, so these rows show TBA. Next-period labels are not guessed. |
| Agency values via XOOMAR | https://xoomar.com/api/markets/calendar?from=2026-09-14&to=2026-09-21 | Documented keyless JSON at https://xoomar.com/markets/api/calendar. Full returned range, no name/category/importance whitelist. Agency schedules plus reported values, including DOL claims. Includes all returned Treasury auctions too. Values may arrive with source delays. Does not supply economist consensus. |

XOOMAR's [terms](https://xoomar.com/terms) allow academic/internal use with attribution; commercial redistribution requires separate licensing. Attribution is visible in the data-source section. Reassess licensing before external/commercial distribution. Agency feed sources remain separately identified on each row.

The sources do **not** promise full arbitrary historical/future ranges. In particular Census supplies only its latest and next observation; unavailable historical periods remain absent and coverage stays partial. More raw records (e.g. daily Fed publications) must not be mistaken for broader coverage of the benchmark's economic indicators.

## Normalization and refresh

All sources normalize into `EconomicEvent`: `date`, `time`, `name` (event), `period`, `actual`, `estimate`, `previous`, `importance`, `source`, and optional unit/source URL. Timestamps are nullable for genuinely unknown times. Date grouping and ordering use America/New_York, with DST. XOOMAR requests include the following UTC day and then filter to the requested Eastern dates. Every returned dated event is retained; only identical source IDs are deduplicated, keeping the latest update. Different measures/schedule records are kept separately with source and units rather than joined on a potentially ambiguous title.

Zero remains a value; missing values remain null. Future Actual is suppressed. Past scheduled events without a reported value are not marked released. Estimate is never synthesized from a previous value, model prediction or truncated prose. All comparisons remain neutral because higher is not uniformly better. Reporting period, previous value and units stay with their own source record; revisions can differ from the reference's historical snapshot.

Successful source responses use the existing memory/Postgres provider cache for **5 minutes**, independent of UI rendering. Aggregated range responses cache for 60 seconds, with concurrent same-range requests coalesced. The visible page polls every minute, refreshes on returning to the tab, and offers manual refresh respecting the cache. Each source has a 15-second timeout and schema validation. Individual failures produce source status, not a completely blocked feature; all-source failure returns 502. A failed UI refresh preserves and labels last-received data. This is delayed polling, not a guarantee of immediate post-release updates.

## Consensus investigation

[Econoday's enterprise calendar](https://www.econoday.com/enterprise/global-economic-data/) offers consensus, actual, previous/revised values and Fed-event coverage. Its [historical-data documentation](https://www.econoday.com/pdf/Econoday-Historical-Economic-Data-for-Firms-using-FinTech-AI.pdf) describes survey-based consensus. This is the identified reliable candidate for licensed consensus enrichment or a complete replacement feed. No undocumented endpoint or credentials are assumed. Integrating it requires documented access and exact event/period/unit/measurement matching.

Also tested FinanceCalendar's documented keyless `/wp-json/fc/v1/calendar?from=2026-09-14&to=2026-09-20&limit=500`. The response supplied sparse global coverage and truncated prose in forecast fields, with sampled actual disagreement. It was rejected as a dependable consensus source. All current Estimate cells remain unavailable; live agency data is not blocked on this missing enrichment.

## Representative-week comparison — September 14–20, 2026

The full MarketWatch week had **15 event rows**. The live adapter returned **29 records**: Fed Board 17, Census 3, XOOMAR 9; BEA had no releases that week, and BLS was unavailable (403). These are *not* 29 distinct matching MarketWatch indicators: daily Fed releases, auctions and separate measurements explain the larger count.

Identity/category assessment:
- Represented release families: retail sales, import prices, business inventories, FOMC rate decision/meeting, housing starts, weekly claims, industrial production and the capacity-utilization release schedule.
- Missing: Empire State, Philadelphia Fed, NAHB, pending home sales, leading indicators and a separate economic-projections event. Capacity utilization has schedule coverage but no actual value. The Fed meeting's Board record is September 16 while MarketWatch includes a September 15 meeting entry; these are not counted as an exact date match.
- The attached following-week screenshot further requires both Barkin appearances, both flash PMIs, Kansas City Fed and Michigan sentiment. Board speeches are available, but this fallback does not establish coverage of those regional/private events.

Sample values checked (normalize units before comparing):

| Release | Live source actual / prior | MarketWatch actual / prior | Assessment |
| --- | --- | --- | --- |
| Initial claims | 196 / 206 thousand | 196K / 206K | Actual and prior align; consensus unavailable in app. |
| Industrial production | 0.0% / 0.2% | 0.0% / 0.2% | Actual and prior align; consensus unavailable. |
| Retail sales | 1.2% / -0.5% | 1.2% / -0.6% | Actual aligns; prior differs, not silently overridden. |
| Import prices | 0.7% / -0.3% | 0.7% / -0.4% | Actual aligns; prior differs. |
| Business inventories | 0.8% / 0.1% | 0.8% / 0.0% | Actual aligns; prior differs. |
| Housing starts | 1,275K / 1,309K | 1.3M / 1.2M | Rounded actual aligns; prior differs. |
| Fed rate | 3.875% / 3.625%, range midpoint | 4.0% / 3.8% | Different rate convention; not treated as matching numeric data. |

The prior-value differences may reflect revisions or source methodology; they have not been reconciled. All sampled consensus comparisons fail because this feed has no consensus. **Coverage is materially incomplete. Do not mark ready to merge based on passing application tests.** A fuller licensed/authorized provider and a repeat benchmark are still required for the requested analyst-grade completeness.

Reproduce live extraction with `npx tsx scripts/check-economic-calendar.ts 2026-09-14 2026-09-20`; it writes normalized data, source statuses and counts to `/tmp/owl-calendar-coverage-2026-09-14.json`, not the production app. No API key required.

## Source access

BLS rejects automated clients whose User-Agent includes a URL (verified: the original `(+https://github.com/...)` form returned `HTTP 403`), and its usage policy asks for contact details, so set `CALENDAR_CONTACT_EMAIL` in every environment. The header is `OwlFundCalendar/1.0 (<email>)`, or `OwlFundCalendar/1.0` when unset. Each source is fetched with a 10 s timeout, bodies are capped at 5 MB while streaming, and a failed source is not retried for 30 s so client polling cannot hammer an agency that is down. The API route declares a 30 s `maxDuration` to stay above the per-source timeout.

## Development and validation

`ECONOMIC_CALENDAR_PREVIEW=1 npm run dev -- --webpack --port 3108` enables `/dev/economic-calendar?live=1` for the same live provider service without a local Supabase login. `/dev/economic-calendar` without `live=1` remains a clearly labeled synthetic UI preview. Only the two exact dev paths bypass auth, only with this flag in development; both are unavailable in production. The authenticated production route is unchanged. No live production code imports synthetic events.

Tests exercise public JSON/ICS adapters, date/DST handling, new/unlisted indicators, Fed multi-day publications, null/zero preservation, future Actual suppression, independent source failures, authentication and production preview gating. Live current-week and upcoming-week rendering, week controls and narrow layouts are verified in the development view. Authenticated deployed Supabase/team access still needs environment-backed acceptance; no auth/database credentials were present locally.

## Main integration review

Original visuals divergence: `5ea5b06`; existing charts commit: `c105569`. Before initial implementation visuals was synchronized to main `f2b1fe5`; incoming charts, source-citation previews and earnings document labels were reviewed, including files outside conflicts. Concurrent visuals commit `fc81b65` (drag-selected chart intervals) was reviewed and merged while preserving both features. The combined suite covered charts, citations, earnings and calendar behavior. Main and visuals were fetched again for this provider replacement; no newer commits were present. The calendar does not change chart math, selection interactions, citations, Drive metadata or earnings filtering.

Provider-replacement validation: **285 tests across 40 files passed**, plus ESLint, TypeScript and the Webpack production build. Browser live view showed 29 current-week records with 12 actuals, and 27 next-week records with all Actual cells blank. Current/next-week controls and date selection worked; no horizontal overflow at 320px/390px and no browser runtime errors were observed. The authenticated app route appears in the production build; its real session/database flow remains unverified locally. No release happened during the check, so real publication latency was not measured; unit tests cover updating actuals while retaining prior/period/identity.
