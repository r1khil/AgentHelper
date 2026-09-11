# Azure deployment diagnosis

Diagnosed 2026-09-11 approximately 03:47 UTC and recovered the same day, based on main `3643736`. The Recovery section records the outcome; the sections before it are the original diagnosis, kept as written.

## Finding

The deployment failed during Azure Container Apps provisioning, before a usable web revision was created. The original hypothesis was an incompletely initialized managed environment. A controlled public-image test later confirmed the failure domain is that environment, and the application now runs in a replacement environment. Azure's customer-visible errors still do not establish the exact internal cause. See Recovery below.

## Evidence and timeline

All times below are UTC on 2026-09-10, from Azure deployment operations and the resource-group activity log.

| Time              | Event                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15:54:24          | An earlier environment template failed preflight because the literal app-log destination `none` was invalid. Current templates omit the destination, so this earlier error does not explain the subsequent accepted deployment. |
| 15:55:52          | Managed environment creation began.                                                                                                                                                                                             |
| 16:17:04          | Environment creation failed with `ManagedEnvironmentProvisioningError`: `Error when initializing components on ManagedCluster`.                                                                                                 |
| 16:17:26–16:17:42 | A subsequent environment write reported success in approximately 16 seconds. This does not independently demonstrate healthy underlying components.                                                                             |
| 16:17:42          | Web app and scheduled worker provisioning began.                                                                                                                                                                                |
| 16:34:36          | Applying the final image was rejected with `ContainerAppOperationInProgress`.                                                                                                                                                   |
| 16:37:46–16:37:47 | Both worker and web app failed with `ContainerAppOperationError`: `Failed to provision revision ... Operation expired.` Main deployment then failed.                                                                            |

Current read-only checks:

- Environment `agenthelper-dev-env` reports `Succeeded` in East US, Consumption profile.
- Web app `agenthelper-dev` reports `Failed`; latest revision and latest ready revision names are empty. Its separate `runningStatus: Running` field is not evidence that a container is serving traffic.
- Web revision listing returns `InternalServerError`; correlation ID `f3712d13-9b3d-4bbe-9b2f-38e1768fedb7`.
- Worker execution listing also returns `InternalServerError`; correlation ID `1aad15ad-8a3e-43a7-a6a5-bedff31871b2`.
- Web and environment system-log reads returned only the events-collector connection message, with no useful startup/image-pull failure evidence.
- Environment quota results showed unused dedicated-profile core limits; they did not establish available Consumption capacity.
- The configured image remains the initial digest `sha256:c036f835f8c2835cecb86acd3f978d9395e6425326d67f6bc8259364545a2216`. The final digest documented in v1-validation has not been applied.
- Subscription remains `Enabled`, with `PayAsYouGo_2014-09-01` quota ID and spending limit `Off`. No billing-disabled error appeared in the failed operations.

## Recovery sequence

1. Preserve this evidence and the existing environment while isolating its health. A minimal public-image test in the same environment would distinguish a shared environment problem from application/private-registry setup, although it would create a billable resource.
2. If the public-image test also fails, investigate managed-environment health with Azure support, or provision a fresh Consumption environment and validate it before deploying the application. Keep the old environment until replacement succeeds; account for the changed application origin and Entra redirect URI.
3. If the test succeeds, validate GHCR credentials and image access from Azure, then apply the final pinned application image and inspect revision startup events.
4. Verify web health, finite worker execution, Entra sign-in, and persistence across revision replacement and scale-to-zero before calling the deployment accepted.

No Azure resources, credentials, billing settings, or application configuration were changed during this diagnosis. No redeployment was attempted. Exact root-cause confirmation requires a discriminating deployment test or Azure backend diagnostics; the present evidence is insufficient to justify a speculative application-code fix.

## Reproduce read-only checks

```sh
az deployment group show -g agenthelper-dev -n main --query '{state:properties.provisioningState,error:properties.error}'
az deployment operation group list -g agenthelper-dev -n main --query '[].{resource:properties.targetResource.resourceName,state:properties.provisioningState,status:properties.statusMessage}'
az containerapp env show -g agenthelper-dev -n agenthelper-dev-env --query '{state:properties.provisioningState,error:properties.deploymentErrors}'
az containerapp revision list -g agenthelper-dev -n agenthelper-dev
az containerapp job execution list -g agenthelper-dev -n agenthelper-dev-worker
```

Account credit details were checked separately in the signed-in Azure portal and are intentionally omitted from this shared project document.

## Recovery, 2026-09-11

The recovery goal authorized remediation. The preceding no-change statement describes the initial diagnosis only.

### Discriminating test

A minimal known-good public image (`mcr.microsoft.com/k8se/quickstart:latest`, 0.25 vCPU / 0.5 GiB, zero to one replicas) was deployed into each environment.

