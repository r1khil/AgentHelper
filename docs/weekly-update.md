# Weekly update pack

Every Monday the execs email the fund a one-page deck, *Update for the week ended \<Friday\>*. The app gathers every data point on that slide and Hoot emails it to Aadi every Sunday, with Saad in CC, in the deck's order and style so each section pastes straight in. **The agent prepares the evidence; the student owns the interpretation.** Nothing is emailed to the fund by the app: Aadi still assembles and sends the deck.

## What the app builds

`/weekly` (execs and admins only) lists the packs; `/weekly/<Friday>` is one pack. Its sections mirror the deck:

| Section | Where it comes from |
| --- | --- |
| Portfolio Highlights | The price target sheet's *2025 Time-Weighted Returns* tab: AUM (latest dated row), "Owl Fund YTD Performance" and "SPX YTD Performance". Relative return is YTD less the benchmark. A figure an exec types and saves wins over the sheet; if the sheet can't be read, last week's values are carried and flagged. |
| Top 3 / Worst 3 performers | The sheet's Price Targets **"% 1 Week"**, for the tickers Portfolio Data holds shares of. Read on the weekend, that column is exactly the deck's Monday-close-to-Friday-close window (checked 2026-09-27 against the app's closes). It is live, so the build cross-checks it against the app's own Monday and Friday closes from `daily_closes`: if fewer than 80% of holdings agree within 0.15 points, the sheet's window has moved on and the closes are used instead. Rows with no value (an error, or a flat 0.0% where the formula is missing) take the closes too. Names are the company's own from Yahoo ("Amazon.com, Inc."), with suffixes shortened the deck's way ("Microsoft Corp.", "Taiwan Semiconductor Manufacturing Co."). |
| Last Week's Agenda | A read-only snapshot of the previous pack's agenda, rolled forward on every build. |
| This Week's Agenda | **Earnings:** holdings reporting in the coming Monday to Friday per the sheet's Earnings Date column (the app's earnings calendar fills in a holding the sheet has no date for), tracked sector bellwethers, and the week's largest reporters from Finnhub: worth $10B or more by Yahoo's market cap, the 8 largest at most. For the week of 2026-09-21 that rule gives exactly the five biggest names the deck listed. Within a day, reports are listed largest first, as the deck does. **Market News:** the fixed set of US releases the execs list, under their names ("Weekly Jobless Claims", "Uni. of Mich. Consumer Survey", "U.S. Interest Rate Decision", "Treasury Balance"), in release-time order (`market-news.ts` holds the list). **Process Updates:** the fund's semester calendar (see below). |
| YTD Performance chart | Pasted by hand, as before. It is deliberately left out of the automation. |

Every line and section on the page has a copy button, and **Copy whole pack** puts the lot on the clipboard in the deck's order.

## The Sunday cycle

One cron, `/api/cron/weekly` at `0 13 * * 0` (Sunday 09:00 New York), guarded by `CRON_SECRET` like the others. It:

1. takes the Friday that just passed as the week ending, and creates the pack if it does not exist;
2. snapshots the previous pack's agenda into *Last Week's Agenda* and carries its figures forward as placeholders;
3. reads the price target sheet once: the three figures, each holding's "% 1 Week", and the coming week's earnings dates; and reads the fund calendar for the coming week's process updates;
4. ranks the performers and collects the coming week's earnings and economic releases;
5. has Hoot email the pack (`src/lib/weekly/email-text.ts` writes it, `email.ts` sends it through OpenMail).

Each step is caught on its own: a provider that is down costs that one section, is recorded in the pack's `sources`, and shows on the page. The email still goes out and its **Checks** list names what to fill in by hand, along with anything the sheet and the app disagree on. **A pack an exec has edited keeps its agenda, and a pack marked sent is not rebuilt.**

The email is sent once per week (recorded as `sources.email`); a retried cron reuses the same OpenMail idempotency key, so it cannot go out twice. On the pack page, **Send now / Send again** sends it to the list and **Send a copy to me** sends a test copy to whoever pressed it without counting as the week's email. The card also previews the exact text.

Admins can run the whole thing by hand from **Admin → Jobs → Weekly update**, optionally with a date, which builds the pack for the Friday on or before it and sends its email if it hasn't gone. Execs can rebuild a pack from `/weekly`.

## Process updates from the fund calendar

The execs keep the semester's schedule in an Excel file in the app's Drive folder, `<Semester> <Year> Calendar.xlsx` (`Fall 2026 Calendar.xlsx` today). There is one tab per month with Sunday to Saturday in columns B to H, and rows that alternate day numbers and that day's text, such as `IT Pitch` / `Due: C&C ICR`. The build downloads the two newest such files (read-only; a new semester's file can arrive before the old one ends, and the newer wins) and writes each day the deck's way. What happens that day comes first, then each item after "Due:" with " Due" added. "Follow Up" becomes "Follow-Up", "Sector Update Presentations" becomes "Sector Updates", "HC" becomes "Healthcare", a spaced "&" becomes "and", and "Speaker Meeting: X" becomes "X Speaker". For the week of 2026-09-21 this reproduces the deck's line word for word, except that the deck left out Monday's Industrials Pitch. Next semester, drop the new file into the folder and nothing else changes.

## Recipients and pausing

By default the email goes to Aadi (`apatil@`) with Saad (`squddus@`) in CC. **Admin → Weekly update → Email the pack to** overrides it (the `weekly_recipients` app setting): the first address goes in To, the rest in CC. Test accounts (`*.owlfund.local`) are never emailed, so a list holding only a test account pauses the email while the pack still builds. That is how it was paused on 2026-09-27; clear the setting to go back to the default.

Replies reach Hoot's inbox and are answered like any question to Hoot. The older Resend inbound route for process-update replies (`/api/email/inbound`, `weekly_requests`) no longer receives anything now that the calendar supplies them.

## Known limits

- The decks sometimes name smaller reporters (ABVX, UEC) that no size rule would pick; add those by hand.
- Market News can run longer than the deck's usual six to eight releases in a heavy week (a jobs week has a dozen). Trim as you paste.
- "% 1 Week" measures the deck's window only until Monday's open. A rebuild after that falls back to the closes, which give the same numbers.
- Performers need Friday closes in `daily_closes` for the cross-check, which the prices job writes on weekday nights. Weeks before 2026-09-18 have no usable data.
- Vercel Hobby timing is only accurate to the hour, so the email can land any time between 09:00 and 10:00 New York.
- `npm run smoke:weekly -- <Friday>` builds a pack against the live database and prints the email without sending it.
