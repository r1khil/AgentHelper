# Proposed architecture

This is a logical design, not a chosen implementation stack.

## Components

- **Workspace:** holdings, evidence, notes, owners, due dates, and completion.
- **Shared services:** team membership/access, versioned Fund policies, sources, audit records, and job scheduling.
- **Data adapters:** market observations, filings, company announcements, news, and later earnings/historicals sources.
- **Movement engine:** deterministic validation and return comparison; no model is needed to decide whether the threshold is met.
- **Evidence collection:** stores provenance and distinguishes extraction from analyst-authored interpretation.
- **Delivery worker:** factual alerts and reminders, with persistent attempts and retry handling.

Start with one deployable application and a background worker if the selected stack supports that simply. Six team contexts do not require six independent deployments or six copies of market-data collection.

## Proposed records

| Record | Essential fields |
| --- | --- |
| Team / Membership | Team ID, user ID, role, access scope |
| Holding | Stable security ID, ticker, exchange, team, owner, effective dates |
| FundPolicy | Version, benchmark, threshold, observation mode, session rules, deadline/reminder rules |
| MarketObservation | Security ID, value, previous close, currency, session, timestamp, provider, quality status |
| MovementEvent | Holding, session, event type, observation IDs, returns, relative move, policy version |
| Investigation | Event, team, owner, due time, status, completion actor/time, update reference |
| Source | URL/document ID, title, publisher, publication/retrieval times, location, permission scope |
| EvidenceFact | Source ID/location, reported content or value, period/units/currency where applicable, derivation |
| AnalystNote | Author, team, access scope, content, working/approved status, timestamps |
| DeliveryAttempt | Event/reminder ID, channel, recipient reference, idempotency key, attempt, outcome |
| AuditEvent | Actor, action, target, timestamp, previous/new values where appropriate |

Keep source assertions, system calculations, and analyst opinions distinct. Retain source references and allowed excerpts; source storage depends on provider licensing and Fund policy.

## Processing guarantees

Use a durable event/workspace write and notification outbox so delivery failures cannot erase detected events. Enforce a uniqueness key based on security/holding identity, team, trading session, and event type, with explicit policy-version reprocessing rules. Notifications and reminders have independent idempotency keys. Do not rely on model memory for state or permissions.

Authorization belongs at the service and retrieval layers. Retrieved documents are evidence, not instructions that can alter policies, permissions, or workflows.

## Future Historicals Solver boundary

Review the existing tool first. A possible request contains company identity, model version, approved mapping/version, requested periods, and source references. A proposal returns values with period, units, currency, reported labels, source locations, calculations, and exception flags. Approval and formula-preserving model writes stay a separate audited step. This contract is provisional; no API compatibility has been verified.
