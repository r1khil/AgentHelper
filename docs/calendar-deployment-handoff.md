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

Whichever feed answers, **FXStreet** runs alongside it as a second opinion. Its rows are matched by release minute, previous value, actual and a shared word in the name. It fills consensus the feed lacks, which covers most of it when TradingView is down, and adds the value a previous reading had before revision ("rev. from"), which TradingView doesn't carry. It never replaces a value the feed has. Each consensus records its source, shown on hover. If FXStreet is down, only those extras are lost.

**Kalshi** (documented public API, no key) prices the big releases weeks before any consensus is published: payrolls, unemployment, CPI and core CPI, PCE and core PCE, GDP, jobless claims, ISM manufacturing and services, retail sales, PPI and Fed decisions. Each market is a ladder of "above X" contracts that closes minutes before the release. The page shows where the ladder crosses 50% (the median outcome), or for Fed decisions the likeliest rate and its chance, labeled "Kalshi" under the consensus. Rungs whose bid and ask are more than 20 cents apart are skipped. It is a price, not a survey: it never fills consensus or drives the blue and orange surprise colors, and it disappears once the market closes at the release.

`tradingview`, `biquote` or `public` puts that feed first and ignores paid keys; the other free feeds stay behind it as fallbacks. No new fallback starts after 18 s, so the route stays inside its 30 s limit.

When a fallback answers, the page shows "Coverage incomplete" naming the feeds that failed and the one showing. When every feed fails, the page shows the last copy of that week that loaded (kept 30 days in `provider_cache`) with its load time, and retries every 30 s. It returns an error only when no copy exists.

## Caveats

- Upcoming weeks fill in late: Trading Economics and FXStreet publish consensus for most releases only in the days before. On 2026-09-23 neither had consensus yet for the next week's payrolls, PCE or ISM. No free source checked had it earlier (Nasdaq, Forex Factory, Econoday's week view, Yahoo, Briefing.com; MarketWatch and Investing.com refuse server requests).
- TradingView publishes about five weeks ahead. Further out it answers with no events, so the page falls back and says "not published this far ahead". It also leaves units off releases a few weeks out; FXStreet's match adds the missing "%".
- FXStreet's feed is not a documented API either; it answers only with an fxstreet.com Referer.
- TradingView's feed is not a documented API. It answers only requests carrying its calendar page's `Origin` header and could change or close without notice; the chain falls through to biquote if it does.
- biquote.io is blocked by Palo Alto DNS Security (it resolves to `sinkhole.paloaltonetworks.com` on networks using it), so it fails on some local networks even when it works on Vercel.

## Verification

Run `npm test`, `npm run lint` and `npm run build -- --webpack`. In the deployed app, open the team's Economic Calendar: the status line should name TradingView, with no "Coverage incomplete" note, and released high-importance events should show Actual, Estimate and Previous. Expand "Data sources" to see what each feed returned.
