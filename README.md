# Owl Fund Workspace

Research workspace for the six sector teams of Temple University's Owl Fund. One rule shapes every feature:

> The agent prepares the evidence. The student owns the interpretation.

The agent pulls prices, SEC filings, XBRL financials, news, and earnings dates, and cites a source for every fact. It never writes a student's movement update, earnings reflection, thesis, or conclusion.

## What it does

| Area | What the app does | What the student does |
| --- | --- | --- |
| Holdings | Live quote and day move vs the S&P 500, filings, news, notes, owner, documents (uploads are filed into the Fund's Google Drive) | Writes and maintains the thesis |
| Research agent | Chat with tools for quotes, price history, relative moves, EDGAR filings and documents, XBRL facts, news, earnings calendar, team context, and the team's own documents in the Fund's Google Drive (initiating reports, earnings updates, models). Every claim carries a `[src:ID]` chip | Asks questions, judges the evidence |
| Major movements | Nightly close check: any holding whose daily return differs from the S&P 500 by 4 pp or more opens an investigation with evidence and a noon-next-day deadline, and emails the owner and lead | Writes the update, asks for feedback, marks it complete |
| Earnings | Tracks the next report date (confirmed vs estimated); locks the student's expectations at the report; gathers the 8-K, press release and XBRL actuals with sources | Records expectations before, writes the reflection after |
| Model historicals | Reads an uploaded Excel model, maps line items to XBRL concepts, proposes the other periods with period, unit, filing and derivation, and writes approved values into a new file version without touching formulas | Maps the anchor period, approves or rejects each proposal |

## Stack

Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui, Supabase (Postgres, Auth, Storage), Drizzle ORM, Vercel AI SDK v7 via OpenRouter, Vercel hosting with Vercel Cron. Data providers: Yahoo Finance (prices, `^GSPC`), SEC EDGAR (filings, XBRL), Finnhub (news, earnings calendar), Resend (email).

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (Supabase URL and keys, `DATABASE_URL` from the transaction pooler, `OPENROUTER_API_KEY`, optional `FINNHUB_API_KEY` and `RESEND_API_KEY`).
3. Apply the schema: `npm run db:migrate` (or paste `drizzle/*.sql` into the Supabase SQL editor). Migrations from `0002` on are hand-written and not in the drizzle journal; apply each with `npx tsx scripts/apply-sql.ts drizzle/<file>.sql` and do not run `db:generate`.
4. `npm run db:seed` creates the `admin` username account (password from `SEED_ADMIN_PASSWORD`) and the admin invitation for the Fund's Google account.
5. `npm run dev`, sign in with the username account, and add members from Admin.

Sign-in is by invitation only: Google for real members, username + password for test accounts created on the Admin page.

### Google sign-in branding

With `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set, the app runs the Google OAuth flow itself and hands the ID token to Supabase, so the redirect URI (and the host Google prints on its consent screen) is the app's own origin rather than `<ref>.supabase.co`. Add `<APP_URL>/auth/google/callback` (and `http://localhost:3000/auth/google/callback` for dev) to the OAuth client's authorized redirect URIs, and set the app name under Google Auth Platform → Branding. Google only prints that name instead of the domain once the brand is verified, or for an Internal (Workspace-only) app.

## Google Drive

The agent reads the Fund's document folder in Google Drive and files analyst uploads into it. Access is **read everything + add new files only**: the app requests the `drive.readonly` and `drive.file` scopes, so Google itself refuses any edit or deletion of files the app did not create, and the app's only write module (`src/lib/drive/writes.ts`) can create folders, upload files, and replace the content of its own model copies. A unit test fails if that surface grows.

Expected folder layout: one folder per sector team, then one folder per company named like `American Express (AXP)`, with the initiating coverage report, earnings updates, and the current model inside. Company folders are matched to holdings by the `(TICKER)` in their name (a company-name match is the fallback); the Admin page lists folders it could not match.

Setup (one time, by the admin whose account owns the folder):

1. Google Cloud console, project `owl-fund-workspace`: enable the **Google Drive API** (free; no billing needed).
2. OAuth consent screen: user type **Internal** (so the token does not expire weekly), scopes `…/auth/drive.readonly` and `…/auth/drive.file`.
3. Credentials → the existing OAuth client used for sign-in → Authorized redirect URIs: add `http://localhost:3000/api/google/callback` (or whatever port `next dev` uses) and `https://owlfund-workspace.vercel.app/api/google/callback`.
4. Environment: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `DRIVE_TOKEN_KEY` (`openssl rand -base64 32`). The key encrypts the stored refresh token and **must be the same value locally and on Vercel** because both talk to the same database. Production: `vercel env add <NAME> production`, then redeploy.
5. Apply `drizzle/0007_drive.sql` and `drizzle/0008_drive_ingest.sql` (`npx tsx scripts/apply-sql.ts drizzle/<file>.sql`). The second enables the `vector` extension (pgvector); if the database role cannot, enable it once from the Supabase dashboard (Database → Extensions) and rerun.
6. Admin page → **Connect Google Drive** → paste the folder URL → Save. The first sync runs immediately; the index refreshes on its own before agent chats, in the morning sweep, and from **Sync now**.

**Live updates.** With a public https `APP_URL`, the app registers a Drive change-notification channel (`changes.watch`) that points at `/api/drive/webhook`; a file added, replaced, or trashed in the folder is applied to the index within seconds through `changes.list`, and only that file is read. Channels last about a week; the morning sweep renews them, and **Renew live updates** on the Admin page does it by hand. Without a public URL (local dev, preview deployments behind Vercel's protection) the app falls back to polling: at most every 10 minutes before a chat, plus the morning crawl. Folder moves and renames trigger a full crawl.

**Reading files.** Matched files are read after each sync, newest first, a few at a time so no run exceeds a serverless function's budget (**Read files now** on the Admin page works through the backlog). For each file version the app extracts the text (PDF, Word, PowerPoint, Excel, Google Docs/Sheets/Slides), writes a structured summary (one line, the document's own thesis, rating, price target, key numbers, catalysts, risks, date) with `OPENROUTER_SUMMARY_MODEL` (default: the chat model), and embeds the text in chunks (`OPENROUTER_EMBEDDING_MODEL`, 1536 dimensions, `OPENROUTER_EMBEDDINGS=off` to skip). Summaries show on the holding page and in the agent's context; the agent's `search_drive_text` tool searches the chunks by meaning. When a holding has no thesis and its initiating coverage report states one, the app proposes it on the holding page; nothing changes until an analyst accepts. Uploads from a holding page go browser → Supabase Storage (signed URL) → server → Drive, so files up to 50MB work within Vercel's request limits; the upload returns at once and the file is read in the background.

## Changelog

`/changelog` (execs and admins) lists every pull request merged into `main`, newest first, each with a one-line headline and a short plain-English summary written for non-technical readers. Summaries are produced once per pull request by a free OpenRouter model (`CHANGELOG_MODEL`, default `cohere/north-mini-code:free`; set it to `agent` to use the model chosen on the Admin page) and stored in `changelog_entries`, so the page costs nothing to view. GitHub is asked for the merged list at most every 15 minutes; **Refresh** on the page asks again at once. Admins can **Regenerate** a summary that came out wrong. Setup: `GITHUB_TOKEN` (fine-grained personal access token, read-only Pull requests permission on the repo) and `GITHUB_REPO` in `.env.local` and in the Vercel project. Without the token the page shows a not-configured notice.

## Scheduled jobs

`vercel.json` runs the close check at 23:00 UTC on weekdays, the price history job at 23:30 UTC, and the morning sweep (pending evidence, reminders, overdue notices, earnings calendar, email retries, Drive channel renewal, crawl, and file reading) at 14:00 UTC. Both endpoints accept `Authorization: Bearer $CRON_SECRET` and can be run from the Admin page, with a date for backfills:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/close?date=2026-08-28"
```

## Scripts

- `npm run typecheck`, `npm run lint`, `npm test`
- `npm run smoke:providers AAPL` hits Yahoo, EDGAR and Finnhub live
- `npx tsx --conditions=react-server scripts/drive-smoke.ts` checks the Drive index tables and queries (no Google call)
- `npx tsx scripts/find-move.ts NVDA 4` lists recent sessions that met the 4 pp rule
- `npx tsx scripts/upload-model.ts NVDA model.xlsx` uploads a model without the browser
- `npx tsx scripts/create-test-account.ts <username> <password> --name "Full Name" --team tech` creates a username account without the Admin page; it goes through first-sign-in setup like any new member

## Docs

- [docs/product.md](docs/product.md): scope and the learning boundary
- [docs/original-outline.txt](docs/original-outline.txt): the original proposal
- [docs/decisions.md](docs/decisions.md): historical decision log

## Economic calendar

The team sidebar includes Economic Calendar next to Earnings. Live public agency feeds load without API credentials. Coverage is explicitly partial: private/regional events and consensus estimates still need a fuller provider. See [sources, MarketWatch investigation, and validation](docs/economic-calendar.md). With `ECONOMIC_CALENDAR_PREVIEW=1` in development, `/dev/economic-calendar?live=1` verifies live data; omitting `live=1` shows clearly labeled synthetic fixtures.
