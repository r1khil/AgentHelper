# v1 validation record

Implementation branch: `codex/v1-pilot`. Worktree: `../agenthelper-v1`.

## Completed checks

- 22 deterministic tests: inclusive positive/negative four-point boundary, below threshold, missing/invalid/misaligned SPX and closes, corporate-action ambiguity, fixture holidays, early closes, DST deadlines, and structured fixture feedback.
- 15 PostgreSQL integration tests: concurrent replay, event/outbox uniqueness, cross-team access and source isolation, quality failures, completion/source requirements, expired leases, stale worker tokens, reminder cancellation, bounded retries, thesis approval, single-use invitations, briefing suppression and weekend lookback, and untrusted source instruction resistance.
- TypeScript, Next production build, worker bundle, and production dependency audit passed. Production audit reported zero vulnerabilities. The development toolchain still reports moderate transitive advisories under Drizzle Kit; no forced major upgrade was applied.
- Linux/amd64 production container built and private GHCR visibility verified. The production worker connected to Neon successfully.
- Reviewed migration applied to Neon. Synthetic THC and DRAM replays persisted investigations, evidence and captured deliveries in Neon.
- Local browser: overview rendering, THC reasoning submission, structured fixture feedback, supporting-source selection, and completion. Browser-authored acceptance text is explicitly labeled test material, not an investment conclusion.

- Production health and login returned HTTP 200 with PostgreSQL deliberately unreachable at 0.25 vCPU / 512 MiB. Observed container memory was approximately 92 MiB. The test container was removed.

## Deployment checks still to record

- Successful Azure active web revision and finite scheduled worker execution.
- Entra callback and first real-user sign-in; bootstrap only the verified authenticated user.
- Deployed browser replays, persistence after revision replacement and scale-to-zero, and health endpoint independence from PostgreSQL.
- Second developer sign-in: deliberately deferred by the user.

These are implementation checks, not evidence of real market-data accuracy or analyst learning outcomes. Licensed actual SPX coverage, model selection, real email, operating-default approval, retention policy, and Fund rollout remain future work.

## Azure status at 2026-09-10 16:35 UTC

Neon Free and the External ID tenant/application/user flow are configured. Azure reports the Consumption environment as `Succeeded`, but the web app and scheduled worker remain `InProgress`; the `main` deployment is still `Running`. Public DNS returns NXDOMAIN for the assigned application hostname, and no ready web revision exists yet. An attempt to apply the final image returned `ContainerAppOperationInProgress` (operation `04a4c38e-32e2-4232-8a73-929b55cfa5c7`). No paid add-ons or ingestion resources were created.

The private final image is `ghcr.io/r1khil/agenthelper@sha256:26e8831b4a85cee6c361a79b6090104c07533f54ed0d2c67a1e900af29d33d40`. It is pinned in the private deployment configuration, ready to apply after the initial operation completes. The initial deployment uses the earlier validated image; apply the final digest before declaring acceptance.

Next: inspect `az deployment group show -g agenthelper-dev -n main`, apply `npm run deploy` after the active operation finishes, run the worker/replay, verify Entra sign-in and the intended administrator, then check persistence across a revision replacement and scale-to-zero. Do not describe the application as live until its health and authentication checks pass. GitHub branch publication and hosted CI are awaiting explicit user approval after automatic approval review rejected the initial push.
