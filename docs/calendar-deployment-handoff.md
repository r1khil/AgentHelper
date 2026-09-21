# Economic calendar handoff for deployment

The calendar implementation is already merged into `main` in `r1khil/AgentHelper`.
Implementation commit: `e8452b1`; integrated main commit: `4f60cbe`.
Pull the latest main before deploying; preserve any newer changes. Do not rebuild or redesign the calendar UI.

## Required configuration

Set this server environment variable on the existing deployment, then rebuild/redeploy:

```dotenv
ECONOMIC_CALENDAR_PROVIDER=biquote
```

This explicitly selects the free biquote feed even if old Trading Economics or EODHD keys exist. Neither paid API access nor an EODHD token is needed for this mode. Do not switch to `auto` or `public` for this rollout. Hosting account permissions and deployment restrictions are separate from calendar data access; do not purchase a hosting or API plan for this change.

## Expected behavior

- Keep the current calendar UI, filters, navigation and caching.
- Show provider-supplied periods, previous values and released actuals where available.
- Estimates stay blank: biquote forecasts are not verified economist consensus.
- Future unreleased actuals stay blank.
- Preserve units, revision metadata, importance and Eastern time handling.
- Missing source data stays blank; do not fabricate values.

## Verification

Run `npm test`, `npm run lint` and `npm run build -- --webpack`.
Then sign into the deployed app and open the team's Economic Calendar.
Check a recently released week for periods, previous values and actuals; check an upcoming week for previous values where available, blank actuals and blank estimates. Confirm the provider is biquote.

The merged implementation passed 318 tests, lint, TypeScript and a production build. Real-provider verification for September 21–27, 2026 returned 55 events, 49 with previous values, zero actuals and zero estimates. Earlier released-week verification showed periods, previous values, actuals and revisions. These are dated verification results, not hardcoded data or promises of future coverage.

The GitHub push succeeded. Vercel reported "Deployment was blocked" for commit `4f60cbe`; production calendar verification has not been completed. The project owner must inspect the deployment restriction in their account and redeploy using their existing hosting arrangement. Do not assume a successful GitHub push means the application is live.
