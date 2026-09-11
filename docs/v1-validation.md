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

## Deployment checks now recorded

- Azure active web revision `agenthelper--recov2`, `Healthy`, running the final pinned digest.
- Finite scheduled worker execution: `agenthelper-worker-rx4kqhj` succeeded and terminated in 23 seconds.
- Deployed health endpoint returns `HTTP 200` and remains independent of PostgreSQL.
- Persistence verified after both revision replacement and scale-to-zero; table counts unchanged.
- Scale to zero and wake verified: cold request `200` in 36.8 s, warm request in 0.05 s.
- Entra callback URI registered and accepted; the authorize redirect carries the new origin and the branded sign-in page renders with no redirect-URI mismatch.
- First real-user sign-in succeeded against the deployment, and that user was granted administrator through `scripts/bootstrap.ts`, recording an `admin.bootstrap` audit event. Exactly one non-fixture user exists; the seeded `dev:` fixtures remain rejected in deployment.

## Deployment checks still to record

- Deployed browser replays.
- Second developer sign-in: deliberately deferred by the user.

These are implementation checks, not evidence of real market-data accuracy or analyst learning outcomes. Licensed actual SPX coverage, model selection, real email, operating-default approval, retention policy, and Fund rollout remain future work.

## Azure status at 2026-09-10 16:35 UTC

Neon Free and the External ID tenant/application/user flow are configured. Azure reports the Consumption environment as `Succeeded`, but the web app and scheduled worker remain `InProgress`; the `main` deployment is still `Running`. Public DNS returns NXDOMAIN for the assigned application hostname, and no ready web revision exists yet. An attempt to apply the final image returned `ContainerAppOperationInProgress` (operation `04a4c38e-32e2-4232-8a73-929b55cfa5c7`). No paid add-ons or ingestion resources were created.

The private final image is `ghcr.io/r1khil/agenthelper@sha256:26e8831b4a85cee6c361a79b6090104c07533f54ed0d2c67a1e900af29d33d40`. It is pinned in the private deployment configuration, ready to apply after the initial operation completes. The initial deployment uses the earlier validated image; apply the final digest before declaring acceptance.

Next: inspect `az deployment group show -g agenthelper-dev -n main`, apply `npm run deploy` after the active operation finishes, run the worker/replay, verify Entra sign-in and the intended administrator, then check persistence across a revision replacement and scale-to-zero. Do not describe the application as live until its health and authentication checks pass. GitHub branch publication and hosted CI are awaiting explicit user approval after automatic approval review rejected the initial push.

## Diagnostic follow-up, 2026-09-11

The Azure deployment has now reached `Failed`; it is no longer running. Both web and worker revision provisioning expired. An earlier managed-environment operation failed while initializing ManagedCluster components, although a subsequent write reports success. See [Azure diagnosis](azure-diagnosis.md) for the observed timeline, uncertainty, and recovery sequence. No Azure resources were changed during diagnosis. PR #4 has merged the pilot into main and its GitHub validation workflow passed, superseding the earlier publication/CI blocker above.

## Azure status at 2026-09-11 04:30 UTC

The deployment is recovered. A controlled public-image test showed that the original managed environment `agenthelper-dev-env` could not provision any revision and publishes no wildcard DNS, while an identical image served `HTTP 200` in a new environment. The failure domain is that environment, not the application, its image, or GHCR. See [Azure diagnosis](azure-diagnosis.md) for the full evidence.

The application now runs as `agenthelper` with worker `agenthelper-worker` in the replacement Consumption environment `agenthelper-recovery-env`, on the final pinned digest `ghcr.io/r1khil/agenthelper@sha256:26e8831b4a85cee6c361a79b6090104c07533f54ed0d2c67a1e900af29d33d40`. Origin: `https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io`. Azure pulled the private image successfully, which positively confirms the GHCR path.

The new callback URI was added to the Entra registration and the original was preserved. Both temporary diagnostic probes were removed. The original failed resources were kept deliberately, so the evidence survives if the broken environment is raised with Azure support; they hold no data and run no replicas. No paid add-ons or ingestion resources were created.

Sign-in and administrator bootstrap are now verified against the deployment. The sign-in method is email one-time passcode; the user flow has no password or Microsoft-account provider configured.
