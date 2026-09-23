# Economic calendar data sources

## Configuration

```dotenv
ECONOMIC_CALENDAR_PROVIDER=auto
```

`auto` (also the default when unset) tries each feed in turn and shows the first one that answers:

1. Trading Economics, then EODHD, only if their API keys are set.
2. **TradingView**: free, no key. The feed behind tradingview.com/economic-calendar, carrying Trading Economics' data: exact times, actuals within minutes, previous values and the consensus forecast shown as Estimate.
3. **biquote**: free, no key. Times, actuals and previous values; its forecast isn't verified consensus, so Estimate stays blank.
4. **Public agency feeds**: BLS, BEA, Census and Federal Reserve schedules plus XOOMAR values. Set `CALENDAR_CONTACT_EMAIL` or BLS answers 403.

`tradingview`, `biquote` or `public` puts that feed first and ignores paid keys; the other free feeds stay behind it as fallbacks. No new fallback starts after 18 s, so the route stays inside its 30 s limit.

When a fallback answers, the page shows "Coverage incomplete" naming the feeds that failed and the one showing. When every feed fails, the page shows the last copy of that week that loaded (kept 30 days in `provider_cache`) with its load time, and retries every 30 s. It returns an error only when no copy exists.

## Caveats

- TradingView's feed is not a documented API. It answers only requests carrying its calendar page's `Origin` header and could change or close without notice; the chain falls through to biquote if it does.
- biquote.io is blocked by Palo Alto DNS Security (it resolves to `sinkhole.paloaltonetworks.com` on networks using it), so it fails on some local networks even when it works on Vercel.

## Verification

Run `npm test`, `npm run lint` and `npm run build -- --webpack`. In the deployed app, open the team's Economic Calendar: the status line should name TradingView, with no "Coverage incomplete" note, and released high-importance events should show Actual, Estimate and Previous. Expand "Data sources" to see what each feed returned.
