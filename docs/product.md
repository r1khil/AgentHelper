# Product scope

## Purpose

Reduce the time Owl Fund students spend gathering information, while keeping every number traceable to a filing and every conclusion the student's own.

## The learning boundary

The agent gathers evidence, explains concepts, lists sourced possible catalysts, and asks questions. After the student writes, it flags unsupported claims, missing evidence, alternative explanations, and contradictions with the recorded thesis. It never drafts the update, the reflection, the thesis, or the conclusion, and the UI has no affordance for it.

## Teams and roles

Six sector teams: Consumer & Communication Services, Information Technology, Industrials, Commodities, Healthcare, FIG. Roles: associate analyst, lead analyst (team-wide management, fallback owner for alerts), exec and admin (all teams; admin manages members).

## Rules

- Major movement: absolute difference between a holding's daily return and the S&P 500's daily return of at least 4.0 percentage points, using official closes. Inclusive boundary. Missing or stale data is a visible data-quality problem, never a silent skip or a proxy.
- Deadline: noon America/New_York on the next trading day. One reminder before, one overdue notice after, to owner and lead.
- Sources: filings, company releases and XBRL first; news second. Every factual claim in the agent's output carries a source id returned by a tool.
- Earnings: expectations lock at the report date so the reflection is honest. Actuals are extracted only from the release and XBRL, with missing items shown as missing.
- Historicals: the student maps the anchor period and writes the rationale; proposals are pure data (no LLM); ambiguous cases (YTD-only, restatements, unit mismatch, missing concept) become exceptions; approved values are written into a new file version by patching cell XML, so formulas, formatting and charts survive; formula cells are never written.

## Access

Invite-only. Members see their team; execs and admins see all teams. Test accounts use a username and password and never receive email.
