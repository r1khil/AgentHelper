# Weekly update pack

Every Monday the execs email the fund a one-page deck, *Update for the week ended \<Friday\>*. The app gathers every data point on that slide and Hoot emails it to Aadi every Sunday, with Saad in CC, in the deck's order and style so each section pastes straight in. **The agent prepares the evidence; the student owns the interpretation.** Nothing is emailed to the fund by the app: Aadi still assembles and sends the deck.

## What the app builds

`/weekly` (execs and admins only) lists the packs; `/weekly/<Friday>` is one pack. Its sections mirror the deck:

| Section | Where it comes from |
| --- | --- |
| Portfolio Highlights | The price target sheet's *2025 Time-Weighted Returns* tab: AUM (latest dated row), "Owl Fund YTD Performance" and "SPX YTD Performance". Relative return is YTD less the benchmark. A figure an exec types and saves wins over the sheet; if the sheet can't be read, last week's values are carried and flagged. |
| Top 3 / Worst 3 performers | The sheet's Price Targets **"% 1 Week"**, for the tickers Portfolio Data holds shares of. Read on the weekend, that column is exactly the deck's Monday-close-to-Friday-close window (checked 2026-09-27 against the app's closes). It is live, so the build cross-checks it against the app's own Monday and Friday closes from `daily_closes`: if fewer than 80% of holdings agree within 0.15 points, the sheet's window has moved on and the closes are used instead. Rows with no value (an error, or a flat 0.0% where the formula is missing) take the closes too. Names come from the app, title-cased when they were filed in capitals. |
| Last Week's Agenda | A read-only snapshot of the previous pack's agenda, rolled forward on every build. |
| This Week's Agenda | Earnings: holdings reporting in the coming Monday to Friday per the sheet's Earnings Date column (the app's earnings calendar fills in a holding the sheet has no date for), plus tracked sector bellwethers. Market News: economic-calendar events of importance ≥ 2, minus auctions, speeches, inventories and positioning, companion series folded into their headline release, at most 12. Process Updates: left for the execs; the email quotes last week's for reference. |
| YTD Performance chart | Pasted by hand, as before. It is deliberately left out of the automation. |

Every line and section on the page has a copy button, and **Copy whole pack** puts the lot on the clipboard in the deck's order.

## The Sunday cycle

One cron, `/api/cron/weekly` at `0 13 * * 0` (Sunday 09:00 New York), guarded by `CRON_SECRET` like the others. It:

1. takes the Friday that just passed as the week ending, and creates the pack if it does not exist;
2. snapshots the previous pack's agenda into *Last Week's Agenda* and carries its figures forward as placeholders;
3. reads the price target sheet once: the three figures, each holding's "% 1 Week", and the coming week's earnings dates;
4. ranks the performers and collects the coming week's earnings and economic releases;
5. has Hoot email the pack (`src/lib/weekly/email-text.ts` writes it, `email.ts` sends it through OpenMail).

Each step is caught on its own: a provider that is down costs that one section, is recorded in the pack's `sources`, and shows on the page. The email still goes out and its **Checks** list names what to fill in by hand, along with anything the sheet and the app disagree on. **A pack an exec has edited keeps its agenda, and a pack marked sent is not rebuilt.**

The email is sent once per week (recorded as `sources.email`); a retried cron reuses the same OpenMail idempotency key, so it cannot go out twice. On the pack page, **Send now / Send again** sends it to the list and **Send a copy to me** sends a test copy to whoever pressed it without counting as the week's email. The card also previews the exact text.

Admins can run the whole thing by hand from **Admin → Jobs → Weekly update**, optionally with a date, which builds the pack for the Friday on or before it and sends its email if it hasn't gone. Execs can rebuild a pack from `/weekly`.

## Recipients and pausing

By default the email goes to Aadi (`apatil@`) with Saad (`squddus@`) in CC. **Admin → Weekly update → Email the pack to** overrides it (the `weekly_recipients` app setting): the first address goes in To, the rest in CC. Test accounts (`*.owlfund.local`) are never emailed, so a list holding only a test account pauses the email while the pack still builds. That is how it was paused on 2026-09-27; clear the setting to go back to the default.

Replies reach Hoot's inbox and are answered like any question to Hoot. Filing a reply's process updates on the pack is the next release: it will match replies by OpenMail thread and retire the older Resend inbound route (`/api/email/inbound`, `weekly_requests`), which no longer receives anything.

## Known limits

- Earnings lists holdings and bellwethers only. The decks also name broader S&P reporters, which the execs still add by hand.
- "% 1 Week" measures the deck's window only until Monday's open. A rebuild after that falls back to the closes, which give the same numbers.
- Performers need Friday closes in `daily_closes` for the cross-check, which the prices job writes on weekday nights. Weeks before 2026-09-18 have no usable data.
- Vercel Hobby timing is only accurate to the hour, so the email can land any time between 09:00 and 10:00 New York.
- `npm run smoke:weekly -- <Friday>` builds a pack against the live database and prints the email without sending it.
