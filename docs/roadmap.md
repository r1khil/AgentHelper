# Implementation task list

Baseline approved by Rikhil Sharma on 2026-09-10. Order expresses dependencies, not deadlines or staffing assignments. The synthetic movement pilot is implemented. Checkboxes below describe development-fixture coverage; they do not claim live provider or Fund rollout readiness. Deployment acceptance is tracked in [v1-validation.md](v1-validation.md).

## 1. Record the approved specification

- [x] Record approved policy, product, and architecture choices.
- [x] Align the product scope and first-release specification.
- [x] Resolve remaining provider/configuration choices in [decisions.md](decisions.md).

Acceptance: approved policy is distinguished from outstanding implementation choices.

## 2. Application foundation and permissions

- [x] Scaffold TypeScript and Next.js with documented local setup.
- [ ] Configure PostgreSQL, migrations, managed authentication/storage, and hosting.
- [x] Implement invite-only membership, team roles, and Fund administrators.
- [x] Enforce team access on service reads/writes and source retrieval.

Acceptance: members cannot access another team's private records; administrators have explicit Fund-wide access.

## 3. Holdings and persistent team context

- [x] Manage holdings, responsible owners, and team-lead fallback.
- [x] Store theses, peers, prior updates, and open questions with provenance.
- [x] Flag missing context and require analyst approval for thesis changes.

Acceptance: each holding has an owner or a visible configuration error; chat cannot silently change an approved thesis.

## 4. Market observations

- [ ] Verify licensed provider access and actual SPX coverage.
- [x] Define sessions, adjusted reference closes, corporate actions, and timestamp tolerances.
- [x] Implement replaceable adapters and persisted validated closing observations.
- [x] Expose missing, stale, and incompatible data as errors.

Acceptance: aligned valid observations are reproducible; bad inputs cannot become a silent non-event.

## 5. Movement engine

- [x] Implement versioned absolute return-difference rule, inclusive at 4 percentage points.
- [x] Cover stocks and ETFs using official closing observations.
- [x] Test positive/negative boundaries, below-threshold cases, and invalid inputs.

Acceptance: deterministic synthetic fixtures reproduce the approved examples and calculation inputs are retained.

## 6. Investigations and delivery

- [x] Persist investigations and notification outbox atomically.
- [x] Deduplicate events and implement durable jobs, retries, and delivery history.
- [x] Capture factual team messages linking to investigations; no live email provider.
- [x] Assign owners and noon Eastern next-trading-day deadlines.
- [x] Implement one pre-deadline reminder and one overdue owner/lead notice; stop reminders on completion.

Acceptance: replays and uncertain delivery outcomes do not create duplicate work; delivery failure cannot erase an investigation.

## 7. Evidence collection

- [x] Collect labeled synthetic primary-source and reporting fixtures with locations and timestamps.
- [x] Retrieve company, peer, sector, and ETF constituent context as relevant.
- [x] Separate facts, calculations, and sourced possible catalysts.
- [x] Expose unavailable evidence and allow no clear catalyst found.

Acceptance: factual assertions are traceable and analyst example narratives are never treated as independently verified truth.

## 8. Analyst workspace and learning workflow

- [x] Show calculations, policy version, evidence, owner, deadline, and status.
- [x] Add concept explanations, open questions, and possible-catalyst exploration.
- [x] Review analyst-supplied reasoning for evidence gaps and alternative explanations.
- [x] Require analyst-authored update and supporting sources for completion.
- [x] Preserve notes, approval boundaries, completion actor/time, and audit history.

Acceptance: analysts author causal reasoning and conclusions; the agent requests revisions without replacing their update.

## 9. Daily briefings

- [x] Reuse evidence collection for material developments and upcoming catalysts.
- [x] Configure briefing time and materiality criteria.
- [x] Capture team-specific briefing links; suppress empty briefings and duplicate delivery.

Acceptance: briefings reflect team context and sources, and run without an analyst prompt.

## 10. Replay and feedback

- [x] Replay THC with company commentary and peer coverage.
- [x] Replay DRAM with underlying-company and sector coverage.
- [x] Use synthetic or redistributable fixtures in git; keep private examples local.
- [x] Verify calculations, provenance, missing evidence, duplicates, retries, and permissions.
- [ ] Evaluate evidence explanation, hypotheses, thesis reasoning, preparation time, and unsupported claims.
- [ ] Capture Rikhil and Max's feedback, then Fund feedback, as follow-up work.

Acceptance: both cases can run end to end without real notifications, and evaluation records correctness and learning outcomes.

## Subsequent workflows

- [ ] Earnings: approved checklists, confirmed/estimated dates, preserved expectations, sourced results, chart refresh, and analyst reflection.
- [ ] Historicals: review Historicals Solver, agree a contract, require analyst mappings, propose sourced values, and preserve formulas through audited approval.
- [ ] Cross-team sharing: explicit approval, permission-aware retrieval, and human routing for unanswered questions.
- [ ] Semester continuity: preserve sources, mappings, and unresolved questions.
