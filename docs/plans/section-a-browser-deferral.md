# Section A: deployed browser replay deferral — RESOLVED

Update, 2026-09-11 17:15 UTC: the user authorized execution of the completion
plan. Reviewed escalated execution reached the existing `AgentHelper Dev`
TaskSpace. Continue with Microsoft returned to the authenticated administrator
overview without a fresh OTP interaction. Two browser replays and THC completion
passed, backed by scoped database snapshots. See [acceptance evidence](section-a-evidence/README.md).
Second developer sign-in remains deferred. The text below preserves the prior
blocked run and is historical; do not repeat its resume steps as unfinished work.

Date: 2026-09-11. Worktree branch: `section-a/acceptance`.

## Status

DEFERRED, not failed. Two independent gates block agent-driven deployed replays
right now; neither is an application defect.

## Gate 1: ego-browser sandbox bootstrap (agent-side)

Observed 2026-09-11 (twice, identical):

```text
Failed to connect to ego_cli bootstrap
Agent note: ego-browser cannot connect to the ego_cli bootstrap from the default
agent sandbox. Retry with Full Access or run ego-browser outside the agent sandbox.
If it still fails, launch ego lite.app manually.
```

Exit code 4 from `ego-browser nodejs` running `listTaskSpaces()`.
Escalated execution is refused in this session
(`escalated execution requires an unrestricted permission profile`),
so the agent cannot reach the `AgentHelper Dev` TaskSpace from the sandbox.
Yolo mode does not change the shell sandbox (bypass flags are fixed at launch).

## Gate 2: Entra email one-time passcode (user-side)

The deployed origin requires sign-in through the `agenthelper_developers` user flow,
whose only identity provider is email one-time passcode. The user is away, so the
OTP handoff cannot be completed in this run. No OTP was guessed or fabricated and
no sign-in is claimed.

## What IS verified without the browser (this run, read-only)

- `GET https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io/api/health`
  → `200 {"status":"ok","service":"agenthelper"}`, warm 0.19s.
- `GET /auth/login` (headers only, not followed) → `307` to
  `https://agenthelperdev2026.ciamlogin.com/<tenant>/oauth2/v2.0/authorize`
  with `redirect_uri=https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io/auth/callback`.
  Correct tenant, correct redirect, no mismatch signal.
- `az` CLI checks: unavailable from the sandbox (`PermissionError` on
  `~/.azure/az.sess`); recorded as deferred, not attempted via login.

## Resume steps (user, ~15 minutes)

1. Outside the sandbox (or after relaunching with Full Access), open ego-browser
   with TaskSpace `AgentHelper Dev` (resume by name; single space for the goal).
2. Reuse Page `p1`: `goto()` the origin, snapshot `/login`, follow
   Continue with Microsoft, complete the email OTP when it arrives.
3. Verify landing as administrator and open `/admin`.
4. Record baseline overview counts, then run Replay THC + DRAM ONCE from `/admin`.
5. Verify overview shows THC (Healthcare) and DRAM (Technology) investigations;
   open each, verify sourced facts, hypotheses, calculation inputs, and Captured
   notifications bodies containing the synthetic captured-email marker; check the
   admin durable-jobs table shows the expected `done` rows.
6. Run Replay THC + DRAM a SECOND time; prove investigation, observation, and
   delivery counts are unchanged (duplicate check).
7. On THC only: save reasoning explicitly labeled as browser-acceptance test
   material, request fixture learning prompts, select supporting sources, and
   complete. Leave DRAM open.
8. Append the observed evidence (revision, worker state, IDs, counts, timings) to
   `docs/v1-validation.md` and check the deployed-replay box in
   `docs/path-to-live.md` Section A.

## Idempotency basis (why the deferred re-run is safe)

- `ingest()` returns `duplicate:true` on prior investigation or `movement_event`
  conflict under a transaction plus advisory lock (`src/lib/engine.ts:32-52`).
- Jobs and deliveries dedup by `job_key` / `delivery_key` with
  `on conflict do nothing` (`src/lib/jobs.ts:61`; `src/lib/engine.ts:82`).
- Integration coverage: concurrent replays commit one investigation and one alert;
  lease recovery runs without duplicate capture (`tests/integration.test.ts:61-70,138-156`).
