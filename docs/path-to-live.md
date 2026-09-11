# Path to a live app

What's left between the current synthetic pilot and a genuinely live application, in dependency order. No timeline — steps only. Status mirrors [roadmap.md](roadmap.md), [v1-validation.md](v1-validation.md), and [decisions.md](decisions.md) as of main `741e2ad`.

## A. Close out deployment acceptance (synthetic pilot, on Azure)

- [x] Run deployed browser replays — THC and DRAM verified 2026-09-11 against the deployed origin as the Entra-authenticated administrator. Two combined replays preserved scoped IDs/counts; all eight deliveries were captured. THC test completion persisted; DRAM remains open. See [acceptance evidence](plans/section-a-evidence/README.md).
- [ ] Second developer sign-in (deliberately deferred by the user).
- Failed-resource disposition: **retained; optional cleanup not selected** for `agenthelper-dev-env`, `agenthelper-dev`, and `agenthelper-dev-worker`. No deletion or support case. See [KEEP record](plans/section-a-keep-record.md).

Required synthetic deployment acceptance is complete, with the second-developer exception above. This does not close the real-data, policy, or rollout work below.

## B. Evaluate the pilot with real analysts

- [ ] Replay THC and DRAM with Rikhil and Max: label each step automate/assist/analyst-owned; record correctness, duplicates, source quality, time saved, and learning outcomes.
- [ ] Capture Rikhil and Max's feedback, then Fund feedback.

## C. Replace fixtures with real integrations

- [ ] Select and verify a licensed market-data provider with actual SPX coverage (no silent proxy). This is the biggest gate to "actually works."
- [ ] Implement the real provider adapter plus a production session calendar, reference-close adjustments, corporate-action handling, and availability rules; reviewed before any real observation is used.
- [ ] Select a model provider and replace fixture reasoning feedback with real feedback (keeping the learning boundary: flag gaps, request revisions, never write the analyst's update).
- [ ] Configure a real email provider with idempotency/reconciliation so uncertain sends can't duplicate, plus actual recipient configuration.

## D. Production policy and data

- [ ] Approve the operating defaults as Fund policy: reminder offset, overdue notice, briefing send time, materiality criteria, delivery-failure owner.
- [ ] Set retention policy, provider storage rights, source permissions, and repository licensing.
- [ ] Load the real roster: teams, holdings, owners, administrators, email recipients; onboard via invite-only access.

## E. Roll out

- [ ] Establish baseline success measurements (gathering time, missed deadlines, false/duplicate alerts, source accuracy) before claiming improvement.
- [ ] Fund rollout to teams.

## Beyond v1

Earnings, historicals model writes, cross-team sharing, and semester continuity are approved follow-up workflows, not part of the first live release.
