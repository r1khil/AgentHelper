# Section A: failed-resource disposition — KEEP (documented)

Date: 2026-09-11. Worktree branch: `section-a/acceptance`. Decision by user: keep for now, document properly.

## Decision

KEEP the original failed Azure resources. No deletes, no support-case filing in this run.

- `agenthelper-dev-env` (managed environment, East US, Consumption)
- `agenthelper-dev` (web container app — failed, no ready revision)
- `agenthelper-dev-worker` (scheduled worker — failed)

## Rationale

- Recovery is proven in the replacement environment `agenthelper-recovery-env`
  (`agenthelper` + `agenthelper-worker`), so the failed resources are not on any
  serving path. They hold no data and run no replicas.
- Retention preserves the evidence exhibit. No current billing verification was
  performed; $0 is a usage target, not a spending cap. See `docs/deployment.md`
  for shared-consumption and usage caveats. Replica/data statements above are
  historical diagnosis observations, not new resource inventory checks.
- The exact Azure-internal cause was never established from customer-visible
  diagnostics; the kept resources plus the evidence bundle below are what a
  support case would reference.

## Evidence bundle (all already recorded, no new Azure reads needed)

Source: `docs/azure-diagnosis.md` (Recovery, 2026-09-11) and `docs/v1-validation.md`.

- `ManagedEnvironmentProvisioningError: Error when initializing components on ManagedCluster`
  at 2026-09-10 16:17:04 UTC, followed by a 16-second `Succeeded` environment write that
  updated the ARM record without repairing components.
- `ContainerAppOperationError: Failed to provision revision ... Operation expired` for both
  worker and web at 16:37:46–16:37:47 UTC; main deployment then failed.
- `az containerapp revision list` on `agenthelper-dev`: `InternalServerError`,
  correlation ID `f3712d13-9b3d-4bbe-9b2f-38e1768fedb7`.
- `az containerapp job execution list` on `agenthelper-dev-worker`: `InternalServerError`,
  correlation ID `1aad15ad-8a3e-43a7-a6a5-bedff31871b2`.
- Discriminating public-image probe `agenthelper-recovery-probe` in the original environment:
  stuck at `InProgress`, no revision ever created; revision list `InternalServerError`,
  correlation ID `2ec11db0-a830-4d28-9def-6ec6d607de67`.
- Wildcard DNS: `*.salmonplant-0424ae34.eastus.azurecontainerapps.io` returns `NXDOMAIN`
  from `8.8.8.8` (original env); `*.redtree-e725cc47.eastus.azurecontainerapps.io` resolves
  to `172.212.32.111` (recovery env, matches its static IP).
- Identical public image in `agenthelper-recovery-env` (`recovery-probe-new`): ready revision
  in ~40s, `Healthy`, HTTP 200. Failure domain is the original environment, not the app,
  image, or GHCR. Both temporary probes were removed after producing results.

## What deletion would require (not done)

1. Export the evidence above plus current `az deployment group show` /
   `az deployment operation group list` output for group `agenthelper-dev`, deployment `main`.
2. Explicit user approval (deletion is irreversible and destroys the support exhibit).
3. Delete ONLY the three failed names; never the recovery environment, Neon data,
   identity tenant/registration, or unrelated subscription resources.

## Support-case pointers (not filed)

If raised with Azure support, attach this file plus `docs/azure-diagnosis.md`
(sections Evidence and timeline, Discriminating test, Conclusion) and the three
correlation IDs above. Account/credit details stay out of shared docs by design.
