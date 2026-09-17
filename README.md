# Owl Fund Workspace

Research workspace for the six sector teams of Temple University's Owl Fund. One rule shapes every feature:

> The agent prepares the evidence. The student owns the interpretation.

The agent pulls prices, SEC filings, XBRL financials, news, and earnings dates, and cites a source for every fact. It never writes a student's movement update, earnings reflection, thesis, or conclusion.

## What it does

| Area | What the app does | What the student does |
| --- | --- | --- |
| Holdings | Live quote and day move vs the S&P 500, filings, news, notes, owner | Writes and maintains the thesis |
| Research agent | Chat with tools for quotes, price history, relative moves, EDGAR filings and documents, XBRL facts, news, earnings calendar, team context. Every claim carries a `[src:ID]` chip | Asks questions, judges the evidence |
| Major movements | Nightly close check: any holding whose daily return differs from the S&P 500 by 4 pp or more opens an investigation with evidence and a noon-next-day deadline, and emails the owner and lead | Writes the update, asks for feedback, marks it complete |
| Earnings | Tracks the next report date (confirmed vs estimated); locks the student's expectations at the report; gathers the 8-K, press release and XBRL actuals with sources | Records expectations before, writes the reflection after |
| Model historicals | Reads an uploaded Excel model, maps line items to XBRL concepts, proposes the other periods with period, unit, filing and derivation, and writes approved values into a new file version without touching formulas | Maps the anchor period, approves or rejects each proposal |

## Stack

Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui, Supabase (Postgres, Auth, Storage), Drizzle ORM, Vercel AI SDK v7 via OpenRouter, Vercel hosting with Vercel Cron. Data providers: Yahoo Finance (prices, `^GSPC`), SEC EDGAR (filings, XBRL), Finnhub (news, earnings calendar), Resend (email).

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (Supabase URL and keys, `DATABASE_URL` from the transaction pooler, `OPENROUTER_API_KEY`, optional `FINNHUB_API_KEY` and `RESEND_API_KEY`).
3. Apply the schema: `npm run db:migrate` (or paste `drizzle/*.sql` into the Supabase SQL editor).
4. `npm run db:seed` creates the `admin` username account (password from `SEED_ADMIN_PASSWORD`) and the admin invitation for the Fund's Google account.
5. `npm run dev`, sign in with the username account, and add members from Admin.

Sign-in is by invitation only: Google for real members, username + password for test accounts created on the Admin page.

## Scheduled jobs

`vercel.json` runs two crons: the close check at 23:00 UTC on weekdays and the morning sweep (pending evidence, reminders, overdue notices, earnings calendar, email retries) at 14:00 UTC. Both endpoints accept `Authorization: Bearer $CRON_SECRET` and can be run from the Admin page, with a date for backfills:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/close?date=2026-08-28"
```

## Scripts

- `npm run typecheck`, `npm run lint`, `npm test`
- `npm run smoke:providers AAPL` hits Yahoo, EDGAR and Finnhub live
- `npx tsx scripts/find-move.ts NVDA 4` lists recent sessions that met the 4 pp rule
- `npx tsx scripts/upload-model.ts NVDA model.xlsx` uploads a model without the browser

## Docs

- [docs/product.md](docs/product.md): scope and the learning boundary
- [docs/original-outline.txt](docs/original-outline.txt): the original proposal
- [docs/decisions.md](docs/decisions.md): historical decision log
