# Section A deployment-acceptance plan (approved)

Approved plan for closing out Section A of `docs/path-to-live.md` (synthetic pilot, on Azure).
Worktree branch: `section-a/acceptance`. This file lives in the worktree at
`docs/plans/section-a-deployment-acceptance.md` (writable location; `.agents/` is read-only in the sandbox).

## Goal

Close out deployment acceptance of the synthetic pilot on Azure: prove the recovered deployment
(app `agenthelper` + worker `agenthelper-worker` in environment `agenthelper-recovery-env`,
origin `https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io`) serves the app,
authenticates via Entra, runs deployed browser replays (THC and DRAM end to end) with no duplicate
investigations and all deliveries captured, and document the kept failed resources — without
changing Azure resources, Neon data, or credentials beyond read-only checks and user-driven browser sign-in.

## Success Criteria

1. `GET /api/health` on the deployed origin returns HTTP 200 (timed; cold vs warm noted).
2. `/auth/login` redirects to the Entra External ID authorize endpoint with the correct
   `redirect_uri` for the deployed origin; branded sign-in page renders with no `AADSTS50011` mismatch.
3. Deployed browser replays of THC and DRAM complete end to end in a browser against the deployed
   origin, signed in via Entra; re-run returns existing investigations (no duplicates); all deliveries captured.
4. Read-only `az` checks confirm: web revision active/Healthy on final pinned digest
   `sha256:26e8831b4a85cee6c361a79b6090104c07533f54ed0d2c67a1e900af29d33d40`,
   finite worker execution succeeded, persistence unchanged.
5. Failed resources (`agenthelper-dev-env`, `agenthelper-dev`, `agenthelper-dev-worker`) documented
   with evidence-bundle references; kept, not deleted.
6. Entra OTP/2FA: if interactive sign-in is blocked while the user is away, recorded as DEFERRED
   with evidence — never a stop-the-line blocker for the other units.
7. No writes to Neon outside user-driven browser actions; no replay clicks outside the approved
   replay units; no use of `.env.azure` credentials by workers; no Azure mutations.

## Context And Current Facts

- Recovery is proven (see `docs/azure-diagnosis.md`, `docs/v1-validation.md` as of main `d6991ac`):
  active web revision `agenthelper--recov2` Healthy on final pinned digest; finite worker execution
  `agenthelper-worker-rx4kqhj` succeeded in 23 s; health independent of PostgreSQL; persistence
  verified across revision replacement and scale-to-zero (cold 36.8 s, warm 0.05 s).
- First real-user sign-in succeeded via the `agenthelper_developers` user flow (email one-time
  passcode is the only identity provider; no password or Microsoft-account provider); that user was
  granted administrator via `scripts/bootstrap.ts` (`admin.bootstrap` audit event). Exactly one
  non-fixture user exists; `dev:` fixtures remain rejected in deployment.
- Failure domain of the original deployment is the managed environment `agenthelper-dev-env`
  (no wildcard DNS, `InternalServerError` on revision/job control-plane calls, public-image probe
  never created a revision there; identical probe Healthy in `agenthelper-recovery-env`).
- Open Section A items (`docs/path-to-live.md`): deployed browser replays (THC + DRAM), second
  developer sign-in (deliberately deferred by the user), optional cleanup of kept failed resources.
- Credentials/deployment reference: `docs/deployment.md`. Identity: Entra External ID tenant
  `agenthelperdev2026.onmicrosoft.com`, app registration `AgentHelper Development Web`.
  Both old and new callback URIs are registered; the old one was preserved.

## Constraints And Non-goals

- Build in the NEW worktree/branch only; never the main checkout.
- Read-only pre-flight: no replay clicks, no scripts that write to Neon, no `.env.azure` use,
  no `az` commands that mutate anything. `curl -I`/redirect check on `/auth/login` must NOT follow
  into Entra.
- If `az login` is not already active, record az checks as deferred and continue — do not attempt login.
- Failed Azure resources: KEEP for now (evidence for a potential Azure support case); document only.
- Entra OTP/2FA: if blocked, record as deferred with evidence and keep working other units; user is away.
- Out of scope: real market-data provider, real model/email providers, Fund rollout, operating-default
  approval, retention policy (Sections B–E); second developer sign-in (user-deferred); any Azure cleanup
  deletes; docs-only commit happens later with explicit user approval.

## Key Decisions

1. **ego-browser TaskSpace**: name is exactly `AgentHelper Dev`; resume by name. All deployed
   browser replay units attach to this TaskSpace.
2. **Failed Azure resources**: KEEP for now. Document properly with evidence-bundle references
   (unit 7a). No deletes, no support-case filing without user approval.
3. **Entra OTP / 2FA**: if blocked, DO NOT stop. Record as deferred with evidence and keep working
   the other units. The user is away; interactive OTP may be unavailable.
4. **Worktree**: all Section A work happens in a NEW git worktree on a new branch
   (`section-a/acceptance`, numeric suffix if the name exists), NOT the main checkout.
   Requested location was a sibling `../agenthelper-section-a[-N]`; if the sandbox forbids sibling
   paths, fall back to `local/worktrees/agenthelper-section-a[-N]` inside the checkout and record
   the deviation in the setup report.
