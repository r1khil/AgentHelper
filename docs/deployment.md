# Development setup and Azure deployment

This pilot uses invented market/evidence fixtures and captures outgoing messages in PostgreSQL. It makes no live market-data, email, or AI calls. Do not import real holdings or licensed documents into this environment.

## Local setup

Use Node 24 and Docker with Compose:

```sh
npm ci
cp .env.example .env
docker compose up -d
```

Set `DATABASE_URL` in `.env` to match Compose. Next reads `.env`; CLI scripts require environment variables explicitly:

```sh
node --env-file=.env --import tsx scripts/migrate.ts
node --env-file=.env --import tsx scripts/seed.ts
node --env-file=.env --import tsx scripts/replay.ts
npm run dev
```

Open http://localhost:3000. Local synthetic identities are selectable only in development mode. Production and Container Apps reject that mode. Replays are repeatable and return the existing investigation rather than creating duplicates.

The CLI worker and scheduled container ingest the bounded fixture session after its configured close, then run the same PostgreSQL lease/attempt processor. Repeated schedules do not create new observations for an existing event. No daily live feed is connected:

```sh
node --env-file=.env --import tsx scripts/worker.ts
```

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run build:worker
npm audit --omit=dev
```

Integration tests require a disposable PostgreSQL database whose name ends in `_test`. They truncate its application tables. Set `TEST_DATABASE_URL` before `npm run test:integration`; without it, integration cases are skipped. CI provisions a dedicated test database and runs all checks.

## Development infrastructure

- Azure resource group `agenthelper-dev`, East US: Consumption environment, web app, and finite scheduled worker. Web: 0.25 vCPU / 0.5 GiB, zero to one replicas. Worker: same size, 60-second execution timeout, no platform retry, hourly 12–22 UTC weekdays.
- Separate `agenthelper-identity-dev` resource group: Entra External ID tenant `agenthelperdev2026.onmicrosoft.com`, email one-time-passcode flow `agenthelper_developers` associated with the Web app registration.
- Neon Free project `agenthelper-dev`: PostgreSQL 17, AWS US East 1, scale-to-zero. Its default branch is named `production` but contains only this development database.
- Private image `ghcr.io/r1khil/agenthelper:v1-dev`. CI image publication is manual; the GitHub workflow uses the repository owner's GHCR namespace. Keep package visibility private and grant the deployer pull access.
- Container Apps logging destination is null. No Log Analytics workspace, Azure registry, Key Vault, storage account, paid model, or email provider is provisioned.

## Credentials and deployment

Create an ignored `.env.azure` (mode 0600), containing `DATABASE_URL`, `AUTH_SECRET` (at least 32 random bytes), `ENTRA_TENANT_ID`, `ENTRA_SUBDOMAIN`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `AZURE_SUBSCRIPTION_ID`, `GHCR_USER`, `GHCR_TOKEN`, and `CONTAINER_IMAGE`. Never commit credentials or paste them in issues. Native Container Apps secrets hold deployed values.

The application registration is a confidential Web client using authorization code + PKCE. Configure the exact HTTPS `/auth/callback` URI returned for the app hostname. Associate it with the External ID user flow. Implicit grants and public-client flows are unnecessary. Rotate the client secret before its 180-day expiry; update both web and worker configuration when secrets change.

```sh
az login
npm run deploy -- --what-if
```

Review the resource changes and shared subscription usage before applying. The deployment script temporarily writes a private parameter file and deletes it on exit. Migrations are additive standard PostgreSQL migrations; review generated SQL before applying it to Neon. Seed is idempotent and only adds labeled fixtures.

```sh
node --env-file=.env.azure --import tsx scripts/migrate.ts
node --env-file=.env.azure --import tsx scripts/seed.ts
docker build --platform linux/amd64 -t ghcr.io/r1khil/agenthelper:v1-dev .
# Authenticate Docker using a private credential via --password-stdin.
docker push ghcr.io/r1khil/agenthelper:v1-dev
npm run deploy
```

Prefer immutable image digests for subsequent releases. Updating a mutable tag alone may not create a new revision. Deploy the new digest through `CONTAINER_IMAGE`, then verify the active revision. The GitHub checks never automatically deploy Azure resources.

## First user and invitations

A new Entra-authenticated identity receives no team membership. After the intended administrator signs in, list real authenticated users and grant that exact user ID administration:

```sh
node --env-file=.env.azure --import tsx scripts/bootstrap.ts users
node --env-file=.env.azure --import tsx scripts/bootstrap.ts admin USER_UUID
```

Bootstrap is an operator-only database command and records an audit event. It refuses synthetic users. Create a seven-day, single-use invitation through Administration, then share the code privately. The user signs in and accepts it on Join. The application captures notifications and does not send invitations. The second developer's invitation and sign-in verification are deferred at the user's request.

## Usage target and shutdown

$0 is a usage target, not an Azure spending cap. The approved plan cites monthly grants of 180,000 vCPU-seconds, 360,000 GiB-seconds and two million Container Apps requests per subscription, plus Neon Free 100 CU-hours / 0.5 GB per project and External ID 50,000 MAU. Verify current provider terms and shared consumption before continued use. Other workloads in the subscription consume the same grants. CPU/memory grants at this size correspond to roughly 200 active replica-hours before job usage; two users alone do not guarantee that limit.

There is no paid log ingestion. Scheduled jobs can wake Neon even when the web is at zero. Stop development scheduling when idle for extended periods. Health checks return static JSON without a database connection; do not add an external uptime monitor that keeps waking the app. Cap retries and keep fixtures bounded. Monitor Neon storage/compute and Azure Cost Management; budgets are notifications rather than hard limits.

Suspend web traffic and scheduled work (state remains in Neon):

```sh
az containerapp revision list -g agenthelper-dev -n agenthelper-dev --query '[?properties.active].name' -o tsv
az containerapp revision deactivate -g agenthelper-dev -n agenthelper-dev --revision REVISION_NAME
az containerapp job stop -g agenthelper-dev -n agenthelper-dev-worker
az containerapp job delete -g agenthelper-dev -n agenthelper-dev-worker --yes
```

Redeploy Bicep to restore the scheduled job; reactivate the intended revision to resume the web. For complete Azure compute teardown:

```sh
az group delete --name agenthelper-dev --yes --no-wait
```

This deletes only this development compute group. Neon data and the separate identity tenant remain. Export needed synthetic results before deleting the Neon project. Delete the application credential/registration and External ID tenant separately only when the pilot is retired. Do not delete unrelated subscription resources.