| Test                                             | Original `agenthelper-dev-env`                                                        | Replacement `agenthelper-recovery-env`          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Public-image container app                       | `agenthelper-recovery-probe`: stuck at `InProgress`; no revision ever created           | `recovery-probe-new`: ready revision in about 40 seconds |
| `latestRevisionName` / `latestReadyRevisionName` | Both empty                                                                              | `recovery-probe-new--rrfuuta`                    |
| `az containerapp revision list`                  | `InternalServerError`, correlation ID `2ec11db0-a830-4d28-9def-6ec6d607de67`            | Returned normally, `Healthy`                     |
| HTTP response                                     | No response; hostname does not resolve                                                  | `HTTP 200`                                       |
| Wildcard DNS for the environment domain          | `*.salmonplant-0424ae34.eastus.azurecontainerapps.io` returns `NXDOMAIN` from `8.8.8.8` | `*.redtree-e725cc47.eastus.azurecontainerapps.io` resolves to `172.212.32.111`, matching the environment static IP |

### Conclusion

The failure domain is the original managed environment, not the application, its image, or the registry. Three independent observations support this:

1. A known-good public image fails in the original environment exactly as the application did, producing no revision at all. This excludes application code, container startup, and GHCR authentication as the blocking cause.
2. The original environment publishes no wildcard DNS zone, although the environment reports `Succeeded` and holds a static IP. Its ingress components were therefore never brought up.
3. Revision and job-execution control-plane calls return `InternalServerError` only for the original environment.

This is consistent with the original `ManagedEnvironmentProvisioningError: Error when initializing components on ManagedCluster`. The later 16-second `Succeeded` environment write updated the ARM record without repairing the underlying components, which is why `provisioningState` alone was misleading throughout. The exact Azure-internal cause remains outside customer-visible diagnostics; the evidence establishes the failure domain, not Microsoft's internal fault.

The private GHCR path is now positively confirmed rather than merely unfalsified: the final pinned private digest was pulled successfully by Azure in the replacement environment using the configured credential.

### Changes applied

- Provisioned one replacement Consumption environment, `agenthelper-recovery-env`, in East US, and validated it with the public image before deploying anything.
- Deployed the application as `agenthelper` and the scheduled worker as `agenthelper-worker` into the replacement environment, using the final pinned digest `sha256:26e8831b4a85cee6c361a79b6090104c07533f54ed0d2c67a1e900af29d33d40`. New origin: `https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io`.
- New workload names were used rather than reusing `agenthelper-dev`, because a container app cannot move between managed environments and the original names are still held by the failed resources. This kept the recovery non-destructive.
- Added the new callback URI to the Entra registration `AgentHelper Development Web` (object `d424d268-0526-4bc1-8b79-58842a33131a`). The original callback URI was preserved, not replaced.
- Separated environment provisioning (`infra/environment.bicep`) from workload deployment (`infra/main.bicep`, which now references an existing environment). Added optional `AZURE_APP_NAME`, `AZURE_ENVIRONMENT_NAME`, and `AZURE_LOCATION` configuration and a deployment preflight requiring `Succeeded`. That preflight is necessary but not sufficient, as this incident showed; a serving public-image probe remains the real health gate.
- Removed both temporary probes after they produced their results.

### Verification of the recovered deployment

| Check                            | Result                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| Web revision                     | `agenthelper--recov2` active, `Healthy`, running the final pinned digest                            |
| Health endpoint                  | `GET /api/health` returns `HTTP 200` and `{"status":"ok","service":"agenthelper"}`                  |
| Worker execution                 | `agenthelper-worker-rx4kqhj` started 04:14:39Z, `Succeeded` 04:15:02Z; ran and terminated in 23 seconds |
| Revision replacement              | Forced a new revision; health stayed `200` and all table counts were unchanged                      |
| Scale to zero and wake            | Reached `ScaledToZero`; a cold request returned `200` in 36.8 s, the next in 0.05 s, replicas back to 1 |
| Persistence                      | Counts identical before and after both revision replacement and scale-to-zero, including 2 investigations and 6 evidence facts |
| Entra authorize redirect         | `/auth/login` returns `307` to the tenant authorize endpoint with the new `redirect_uri`; the branded sign-in page renders with no `AADSTS50011` mismatch |

### Remaining limitations

- Interactive Entra sign-in is verified. The first real user signed in through the `agenthelper_developers` user flow, which uses email one-time passcode as its only identity provider, and was then granted administrator through `scripts/bootstrap.ts`. The directory also holds an older federated Microsoft-account entry that this user flow cannot authenticate; it is unused and was left in place.
- Deployed browser replays are still unverified.
- The original failed resources (`agenthelper-dev-env`, `agenthelper-dev`, `agenthelper-dev-worker`) were deliberately kept. Recovery is proven, so they may now be deleted, but they were preserved so the evidence survives in case the broken environment is raised with Azure support. They hold no data, run no replicas, and a Consumption environment has no idle charge.
- The 15 PostgreSQL integration tests remain skipped; no disposable test database is configured in this worktree, and they were not run against Neon.
- The exact Azure-internal reason the original environment's components failed to initialize is not established and is not customer-visible.

### Reproduce the discriminating test

```sh
dig +short '*.salmonplant-0424ae34.eastus.azurecontainerapps.io' @8.8.8.8
dig +short '*.redtree-e725cc47.eastus.azurecontainerapps.io' @8.8.8.8
az containerapp show -g agenthelper-dev -n agenthelper --query '{state:properties.provisioningState,ready:properties.latestReadyRevisionName,image:properties.template.containers[0].image}'
az containerapp revision list -g agenthelper-dev -n agenthelper -o table
az containerapp job execution list -g agenthelper-dev -n agenthelper-worker -o table
curl -s https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io/api/health
```
