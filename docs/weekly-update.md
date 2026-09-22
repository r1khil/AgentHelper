# Weekly update pack

Every Monday the execs email the fund a one-page deck, *Update for the week ended \<Friday\>*. Rebuilding it by hand is eight steps. The app now prepares the parts it can evidence and leaves the judgement to the execs: **the agent prepares the evidence; the student owns the interpretation.** Nothing is emailed to the fund by the app — the execs still assemble and send the deck.

## What the app builds

`/weekly` (execs and admins only) lists the packs; `/weekly/<Friday>` is one pack. Its sections mirror the deck:

| Section | Where it comes from |
| --- | --- |
| Portfolio Highlights | Three numbers typed by an exec: AUM in $k, fund YTD %, SPXTR YTD %. Relative return is computed as YTD less the benchmark and rendered in the deck's style (`$4,646.9k`, `6.8%`, `(5.7%)`). Last week's values are pre-filled and flagged *carried from last week* until someone saves them. |
| Top 3 / Worst 3 performers | Monday-close-to-Friday-close price return per active holding from `daily_closes`, no weights. That is the window the execs use: the 18-Sep-2026 deck's SOXX, EVR and CI figures reproduce exactly from it. A holding with a close missing at either end is named in a notice instead of ranked. |
| Last Week's Agenda | A read-only snapshot of the previous pack's agenda, rolled forward on every build. |
| This Week's Agenda | Earnings (holdings' reports plus tracked sector bellwethers for the coming Mon–Fri), Market News (economic-calendar events of importance ≥ 2, minus auctions, speeches, inventories and positioning, with companion series folded into their headline release, at most 12), Process Updates (the execs' own words, from their email replies). Each section is a textarea of `Day: text` lines and renders as `Earnings: ANAB (Monday), TCOM, FPS (Tuesday), LEN (Wednesday)`. |
| YTD Performance chart | Still pasted by hand from the price target sheet, which the app cannot read yet. |

Every line and section has a copy button, and **Copy whole pack** puts the lot on the clipboard in the deck's order.

## The Sunday cycle

One cron, `/api/cron/weekly` at `0 13 * * 0` (Sunday 09:00 New York), guarded by `CRON_SECRET` like the others. It:

1. takes the Friday that just passed as the week ending, and creates the pack if it does not exist;
2. snapshots the previous pack's agenda into *Last Week's Agenda* and carries its figures forward as placeholders;
3. ranks the week's performers from the Friday closes the prices job already stored;
4. collects the coming week's earnings and economic releases;
5. emails each exec for their Process Updates, pre-filled with last week's items.

Each step is caught on its own: a provider that is down costs that one section, is recorded in the pack's `sources`, and shows on the page as a notice. **A pack an exec has edited keeps its agenda, and a pack marked sent is not touched at all.**

There is no reminder job. **Resend ask** on the pack page sends the request again.

Admins can run the whole thing by hand from **Admin → Jobs → Weekly update**, optionally with a date, which builds the pack for the Friday on or before it. Execs can rebuild a pack from `/weekly`.

## Process updates by email

Each ask is one `weekly_requests` row with a random token and a reply-to address of `weekly+<week ending>-<token>@$INBOUND_EMAIL_DOMAIN`. The exec replies in the same `Day: text` shape; Resend posts an `email.received` webhook to `/api/email/inbound`; the route verifies the signature, answers 200, and reads the message afterwards. The raw reply is stored **before** any parsing, so a model failure never loses what an exec wrote. Parsing uses `OPENROUTER_SUMMARY_MODEL` (the chat model by default) under instructions that forbid rewording or inventing anything, and falls back to one item per line.

The merged result replaces the pack's Process Updates — unless the exec edited the pack after the reply arrived, or the pack is marked sent. Then the page shows a banner and the exec folds in whatever they want by hand.

Replies are idempotent: `reply_email_id` is unique, so a webhook Resend delivers twice is applied once.

## One-time setup

1. **Apply the migration** (it creates `weekly_updates` and `weekly_requests` and nothing else):
   ```bash
   npx tsx scripts/apply-sql.ts drizzle/0015_weekly.sql
   ```
   Do not run `db:generate`; migrations from `0002` on are hand-written.
2. **Sending account.** The fund has no domain verified in Resend, and Resend's shared `onboarding@resend.dev` sender only delivers to the Resend account owner, so outgoing mail goes through a Gmail account made for the app. Turn on 2-Step Verification for it, create an app password (Google Account → Security → App passwords), and set `GMAIL_USER` and `GMAIL_APP_PASSWORD` (optionally `GMAIL_FROM_NAME`, default `The Owl's Nest`). When both are set, every email the app sends goes through Gmail; otherwise it falls back to Resend and `EMAIL_FROM`. The Gmail inbox itself receives nothing useful: replies go to the reply-to address below.
3. **Inbound domain.** Replies still come in through Resend, which gives every account a free receiving domain, `<id>.resend.app` (Resend → Emails → Receiving). Set `INBOUND_EMAIL_DOMAIN` to it. No DNS is needed. A custom domain with Resend's MX record also works if the fund gets one later. `RESEND_API_KEY` stays set, because the app reads each reply through the Resend API.
4. **Webhook.** In Resend, add a webhook for the `email.received` event pointing at `<APP_URL>/api/email/inbound`, and put its signing secret in `RESEND_WEBHOOK_SECRET`. The route is public by design (it is listed in `PUBLIC_PATHS` in `src/proxy.ts`); the svix signature is its authentication, and a request without a valid one is rejected with 400.
5. **Recipients.** By default the ask goes to every profile with the `exec` role. Override it on the Admin page (**Weekly update → Ask these people**), which writes the `weekly_recipients` app setting.
6. **Production env.** `vercel env add` each of `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `INBOUND_EMAIL_DOMAIN` and `RESEND_WEBHOOK_SECRET` for production, then redeploy.

With no sender configured (neither Gmail nor `RESEND_API_KEY`), without `INBOUND_EMAIL_DOMAIN`, or for a `*.owlfund.local` test account, the request row is still created and its `send_error` records the skip (`skipped: test account`, `skipped: email not configured`, `skipped: INBOUND_EMAIL_DOMAIN is not set`) — the same behaviour as the movement notifications. That makes it safe to exercise the job against test accounts without emailing a real exec.

## Known limits

- The three highlight figures and the YTD chart live in the execs' price target sheet, which the app may not read yet. Phase 2 replaces the inputs with a Drive-based sheet reader.
- Performers need Friday closes in `daily_closes`, which the prices job writes on weekday nights. Weeks before 2026-09-18 have no usable data.
- Gmail caps a regular account at about 500 recipients a day, far above what the app sends. Google can lock an account it thinks is automated; if sends start failing with an auth error, sign in to the Gmail account once and make a new app password.
- Vercel Hobby allows up to 100 daily crons per project, so the Sunday cron deploys as-is; Hobby timing is only accurate to the hour.
