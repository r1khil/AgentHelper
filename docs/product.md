# Product scope

## Purpose

Reduce the time Owl Fund students spend gathering information, while keeping every number traceable to a filing and every conclusion the student's own.

## The learning boundary

The agent gathers evidence, explains concepts, lists sourced possible catalysts, and asks questions. After the student writes, it flags unsupported claims, missing evidence, alternative explanations, and contradictions with the recorded thesis. It never drafts the update, the reflection, the thesis, or the conclusion, and the UI has no affordance for it.

## Teams and roles

Six sector teams: Consumer & Communication Services, Information Technology, Industrials, Commodities, Healthcare, FIG. Roles: associate analyst, lead analyst (team-wide management; receives the team's prep-pack email), exec and admin (all teams; admin manages members).

## Rules

- Sources: filings, company releases and XBRL first; news second. Every factual claim in the agent's output carries a source id returned by a tool.
- Earnings: expectations lock at the report date so the reflection is honest. Actuals are extracted only from the release and XBRL, with missing items shown as missing.
- Historicals: the student maps the anchor period and writes the rationale; proposals are pure data (no LLM); ambiguous cases (YTD-only, restatements, unit mismatch, missing concept) become exceptions; approved values are written into a new file version by patching cell XML, so formulas, formatting and charts survive; formula cells are never written.

## Attribution

Execs and admins see why the Fund is ahead of or behind the S&P 500: Brinson-Fachler allocation, selection and interaction by GICS sector, plus contribution to return by holding and by team. Lead analysts see the same for their own team's holdings against the sectors assigned to that team.

- The trade ledger (execs and admins) is the source of truth for what the Fund owned and when. It opened from the book as of the 2026-09-17 close; share counts and weights on holdings are derived from it. Entries are voided, never deleted. Past trades, cash movements and an earlier opening snapshot can be imported from a CSV, which is checked row by row and previewed against current share counts before anything is written.
- Deposits and withdrawals are not performance. Dividends reinvest on the ex-date and are never entered by hand. Splits are applied automatically.
- Benchmark: S&P 500 sector weights saved by an exec with an as-of date, applied to Select Sector SPDR total returns. Weights drift between saved sets. The benchmark return is defined as the weighted sector returns, so the effects add up to the active return; SPY is shown only as a reference.
- Daily effects are linked with the Carino method. Missing closes, old benchmark weights and unclassified holdings are shown as notices, never hidden.

## Access

Invite-only. Members see their team; execs and admins see all teams. Position sizes and attribution are limited to execs, admins and the lead analysts of the team concerned. Test accounts use a username and password and never receive email.
