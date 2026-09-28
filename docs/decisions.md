# Decision log

## Approved baseline — 2026-09-10

Approver: Rikhil Sharma, exercising final Fund policy authority. Approved in conversation after reviewing the proposed decisions and implementation task list. This baseline supersedes conflicting proposals in the original outline. Timing and staffing remain with Rikhil and Max.

Purpose: improve learning and analyst outputs while preserving human reasoning. Agents should proactively prepare useful evidence and questions.

| Area              | Approved decision                                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product           | One shared application; dedicated workspace and persistent holdings, theses, peers, prior updates, and open questions for each team.                                                                                    |
| Proactivity       | Automatically investigate qualifying movements. Deliver daily team briefings on material developments and upcoming catalysts; suppress empty briefings. Earnings preparation follows movements.                         |
| Learning boundary | Gather evidence, explain concepts, suggest sourced possible catalysts, and ask questions. Analysts author causal arguments, thesis implications, and investment conclusions.                                            |
| Analyst feedback  | After the analyst supplies reasoning, flag unsupported claims, missing evidence, alternative explanations, and contradictions with the recorded thesis. Request revisions rather than generate a replacement update.    |
| Context           | Require holdings and owners; add theses, peers, and prior updates as available. Flag missing context. Analysts approve stored thesis changes; never infer investment positions from chat alone.                         |
| Movement          | Absolute difference of daily returns versus actual SPX >= 4 percentage points, either direction, using official closing observations. Apply to ETFs too, with constituent and sector investigation.                     |
| Data quality      | Licensed provider with actual SPX coverage; no silent proxy. Missing, stale, or incompatible observations create visible errors. Provider selection depends on verified access and coverage.                            |
| Evidence          | Prefer filings, company announcements, and investor-relations materials; supplement with reputable reporting. Factual assertions require source and timestamp. Separate facts, calculations, and possible explanations. |
| Notifications     | Email factual alerts and meaningful briefing links to the relevant team; work occurs in the web application. Dry runs send nothing.                                                                                     |
| Ownership         | Holding owner is responsible, with team lead as fallback. Missing ownership must be visible. Superseded 2026-09-28: the whole team owns its write-ups (see Team-owned write-ups below).                                 |
| Deadlines         | Noon America/New_York on the next trading day. One reminder before the deadline and one overdue notice to owner and lead. Recipients superseded 2026-09-28 (see Team-owned write-ups below).                             |
| Completion        | Analyst-authored update plus supporting sources, with actor and completion time recorded.                                                                                                                               |
| Stack             | TypeScript, Next.js, PostgreSQL, managed authentication/storage, and durable background jobs. Replaceable provider integrations.                                                                                        |
| Access            | Invite-only Fund access. Members access their own team's work; Fund administrators access all teams. Cross-team sharing requires explicit approval.                                                                     |
| Validation        | Replay THC and DRAM; treat their explanations as analyst claims to investigate. Verify boundaries, invalid data, duplicates, retries, provenance, and permissions.                                                      |
| Success           | Evaluate evidence explanation, fact/hypothesis distinction, and defensible thesis implications; also preparation time and unsupported claims. Collect brief feedback after investigations.                              |

## Remaining implementation choices and inputs

These were not resolved by baseline approval:

- Specific market-data, research, model, email, hosting, auth/storage, and job providers; account access and spending budget.
- Reference-close adjustments, corporate actions, session calendar, timestamp tolerance, and closing-data availability rules.
- Actual team roster, holdings, owners, administrator list, and email recipients.
- Daily briefing send time, materiality criteria, pre-deadline reminder offset, and delivery-failure owner.
- Provider storage rights, retention, and source permissions.
- Cross-team sharing approver and approval mechanism.
- Repository licensing; historicals integration and proficiency rules remain deferred.

## Future decision record template

- Decision:
- Owner / approver:
- Date:
- Chosen behavior:
- Rationale and evidence:
- Acceptance examples:
- Supersedes:

## Two-developer implementation — 2026-09-10

Approved in the implementation request: Azure Container Apps Consumption (zero to one web replica), Neon Free PostgreSQL, Entra External ID basic sign-in, private GHCR, native Container Apps secrets, PostgreSQL jobs, synthetic bounded sources, fixture model feedback, and captured email. Deployment is in v1; paid providers, uploads, earnings, historical model writes, cross-team sharing, and Fund rollout are deferred. The second developer invitation was deferred by the user.

Operating defaults are proposals, not additional approved Fund policy: 10 a.m. Eastern reminder, noon overdue notice, 8 a.m. trading-day briefing; a fixture calendar, split-adjusted price basis, explicit corporate-action ambiguity rejection, and 60-second close tolerance. A licensed provider and production calendar must be selected and reviewed before real observations are used.

The hourly worker runs 12–22 UTC weekdays, covering the proposed Eastern deadlines in both DST offsets. It exits after at most 30 jobs; leases last two minutes and attempts are capped at three. Captured delivery is transactionally deduplicated. No live email or model provider is configured.

## Attribution analysis — 2026-09-17

