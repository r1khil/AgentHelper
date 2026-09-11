# Handoff: Section A deployment-acceptance build

## Latest status — 2026-09-11 17:15 UTC

The user subsequently authorized execution of `section-a-completion-plan.md`.
Required deployed synthetic acceptance has passed: two authenticated browser
replays preserved all scoped IDs/counts; eight deliveries were captured; THC
completion persisted with two sources and fixture feedback; DRAM remains open.
See [evidence](section-a-evidence/README.md), `../v1-validation.md`, and
`../path-to-live.md`. The old browser/Azure access restrictions were resolved
through reviewed escalated execution. Second developer sign-in remains deferred;
failed resources remain retained. No code change, deployment, commit or push.

No old workflow was launched or cancelled. Muse/Claude processes are present,
but this run did not establish the old workflow's status. The pending-work and
workflow claims below describe the earlier handoff, not current acceptance work.

---

Date: 2026-09-11. Author: Muse Code session (bronze-astraea).
Reader: the next agent continuing this work. Start here, then read the three
sibling files in this directory.

## Objective

Close Section A of `docs/path-to-live.md` (synthetic pilot, on Azure):
prove THC and DRAM run end to end in a browser against the deployed origin,
signed in via Entra, with no duplicate investigations on re-run and all
deliveries captured. Second developer sign-in stays deferred. Failed Azure
resources stay kept and documented.

## User decisions (binding, already approved)

1. ego-browser TaskSpace name is exactly `AgentHelper Dev` — resume by name.
2. Failed Azure resources (`agenthelper-dev-env`, `agenthelper-dev`,
   `agenthelper-dev-worker`): KEEP for now, document properly. No deletes, no
   support case without explicit approval.
3. Entra OTP / 2FA: if blocked, record as DEFERRED with evidence and keep
   working everything else. Never guess or fabricate an OTP, never claim a
   sign-in that was not observed.
4. All Section A work happens in the NEW worktree/branch below, never the main
   checkout. Main checkout must stay clean.
5. No commits, pushes, PRs, or Azure/Neon writes without the user's explicit
   ask. Yolo mode is on: do not request command permissions.
6. `.agents/` is read-only in the sandbox — all plan/record files live in
   `docs/plans/` inside the worktree, not `.agents/plans/`.

## Where everything lives

- Main checkout: `/Users/rikhilsharma/Desktop/agenthelper` (branch `main`,
  currently clean, at `d6991ac`).
- Section A worktree: `/Users/rikhilsharma/Desktop/agenthelper/local/worktrees/agenthelper-section-a`
  (branch `section-a/acceptance`, from main `d6991ac`).
  Note: sibling path `../agenthelper-section-a` was requested but the sandbox
  forbids sibling paths, so the worktree falls back inside the checkout at
  `local/worktrees/agenthelper-section-a`. This deviation is recorded in the plan.
- Files in `<worktree>/docs/plans/` (all currently UNTRACKED, uncommitted):
  - `section-a-deployment-acceptance.md` — the approved plan (canonical).
  - `section-a-keep-record.md` — keep decision + evidence bundle for failed resources.
  - `section-a-browser-deferral.md` — OTP/sandbox deferral + resume steps + idempotency basis.
  - `section-a-handoff.md` — this file.

## What was done (with evidence)

1. **Planning (plan skill).** Researched the repo: `docs/path-to-live.md` §A,
   `docs/v1-validation.md`, `docs/azure-diagnosis.md`, `docs/deployment.md`,
   `docs/decisions.md`, plus `src/lib/engine.ts` (replay/idempotency),
   `src/lib/jobs.ts` (delivery dedup), `src/app/actions.ts` (`replay` op),
   `src/app/admin/page.tsx`, `src/app/page.tsx`,
   `src/app/investigations/[id]/page.tsx`, `src/app/login/page.tsx`,
   `tests/integration.test.ts`. Delivered the canonical plan inline (no file —
   `.agents/` was not writable) and the user approved with the decisions above.
2. **Workflow launched** for the build (still partially running — see below).
   Setup unit created the worktree + branch and saved the approved plan file.
