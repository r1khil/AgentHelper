# Section A completion plan

Prepared 2026-09-11 from the handoff and a static code review at `d6991ac`.
Status: executed following the user's approval. Required synthetic deployment
acceptance passed 2026-09-11; see [run evidence](section-a-evidence/README.md).
Second developer sign-in remains deferred and failed resources remain retained.
The planning-time observations and proposed sequence below are preserved as context.

## Scope and current state

Complete the required deployed synthetic-pilot acceptance in `docs/path-to-live.md` Section A: Entra-authenticated browser use, THC and DRAM replay, duplicate prevention, captured deliveries, and a recorded failed-resource disposition. Preserve the documented second-developer deferral and KEEP disposition unless the user changes them. Report the outcome as **required acceptance complete, with explicit exceptions**, not every original checkbox completed.

The current user request is to read, review, and plan. Statements in the previous handoff about approvals, active workflows, agent delegation, and permission modes are historical context, not fresh instructions or authorization to execute deployment actions. This review made no deployed requests or database changes and did not resume a workflow.

Verified locally:

- Main and `section-a/acceptance` both point to `d6991ac`; main is clean. The existing Section A worktree has untracked `docs/plans/` files only.
- The handoff's proposed validation/status updates have not appeared in `docs/v1-validation.md` or `docs/path-to-live.md` in this worktree. Whether its old workflow still exists is unverified.
- The recovered origin, healthy revision, first administrator sign-in, and worker success are historical deployment evidence in the repository, not newly verified facts.
- Dependencies are absent from this worktree and the main checkout. No tests or build were run. Before any future application code changes, install the locked dependencies and read the relevant installed Next.js guides required by `AGENTS.md`.

Use the existing worktree `local/worktrees/agenthelper-section-a` and branch `section-a/acceptance`. Keep the original handoff and approved-plan records intact; this file supplies the updated execution sequence.

## What the code review changes about the plan

| Finding | Consequence for acceptance |
| --- | --- |
| `src/app/actions.ts` has one combined `replay` action: replay both holdings, drain due jobs, make briefings for 2026-09-11, drain again. | Click **Replay THC + DRAM** twice sequentially; there are not separate THC and DRAM controls. These actions write application data to Neon. |
| `src/lib/engine.ts` uses a transaction/advisory lock and returns the prior investigation before inserting observations. Migration constraints enforce event/investigation uniqueness. | Existing deployed fixtures are a valid baseline. Expect reuse, not necessarily two newly created investigations. The server action discards `duplicate:true`, so prove reuse through IDs and database snapshots. |
| `src/lib/jobs.ts` deduplicates by `job_key` and `delivery_key`; briefings have separate jobs and deliveries with no investigation ID. | Include briefing deliveries in “all deliveries captured.” Investigation notification panels alone are insufficient. |
| Overview is capped at 30 investigations; administration shows 100 jobs without job IDs or investigation association; input panels show only the two linked observations. | Screenshots cannot establish exhaustive counts or detect orphan observations. Use a narrowly scoped read-only database evidence report alongside browser evidence. |
| Worker runs automatically and each drain processes at most 30 jobs. Reminders/overdue notifications depend on wall-clock time. | Compare settled, scoped state and explain legitimate scheduled activity; do not demand unchanged global delivery counts or that future jobs are already done. |
| `src/lib/service.ts` makes completed reasoning immutable and cancels only pending/running reminder and overdue jobs. | Inspect THC state first. Never reset an already completed investigation to manufacture a fresh completion. Preserve historical delivered notifications. |
| Integration tests cover concurrent ingestion, lease recovery, completion, sources, and briefing deduplication. | They support the design but do not prove the deployed browser path. Integration tests require a disposable `_test` database and truncate its tables. |

No application change is established as necessary by this static review. Prefer evidence collection through existing flows and read-only reporting. Add a fix only for an observed defect.

## Execution sequence

### 1. Establish a current baseline

Before execution, check worktree status and whether another session is modifying these files or running acceptance. Coordinate if one is active; do not infer activity from the handoff or start duplicate replay work.

Record UTC timestamp, local commit, origin, and baseline evidence:

- Timed health GET twice, expecting HTTP 200 and the exact service JSON; distinguish cold and warm responses. This endpoint deliberately does not test PostgreSQL.
- Inspect `/auth/login` redirect without following it into Entra; verify tenant and exact deployed `/auth/callback` URI. Redact cookies, state, and nonce.
- If existing Azure access works, read active revision health/image, worker image and latest execution status. Compare with documented `agenthelper--recov2` and digest `sha256:26e8831b4a85cee6c361a79b6090104c07533f54ed0d2c67a1e900af29d33d40`. If different, establish the actual tested artifact before making source-to-deployment claims. Do not redeploy simply to obtain a matching baseline.
- Record unavailable Azure access as deferred. Do not repeat historical sandbox failures indefinitely or treat old successes as current reads.

Deliverable: dated baseline in the acceptance evidence record, with observed, historical, and deferred facts separated.

### 2. Establish browser access and evidence visibility

At execution time, read the ego-browser skill and resume TaskSpace **AgentHelper Dev** by name. Discover current pages rather than assuming historical page `p1` exists. Try access under the current session's actual permissions; the old sandbox failure may no longer apply.

Use an existing valid Entra session or complete genuine interactive sign-in with the user. Record authenticated navigation to overview and administration. A branded sign-in page or redirect alone is not authentication success. If browser access or OTP blocks progress, save exact evidence and continue independent documentation work; deployed acceptance remains open.