5. **Plan file**: this approved plan is saved as markdown at
   `docs/plans/section-a-deployment-acceptance.md` INSIDE the new worktree (NOT `.agents/`,
   which is read-only in the sandbox), creating directories as needed.
6. **Docs-only commit later**: results are committed as a docs-only change only after explicit user
   approval; workers do not push.

## Recommended Approach

1. Setup worker: create worktree + branch, save this plan file, run read-only pre-flight
   (health curl with timing, login redirect check without following into Entra, read-only `az`
   show/list if login already active), and return baseline JSON-ish text for the next workers.
2. Fan out replay/verification units against the TaskSpace `AgentHelper Dev`, each unit recording
   its own evidence (HTTP status, timings, revision names, table counts, screenshots/log excerpts).
3. Any unit blocked on interactive OTP marks itself DEFERRED with evidence (what was attempted,
   what redirect/page was observed, what remains) and yields; other units proceed.
4. Unit 7a writes the keep-and-document record for the failed resources with evidence-bundle refs.
5. A final collation step merges unit evidence into `docs/v1-validation.md` "Deployment checks"
   updates — as a docs-only commit only after user approval.

## Work Plan

- **Unit 1 — Read-only pre-flight baseline.** From the new worktree: timed `GET /api/health`;
  `curl -I` / redirect check on `/auth/login` (do not follow into Entra); read-only
  `az containerapp show`, revision list, job execution list for app `agenthelper` in group
  `agenthelper-dev` IF `az` login already active, else deferred. Return baseline for later units.
- **Unit 2 — Deployed browser replay: THC.** In TaskSpace `AgentHelper Dev`, signed in via Entra:
  run the THC replay end to end in a browser against the deployed origin; confirm completion and
  capture evidence. If OTP blocks sign-in: DEFERRED with evidence, continue other units.
- **Unit 3 — Deployed browser replay: DRAM.** Same as unit 2 for the DRAM replay.
- **Unit 4 — Duplicate / idempotency check.** Re-run THC and DRAM replays; confirm existing
  investigations are returned and no duplicates are created (read-only count comparison evidence).
- **Unit 5 — Delivery capture check.** Confirm all deliveries from the deployed replays are captured
  (read-only evidence: counts/ids before vs after; no direct Neon writes by workers).
- **Unit 6 — Auth/session status.** Record `/auth/login` redirect target, branded sign-in render,
  first-user/admin state; note second developer sign-in as user-deferred; if OTP interaction is
  blocked while the user is away, record DEFERRED with evidence, not failure.
- **Unit 7 — Failed-resource disposition, fixed to 7a: keep + document.** (7a) Keep
  `agenthelper-dev-env`, `agenthelper-dev`, `agenthelper-dev-worker`; write the documentation record
  with evidence-bundle references (diagnosis doc, correlation IDs `f3712d13-…`, `1aad15ad-…`,
  `2ec11db0-…`, NXDOMAIN vs resolving wildcard DNS, `ManagedEnvironmentProvisioningError` timeline).
  No delete option is in scope for this plan.

## Validation Plan

- Health: `curl -sS -o /dev/null -w '%{http_code} %{time_total}s' https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io/api/health`
  plus a body fetch expecting `{"status":"ok","service":"agenthelper"}`; note cold vs warm timing.
- Login: `curl -sSI https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io/auth/login`
  (headers only, no `-L`); confirm 307/redirect to the tenant authorize endpoint carrying the new
  origin as `redirect_uri`; confirm no `AADSTS50011` on the rendered branded page (browser unit).
- Azure (read-only, only if login active):
  `az containerapp show -g agenthelper-dev -n agenthelper`,
  `az containerapp revision list -g agenthelper-dev -n agenthelper`,
  `az containerapp job execution list -g agenthelper-dev -n agenthelper-worker`.
- Replays: browser evidence per unit (steps, completion state, investigation ids, delivery counts,
  duplicate-check counts); every claim cites observed output.
- Docs: plan file present in worktree; final docs-only commit gated on user approval.

## Risks/Rollback

- Scale-to-zero cold start (~37 s): pre-flight timing may look slow on first hit; take a second
  warm reading before concluding anything.
- Interactive OTP unavailable (user away): expected risk; mitigated by defer-not-stop policy.
- `az` login inactive: expected in sandbox; mitigated by deferred-with-evidence policy.
- Rollback: this plan makes no mutations (no Azure writes, no Neon writes, no credential use), so
  there is nothing to roll back. If the worktree must be discarded:
  `git worktree remove --force <worktree-path>` and `git branch -D <branch>` from the main checkout.

## Open Questions (resolved)

- ego-browser TaskSpace name: resolved → exactly `AgentHelper Dev`, resume by name.
- Failed-resource cleanup: resolved → KEEP for now, document with evidence-bundle refs (unit 7a).
- Entra OTP/2FA if blocked: resolved → DEFERRED with evidence, keep working other units; user is away.
- Branch/PR flow: resolved → new worktree branch (`section-a/acceptance`); no PR until user approves.
- Plan-file location: resolved → `docs/plans/section-a-deployment-acceptance.md` in the new worktree.
- Final commit: resolved → docs-only commit later, only with explicit user approval.
