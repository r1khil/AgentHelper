# Free economic calendar investigation — September 21, 2026

No paid subscription or account upgrade was made. No candidate was automatically
installed into the production pipeline during this investigation.

## Live probes

- Forex Factory's official weekly JSON export returned HTTP 200: 24 USD events,
  9 nonempty forecasts, 13 nonempty previous values. The export lacks actual,
  reporting period, revision history and provider event IDs. It is a rolling
  weekly feed, not a historical range API. Its published notices restrict copying
  and redistribution; availability of the export does not establish permission
  to republish it in the team application.
- FinanceCalendar's documented range endpoint returned HTTP 200: 11 global rows
  for September 21–27, including holidays, and truncated prose in prior fields.
  It is not a suitable full U.S. numeric calendar replacement.
- biquote's documented unauthenticated API returned HTTP 200 with 132 U.S. rows
  over September 14–27 (request padded through September 28 05:00 UTC). September
  14–20: 77 rows, 71 actuals, 47 forecasts, 73 previous, 64 periods, 17 revised
  previous values. September 21–27: 55 rows, zero actuals, 29 forecasts, 49 previous,
  46 periods. Counts describe source records, not distinct release families or
  independently verified coverage. Source is mql5 for sampled U.S. rows.

biquote carries IDs, UTC timestamps, time precision, periods, units, multipliers,
importance and revisedPrevious. Sample initial claims for September 17: actual
196, multiplier thousands, previous 206, period September 12. This matched the
MQL5 source page. For September 24, biquote/MQL5 forecast 189K versus Forex Factory
201K. Forecast provenance is not established as economist consensus by this
investigation; differing forecasts must not be silently merged or relabeled.

## Recommendation and remaining checks

biquote is the strongest free candidate found for periods, reported actuals,
previous values and revision metadata. Before adopting it, validate additional
values and scale conventions against original releases, confirm forecast
methodology, check feed freshness/coverage and clarify redistribution terms.
The documentation's payroll scale example is ambiguous (152000 with thousands),
so a generic extra multiplication would be unsafe. Retain raw numbers and source
scale, and test actual records before choosing formatting.

For the user's strict consensus requirement, leave estimate null until that
provenance is established. Do not replace missing consensus with an unverified
forecast. The existing paid adapters and UI have not been changed by this audit.
The saved free EODHD token still lacks economic-calendar entitlement (live 403).

## Sources

- https://biquote.io/docs/
- https://biquote.io/api/calendar?countries=US&from=2026-09-14T00%3A00%3A00Z&to=2026-09-28T05%3A00%3A00Z&limit=500
- https://www.mql5.com/en/economic-calendar/united-states/initial-jobless-claims
- https://www.forexfactory.com/calendar (official weekly export link)
- https://nfs.faireconomy.media/ff_calendar_thisweek.json
- https://www.forexfactory.com/notices
- https://www.financecalendar.com/api/
- https://www.financecalendar.com/wp-json/fc/v1/calendar?from=2026-09-21&to=2026-09-27&limit=500

Raw read-only probe responses are saved locally in /private/tmp/calendar-research-*
for inspection; they are not committed or used as production fixtures.

## Follow-through

The user subsequently authorized the alternative if MarketWatch was not suitable.
MarketWatch browser access worked, but server access remained 401. biquote is now
integrated and explicitly configured locally. See economic-calendar.md for live
validation and the remaining consensus limitation.