3. **Read-only pre-flight (observed, green).**
   - `GET https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io/api/health`
     → `200 {"status":"ok","service":"agenthelper"}`. Cold 25.79s on first probe,
     warm 0.19s on the second — consistent with documented scale-to-zero behavior.
   - `GET /auth/login` (headers only, never followed into Entra) → `307` to
     `https://agenthelperdev2026.ciamlogin.com/<tenant>/oauth2/v2.0/authorize`
     with `redirect_uri=https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io/auth/callback`.
     Correct tenant, correct redirect, no mismatch signal.
   - `az` CLI: unavailable from the sandbox (`PermissionError` on
     `~/.azure/az.sess`). Recorded as deferred; do not attempt `az login`.
4. **Browser probe (observed, blocked).** `ego-browser nodejs` running
   `listTaskSpaces()` fails identically every time from the sandbox:
   `Failed to connect to ego_cli bootstrap` (exit 4) with the note to retry
   with Full Access or run outside the sandbox. Escalated execution is refused
   (`requires an unrestricted permission profile`). No TaskSpace was reached, so
   no browser state was changed. The deployed THC/DRAM replays, duplicate
   re-run check, delivery capture check, and one THC completion are therefore
   DEFERRED behind two gates: sandbox bootstrap (agent-side) and Entra email
   OTP (user-side; user was away). Details + resume steps: sibling
   `section-a-browser-deferral.md`.
5. **Keep record written** (sibling `section-a-keep-record.md`): rationale (no
   serving path, no data/replicas, no idle Consumption charge, preserves the
   support exhibit), full evidence bundle with correlation IDs
   (`f3712d13-…`, `1aad15ad-…`, `2ec11db0-…`), NXDOMAIN vs resolving DNS, and the
   discriminating-probe conclusion. No Azure writes made.

## What is still pending

1. **Workflow units.** A background workflow is still alive: setup unit
   `result_ready`, browser unit `running`, docs + synthesis units not started.
   Do NOT launch a second workflow while it is live and do NOT cancel it. When
   it finishes, its docs unit will append a dated Section A run entry to
   `<worktree>/docs/v1-validation.md` and a note under Section A in
   `<worktree>/docs/path-to-live.md` (boxes stay unchecked — nothing observed
   green gets checked). If the workflow is gone when you start, do those two
   doc edits yourself instead of relaunching it.
2. **OTP-gated browser replays.** Need the user (or a Full Access session):
   open ego-browser TaskSpace `AgentHelper Dev` outside the sandbox, complete
   the email OTP, run Replay THC + DRAM twice from `/admin`, verify captured
   deliveries + jobs, complete THC once with explicitly test-labeled text.
   Exact steps: sibling `section-a-browser-deferral.md`, section Resume steps.
3. **Docs-only commit.** After validation docs are updated AND the user
   explicitly approves, commit the worktree's docs changes on
   `section-a/acceptance`. Never push without being asked.

## Key facts (do not re-derive)

- Origin: `https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io`
  (app `agenthelper` + worker `agenthelper-worker` in env
  `agenthelper-recovery-env`). Pinned digest
  `sha256:26e8831b4a85cee6c361a79b6090104c07533f54ed0d2c67a1e900af29d33d40`;
  active revision `agenthelper--recov2` Healthy (per docs; re-verify read-only
  when `az` is available).
- Sign-in: Entra External ID, `agenthelper_developers` flow, email OTP ONLY.
  Exactly one non-fixture admin user exists; `dev:` fixtures are rejected in
  deployment.
- Synthetic pilot only: invented fixtures, captured email, fixture feedback. No
  live providers, no real holdings, no paid add-ons, no external uptime monitor.
- Re-run safety: `ingest()` returns `duplicate:true` on prior investigation or
  `movement_event` conflict under advisory lock; jobs/deliveries dedup by
  `job_key`/`delivery_key` (`src/lib/engine.ts`, `src/lib/jobs.ts`).

## Suggested first commands for the next agent

```sh
# State checks (read-only, main checkout)
git worktree list
git status --short --branch
git -C local/worktrees/agenthelper-section-a status --short --branch
ls local/worktrees/agenthelper-section-a/docs/plans/

# Deployed origin (read-only, never follow /auth/login into Entra)
curl -sS -o /dev/null -w 'health:%{http_code} time:%{time_total}s\n' --max-time 60 \
  https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io/api/health
curl -sSI --max-time 30 \
  https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io/auth/login | head -n 12
```