- Decision: add fund-level and team-level performance attribution.
- Owner / approver: Rikhil Sharma.
- Chosen behavior: positions come from an exec-maintained trade ledger seeded from the 2026-09-17 book; Brinson-Fachler by GICS sector plus contribution by holding and team; benchmark is exec-saved S&P 500 sector weights applied to the 11 Select Sector SPDR ETFs; dividends are treated as automatically reinvested on the ex-date; the fund page is for execs and admins, the team tab for leads and above.
- Rationale and evidence: free data sources do not provide S&P 500 constituents, and sector SPDRs track the index sectors closely; a ledger handles position changes correctly where a static share count cannot.
- Known limits: Yahoo sector labels are not official GICS (overridable per security); reinvestment happens at the ex-date close, so share counts can drift slightly from broker statements; sector SPDRs carry a small fee drag against true index sectors.

## Google Drive connection — 2026-09-17

- Decision: give the research agent read access to the Fund's documents in Google Drive, and file analyst uploads into the same folder.
- Owner / approver: Rikhil Sharma.
- Chosen behavior: the folder lives in the admin's own Google account and is connected once from the Admin page (OAuth, refresh token stored encrypted). Scopes are exactly `drive.readonly` + `drive.file`: the app can read everything in the folder and add new files and folders, and can never edit or delete anything it did not create; no delete exists in the code at all. Layout is sector folder → company folder `Company (TICKER)` → files. Analysts upload documents on the holding page (initiating coverage, earnings update, model, other); app-uploaded Excel models are mirrored as `<TICKER> Model (app).xlsx` with Drive revisions. Documents are fund-wide in the app, matching how the analyst drive is already shared.
- Learning boundary clarification: summarizing, quoting, or comparing the team's existing documents with citations is evidence gathering and allowed. Authoring new thesis, update, or conclusion text remains off limits.
- Rationale and evidence: the recorded thesis lives in the initiating coverage report, not in the workspace thesis field, so the agent kept answering "nothing on file". A service account was rejected because files it uploads into a My Drive folder are owned by the service account and hit its storage quota.
- Known limits: Drive shortcuts and files shared into the folder from outside the admin's account are skipped by the listing; Google exports of Docs/Sheets/Slides are capped at 10MB and downloads at 25MB; the consent screen must be Internal or the token expires after seven days.

## Weekly update pack — 2026-09-22

- Decision: build the Monday exec deck's evidence in the app, and collect the parts the app cannot evidence by email.
- Owner / approver: Rikhil Sharma.
- Chosen behavior: a weekly pack page for execs and admins at `/weekly`, keyed by the Friday the week ended on. One Sunday cron (09:00 New York) builds the pack — Monday-close-to-Friday-close performers from `daily_closes`, the coming week's holding and bellwether earnings, economic-calendar events of importance ≥ 2 capped at 12, last week's agenda rolled forward, last week's figures carried as placeholders — then emails each exec for their Process Updates with a tokenised reply-to address. Replies arrive through a Resend inbound webhook, are stored raw, parsed into `{day, text}` items by the summary model under parse-only instructions, and merged into the pack. Exec edits and a pack marked sent always win over automation; a reply that lands after an edit raises a banner instead of overwriting. AUM, fund YTD and SPXTR YTD stay manual inputs and the YTD chart stays a manual paste.
- Rationale and evidence: the three headline figures and the chart series live in the execs' price target sheet, which the app has no access to, and the app ledger only opened 2026-09-17, so it cannot produce Jan-1 YTD figures itself. Everything else in the deck is already in the workspace's own data. Process-update wording is interpretation, so the app asks for it and parses it rather than writing it.
- Known limits: performers need Friday closes from the prices job, so weeks before 2026-09-18 are empty; inbound email needs a verified sending domain, an MX record on an inbound subdomain and a webhook secret before any ask can be answered; the Hobby plan may refuse a fourth cron, in which case the Sunday run dispatches from the morning sweep.
- Supersedes: nothing. Phase 2 (a Drive-based reader for the price target sheet, and a rendered YTD chart) is deferred.

## Team-owned write-ups — 2026-09-28

- Decision: drop the per-person owner of a holding and of a movement. A movement write-up belongs to the whole team that holds the stock.
- Owner / approver: Rikhil Sharma.
- Chosen behavior: every member of the team sees an unfinished write-up as theirs on Today and in Hoot's feed ("Your team owes 1 write-up, due 12:00 ET Monday."); anyone on the team can write and complete it, and the movement records who completed it. Leads see their own team's overdue write-ups the same way; execs and admins also see other teams' overdue ones ("META write-up is overdue"). Movement alerts, the reminder and overdue emails, and the earnings prep-pack email go to the team's lead analysts, or to everyone on the team when it has no lead. Earnings expectations nudges go to the holding's team.
- Rationale and evidence: the team, not one analyst, is accountable for a holding, and owners were never set up in practice. Emailing only the leads by default keeps within OpenMail's 20 cold sends a day; the fallback covers a team whose lead isn't in the app yet.
- Known limits: the `holdings.owner_id` and `movements.owner_id` columns stay in the database with their old values; the app no longer reads or writes them.
- Supersedes: the Ownership row of the 2026-09-10 baseline, the "owners" part of its Context row, and the "owner and lead" recipients of its Deadlines row.