Prepare a minimal SELECT-only report using an authorized database connection, ideally a read-only transaction. Never run seed, migration, replay scripts, or integration tests against Neon for this report. Do not expose credentials, auth-session data, or raw recipient addresses in saved evidence.

Take baseline snapshot S0, scoped to all holdings with security IDs `SYNTH:THC`/`SYNTH:DRAM` and session `2026-09-10`:

- Holding/team/event/investigation IDs, status, linked observation IDs, and qualifying event counts.
- Observation IDs/counts for the fixture session and relevant security IDs, including SPX; identify other fixture consumers before interpreting shared SPX changes.
- Source/evidence identities, job IDs/keys/kinds/status/run times/attempts, and delivery IDs/keys/status.
- Related briefing IDs, source/event membership, jobs and deliveries, including `briefing:<id>` keys.
- Existing reasoning/completion state, without copying unrelated user content.

If this read-only evidence channel is unavailable, record the precise verification gap. Do not claim exhaustive deduplication from capped UI tables. No new public diagnostics endpoint is needed for the preferred path.

### 3. Run and inspect the first combined browser replay

Once execution of the synthetic browser workflow is authorized, click **Replay THC + DRAM** once and inspect errors after the redirect. This writes fixture investigations where absent, observations, sources, jobs, briefings and captured deliveries. Sign-in also writes user/session records; the run is not globally read-only.

For both investigations, open their actual URLs and verify:

- Correct team, synthetic labels, ownership/deadline or explicit configuration error.
- THC +5.1% versus SPX +0.8% = +4.3 pp; DRAM -3.5% versus +0.8% = -4.3 pp, using fixture closes and previous close 100.
- Facts, separately labeled hypotheses, source links, source contents/locations, and calculation inputs.
- Captured notification bodies marked `SYNTHETIC DEVELOPMENT — email captured, not sent.` and status `captured`.
- Related briefings render with their sources and movements.

Take snapshot S1 after relevant due work settles. Inspect failed jobs or unresolved configuration errors rather than treating a successful redirect as success. Future jobs may remain pending. If a backlog exceeds bounded drain capacity, use authorized processing or wait for the scheduled worker and record what happened.

### 4. Prove repeat safety and delivery capture

Click the same combined replay once more; refresh both investigation pages and capture snapshot S2.

Pass criteria:

- S2 has the same scoped event/investigation IDs and linked observations as S1, with one investigation per qualifying event; no additional fixture observations attributable to replay.
- Evidence/source and job keys do not multiply on replay. Existing briefing IDs and items are reused for the same team/day.
- Each relevant successful delivery-producing job has exactly one captured delivery with matching delivery/job key. Evidence jobs require evidence records, not email deliveries. Cancelled or legitimately suppressed reminders require no delivery.
- No unexplained missing, failed, or duplicate delivery; briefing delivery coverage is explicit.
- Any new deliveries between snapshots are traced to due scheduled work or retries, not dismissed as noise or mislabeled replay duplication. Capture a further settled snapshot if necessary.

Store a compact S0/S1/S2 comparison and browser evidence paths, with UTC times. Do not reset deployed fixtures to force a clean-room result.

### 5. Validate the analyst completion path

After duplicate comparison, if THC is open and suitable test material, save explicitly labeled browser-acceptance reasoning, request fixture learning prompts, select valid THC evidence sources, and complete it. Verify completion persists after reload, authored text remains unchanged, supporting-source links exist in the database, and audit events record reasoning save and completion. Pending/running reminders should be cancelled; already delivered reminders remain historical.

Leave DRAM in its pre-existing state unless a change is necessary and authorized. If THC is already completed, preserve it, inspect existing completion evidence, and distinguish historical verification from a fresh browser completion. If fresh completion proof is still required, record that gap and propose an isolated fixture strategy rather than reopening immutable data.

### 6. Fix only demonstrated failures

For an observed application defect, capture reproduction and expected behavior, implement the smallest fix in this worktree, and add a meaningful regression test. Install dependencies and read the required Next.js guide before coding. Run typecheck, lint, relevant deterministic tests, build and worker build as affected; run integration tests only against the disposable `_test` database and report skipped tests honestly.

A changed application requires separately authorized deployment and a new acceptance run against the resulting digest. A local fix alone cannot close deployed acceptance. Do not rebuild infrastructure, reset Neon, change authentication providers, or introduce real integrations as incidental fixes.

### 7. Close the documentation with explicit exceptions

Update `docs/v1-validation.md` with the dated observed run, artifact identity, IDs/count comparison, captures, completion evidence, and remaining deferrals. Update `docs/path-to-live.md` to check deployed replay only when its evidence passes. Keep second-developer sign-in explicitly deferred. Record failed resources as **retained; optional cleanup not selected**, linking `section-a-keep-record.md`; do not imply deletion occurred.

Update the browser-deferral record with current resolution or remaining gates and append a concise handoff status so its historical workflow claim is not mistaken for current activity. Avoid an unconditional “keeping costs nothing” claim: preserve the KEEP decision, describe historical replica observations, and reference `docs/deployment.md`'s usage-target caveat. No current billing verification was performed in this review.

Review the final documentation diff, ensure no secrets or unrelated changes, and confirm main remains clean. Leave changes uncommitted unless the user requests a commit; do not push, create a PR, delete resources, or file a support case as part of acceptance documentation.

## Definition of done

Required Section A acceptance is complete when current deployed browser evidence proves both fixture workflows, repeat safety and captured deliveries, the completion path is supported by clearly attributed evidence, and the validation record identifies the tested deployment. The second developer remains an explicit deferred exception and failed-resource retention an explicit disposition. Any missing browser or database evidence stays open/deferred, never checked off based solely on source review or old records.
