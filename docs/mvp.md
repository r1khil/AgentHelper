# First release: major-movement pilot

## Scope

Dedicated team workspaces, holdings and owners, a reproducible closing trigger, factual email alerts, sourced evidence, analyst reasoning feedback, completion status, and meaningful daily briefings. Earnings, historical model writes, and cross-team agent conversations are deferred.

## Approved closing-movement trigger

Use the difference between the holding's daily return and SPX's daily return, measured in **percentage points**:

```text
holding_return_pct = 100 * (holding_price / holding_previous_close - 1)
spx_return_pct = 100 * (spx_level / spx_previous_close - 1)
relative_move_pp = holding_return_pct - spx_return_pct
qualifies = abs(relative_move_pp) >= 4.0
```

Prices must use aligned timestamps and trading sessions. Define provider, reference-close handling, corporate-action treatment, holidays, and timestamp tolerance before implementation. SPX is the requested benchmark; any proxy requires an explicit decision.

| Holding return | SPX return | Relative move | Qualifies |
| --- | --- | --- | --- |
| +5.0% | +0.7% | +4.3 pp | Yes |
| -3.5% | +0.8% | -4.3 pp | Yes |
| +4.0% | 0.0% | +4.0 pp | Yes |
| -4.0% | 0.0% | -4.0 pp | Yes |
| +3.9% | 0.0% | +3.9 pp | No |

Do not treat missing, stale, misaligned, or invalid inputs as a non-event. Record an explicit data-quality failure and expose it for resolution. The inclusive boundary was approved on 2026-09-10. Apply the same rule to ETFs and investigate relevant constituents and sectors.

## Workflow

1. An authorized team member maintains holdings and responsible owners.
2. A scheduled job loads validated holding and benchmark observations.
3. The rule engine evaluates a versioned Fund policy.
4. A qualifying event creates or updates one workspace and queues a factual notification.
5. Collection attaches company announcements, relevant news, peer movements, and source timestamps as available.
6. The assigned analyst reviews evidence and records completion after producing their own update.
7. Outstanding work receives reminders according to configured Fund deadlines.

Suggested investigation states: `open`, `in_progress`, `completed`. Delivery status and data-quality status are separate from investigation status. A failed notification must not lose an investigation. Completion records the actor, time, and a reference to the analyst's update where permitted.

## Alert contents

Ticker, holding return, SPX return, relative move in percentage points, observation timestamp/timezone, official closing status, and workspace link. Deliver by email to the relevant team; actual recipient configuration remains to be supplied. Automated messages must contain facts, not a generated investment conclusion.

## Evidence workspace

Show the observation and calculation inputs, policy version, owner, due time, status, linked documents, source publication and retrieval times, extracted facts with locations, possible relevant developments, unresolved questions, and analyst notes. Allow an explicit “no clear catalyst found” outcome; evidence proximity is not proof of causation.

## Reliability acceptance criteria

- Reproduce the examples and both threshold boundaries using synthetic fixtures.
- Reject stale/missing/misaligned observations; handle sessions, holidays, and corporate-action cases under an agreed policy.
- Reprocessing the same holding/session/event type does not duplicate workspaces or alerts.
- Only official closing observations trigger this release.
- Failed delivery is retried safely and remains visible; define provider idempotency/reconciliation to avoid duplicate sends after uncertain responses.
- Each factual claim links to its source; absent evidence is explicit.
- Every investigation has a responsible owner and a deadline or visible configuration error.
- Reminder scheduling stops after completion and records delivery attempts.
- Team access is enforced on reads and writes, including source retrieval.
- One past movement can be replayed end to end without sending real notifications.

## Pilot evaluation

Replay the THC and DRAM examples with Rikhil and Max, label each step automate/assist/analyst-owned, and record correctness, duplicates, source quality, and time saved. Treat example explanations as analyst claims to investigate. Record learning outcomes and follow-up feedback.

## Approved workflow details

Assign the holding owner, with team lead as fallback. Investigations are due at noon America/New_York on the next trading day; send one reminder before the deadline and one overdue notice to owner and lead. Configure the reminder offset and market calendar explicitly. Completion requires an analyst-authored update and supporting sources and records actor/time. Stop pending reminders when completed.

The agent may explain concepts, offer sourced possible catalysts, and ask questions. After the analyst provides reasoning, flag unsupported claims, missing evidence, alternatives, and contradictions with approved theses; ask for revisions rather than write a replacement.

Daily team briefings reuse the evidence infrastructure for material developments and upcoming catalysts. Suppress empty briefings, retain citations, and email workspace links. Send time and materiality criteria remain implementation choices.
