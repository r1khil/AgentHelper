# AgentHelper stack and hosting research

Researched September 10, 2026. Recommendation for discussion, not an approved change to the Fund decision log. No resources have been provisioned. No university sign-in arrangement or preferred cloud provider has been established. The comparison uses normal ongoing pricing; limited-duration benefits are discussed separately below.

**Recommend Azure for the pilot and launch: Next.js and TypeScript, PostgreSQL Flexible Server, Container Apps, Entra External ID, Blob Storage, and durable queued jobs. Budget $45–70/month including transactional email, before AI and licensed data.** Google Cloud is a strong alternative at $85–110/month with a dedicated database. The AWS container architecture modeled here is $95–130/month.

Pilot and launch both have approximately 20–25 users total. No launch workload increase has been established, so both stages use the same baseline capacity.

These are workload-based estimates, not quotes or measured application performance. The baseline assumes tolerance for database downtime during maintenance or failure; this availability requirement is not yet approved. Automatic database failover costs more independently of user count.

## Recommended application stack

| Layer | Recommendation | Reason for AgentHelper |
| --- | --- | --- |
| Web and API | Next.js App Router, React, TypeScript; supported Node.js LTS | Matches the approved direction and keeps the evidence workspace and service code in one project. |
| Deployment | Docker, Next.js standalone output | The same application can move among the three clouds. Use managed ingress, runtime secrets, and stateless instances. |
| UI | Tailwind CSS with accessible components | Suitable for evidence tables, source panels, notes, and status workflows. Keep the first UI small. |
| Database | Managed PostgreSQL; Drizzle ORM and reviewed SQL migrations | Transactions, constraints, source relationships, audit records, and the notification outbox fit a relational database. |
| Identity | Microsoft Entra External ID, external tenant | Managed login without a university tenant dependency. Store invitations, memberships, and Fund roles in PostgreSQL. |
| Authorization | Service-layer checks plus PostgreSQL row-level security where appropriate | Verify team access on every read, write, and source download. A valid identity is insufficient without an accepted membership. |
| Source files | Private Azure Blob Storage | Store permitted documents separately from relational metadata; issue short-lived download URLs after authorization. |
| Jobs | Azure Queue Storage + Container Apps event jobs and scheduled jobs | Closing observations, evidence collection, reminders, and briefings need durable execution outside page requests. |
| Email | Resend Pro, initially budgeted at $20/month | A portable transactional API and predictable allowance; use factual links and retain delivery state. Azure Communication Services is a cheaper native alternative. |
| AI integration | Server-side provider adapter, schema-validated outputs, retained source references and usage | Select a model after THC/DRAM evaluations. The movement threshold and permissions remain deterministic application code. |
| Operations | GitHub Actions, infrastructure as code, Key Vault, Azure Monitor | Repeatable deployments, versioned migrations, runtime identity, and visible job/delivery failures. |
| Validation | Unit tests for movement semantics; database integration tests for isolation/outbox; browser tests for analyst completion | These directly address the approved acceptance criteria. |

Next.js supports Node/Docker hosting, but multi-instance caching requires care. Keep private team pages dynamic and avoid caching tenant-sensitive responses across users. Drizzle supports generated SQL migrations that can be reviewed before application. Sources: [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Drizzle migrations](https://orm.drizzle.team/docs/migrations).

Entra External ID's core offering includes 50,000 monthly active users. This estimate assumes ordinary email-based login with no paid premium features or SMS. Account creation must not automatically grant Fund access: bind the verified identity to an explicit invitation and membership. [Entra pricing](https://azure.microsoft.com/en-us/pricing/details/microsoft-entra-external-id/)

Use one codebase with separate web and worker entry points. Commit an investigation and its outbox record in one database transaction. A scheduled dispatcher publishes pending work; workers record checkpoints, use unique event keys, retry with backoff, and expose exhausted attempts. Re-check completion before sending reminders. Queue infrastructure does not make external email delivery exactly once. Azure jobs support scheduled and event-driven execution; Google's queue also explicitly permits occasional duplicate execution. [Azure jobs](https://learn.microsoft.com/en-us/azure/container-apps/jobs), [Cloud Tasks limitations](https://docs.cloud.google.com/tasks/docs/common-pitfalls)

The first release does not justify operating Kubernetes, Redis, a separate vector database, or a second backend language. PostgreSQL search and source metadata are sufficient starting points; evaluate embeddings only when retrieval quality demonstrates a need.

## Equivalent service choices

| Capability | Google Cloud | Azure — recommended | AWS |
| --- | --- | --- | --- |
| Web | Cloud Run | Container Apps Consumption | ECS Fargate behind an ALB |
| PostgreSQL | Cloud SQL Enterprise | PostgreSQL Flexible Server | RDS PostgreSQL |
| Login | Identity Platform | Entra External ID | Cognito Essentials |
| Evidence files | Cloud Storage | Blob Storage | S3 |
| Durable work | Cloud Tasks + private Cloud Run worker | Queue Storage + Container Apps Jobs | SQS + Fargate worker tasks |
| Scheduling | Cloud Scheduler | Scheduled Container Apps Jobs | EventBridge Scheduler |
| Secrets/logs | Secret Manager / Cloud Logging | Key Vault / Azure Monitor | Secrets Manager / CloudWatch |

AWS App Runner stopped accepting new customers on April 30, 2026. AWS recommends ECS Express Mode, which provisions underlying Fargate, load-balancer, and networking resources without an additional Express Mode fee. Estimate the actual task sizes and minimum replicas explicitly; do not assume its defaults match this model. [App Runner notice](https://aws.amazon.com/apprunner/), [ECS Express Mode](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html)

## Workload assumptions

All figures are USD, pay-as-you-go, using 730 hours/month: GCP Iowa `us-central1`, Azure East US, AWS Northern Virginia `us-east-1`. Recurring compute/auth free allowances are included where applicable; introductory credits, reservations, taxes, paid support, and student grants are excluded. Free allowances are shared at the provider's billing-account/subscription scope and are assumed available to this project.

| Input | Pilot and launch baseline |
| --- | --- |
| Active users | **20–25 total at both stages — user confirmed** |
| Holdings monitored | 30, provisional assumption; actual portfolio count not supplied |
| Application HTTP requests/month | 50,000, provisional |
| Aggregate web + worker billed time, at 1 vCPU / 2 GiB | 50,000 seconds, provisional |
| Web/worker split for modeling | 20,000 / 30,000 seconds |
| Provisioned PostgreSQL disk | 32 GiB |
| Evidence object storage | 10 GB |
| Internet delivery | 10 GB/month |
| Logs ingested | Up to 1 GB/month |
| Transactional email | 1,000/month, provisional |
| Database availability | One primary, backups, no automatic standby |
| Environments | One paid environment; local development |

Billed time includes waiting for research/model APIs, startup, and retries; it is not just CPU utilization. User count is confirmed; activity volumes are provisional inputs. Hold capacity and activity constant between pilot and launch until observed usage or an explicit requirement justifies a change. Public ingress uses the provider hostname in the base model. A separate permanent staging stack and GCP production custom-domain front end are additional.

## Monthly and annual projections

Includes cloud infrastructure plus the same $20/month Resend plan on all three providers. AI, licensed market data, and research subscriptions are excluded. The paid email plan is a discretionary assumption, not a requirement imposed by 20–25 users.

| Provider | Modeled monthly point, either stage | Pilot/month | Launch/month, same workload | Annual range |
| --- | ---: | ---: | ---: | ---: |
| Google Cloud | $85.55 | $85–110 | $85–110 | $1,020–1,320 |
| Azure | $51.09 | $45–70 | $45–70 | $540–840 |
| AWS | $103.43 | $95–130 | $95–130 | $1,140–1,560 |

Annual figures assume twelve months at the stated usage. Planning ranges are judgmental allowances, not statistical confidence intervals. Launch itself does not cause a cost increase. More investigations, longer AI calls, accumulated documents, or higher availability requirements could increase spending with the same users; those changes have not been assumed here.

| Monthly component, both stages | GCP | Azure | AWS |
| --- | ---: | ---: | ---: |
| PostgreSQL, provisioned disk, modeled backups | $55.55 | $16.09 | $27.04 |
| Web and worker compute | $0 | $0 | $18.43 |
| ALB | Included ingress | Included ingress | $17.01 |
| Explicit public IPv4 addresses | Included in allowance where applicable | Included in allowance where applicable | $10.95 |
| Supporting-services allowance | $10 | $15 | $10 |
| Resend Pro | $20 | $20 | $20 |

Supporting-services allowances cover object storage and operations, queues/scheduling, secrets, image registry/builds, logs, DNS, modest egress, and small backup overages. They are not separately quoted SKU totals. Azure's pilot allowance includes room for a basic container registry. GitHub Actions usage depends on repository visibility and the owners' plan. Storage lifecycle and log retention must be configured to stay within these assumptions.

## Pricing calculations and limits

**Google Cloud:** request-billed Cloud Run is $0.000024/vCPU-second, $0.0000025/GiB-second, and $0.40/million requests, after the monthly allowances of 180,000 vCPU-seconds, 360,000 GiB-seconds, and two million requests. Both web and HTTP workers use this billing mode in the model, minimum instances zero. At 50,000 vCPU-seconds and 100,000 GiB-seconds, baseline compute fits these allowances at both stages. Keep task stages within HTTP task timeouts; use jobs for longer runs and reprice their distinct billing mode. [Cloud Run pricing](https://cloud.google.com/run/pricing), [Cloud Tasks execution limits](https://docs.cloud.google.com/tasks/docs/dual-overview)

Cloud SQL uses a dedicated 1-vCPU/3.75-GiB Enterprise instance for both pilot and launch. At $.0413/vCPU-hour, $.007/GiB-hour, $.17/GiB-month SSD, and $.08/GiB-month used backup storage, pilot database cost is `730 × (.0413 + 3.75 × .007) + 32 × .17 + 10 × .08 = $55.55`. The cheaper shared-core `db-g1-small` is $25.55/month compute, but shared-core instances are excluded from the Cloud SQL SLA; it is a possible disposable-demo saving. [Cloud SQL pricing](https://cloud.google.com/sql/pricing)

**Azure:** Container Apps active compute is $.000024/vCPU-second and $.000003/GiB-second; the free quantities match those above. Baseline compute fits these allowances at both stages. Use Consumption replicas with minimum zero, including finite-duration workers. [Container Apps pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/)

PostgreSQL B1ms is $12.41/month with 1 vCore and 2 GiB RAM and is retained for both stages; upgrade only if measured workload requires it. Add provisioned storage at $.115/GiB-month. Backup storage up to the provisioned disk quantity is included. Thus pilot database cost is `$12.41 + 32 × $.115 = $16.09`. These are burstable machines, not performance equivalents to GCP's dedicated cores. Benchmark connection counts and CPU credits before broad rollout. [Azure PostgreSQL pricing](https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/)

**AWS:** RDS `db.t4g.small` costs $.032/hour and is retained for both stages. GP3 disk is $.115/GB-month. Baseline backup usage is assumed within the included allowance. These burstable instances can incur CPU-credit charges above baseline. Rates verified in the [official US East RDS price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-east-1/index.json); see also [RDS billing details](https://aws.amazon.com/rds/postgresql/pricing/).

Fargate Linux/x86 rates are $.000011244/vCPU-second and $.000001235/GB-second. Keep one web task running: .5 vCPU/1 GiB for both stages; workers run for the seconds in the assumptions table. An ALB costs $.0225/hour plus $.008/LCU-hour, modeled at average .1 LCUs. Three public IPv4 addresses cost `3 × 730 × $.005 = $10.95`: two ALB addresses and one web task. Short-lived worker address usage sits in the allowance. [Fargate pricing](https://aws.amazon.com/fargate/pricing/), [ALB pricing](https://aws.amazon.com/elasticloadbalancing/pricing/), [VPC pricing](https://aws.amazon.com/vpc/pricing/)

The AWS baseline uses public-subnet application tasks with security groups allowing inbound only from the ALB, private RDS, and no NAT gateway. Private application subnets with internet API access would add NAT or an alternative egress design; one AWS NAT gateway alone adds about $32.85/month before its address and traffic charges. Azure should use a Consumption workload profile in a VNet with private database connectivity and platform egress; dedicated profiles, environment private endpoints, fixed egress, and extra gateways change the bill. GCP should use a supported Cloud SQL connector/private networking design and avoid an always-on serverless connector if direct VPC egress suffices. [Azure networking](https://learn.microsoft.com/en-us/azure/container-apps/networking)

AWS can be cheaper with Lambda-based web hosting or a small self-managed VM. That changes Next.js deployment integration or operational responsibility. The comparison estimates a portable managed-container design; it does not claim ECS is AWS's lowest possible bill.

## Costs that change the decision

- **Automatic failover:** Azure Burstable cannot enable database HA. Move to General Purpose and price a standby. A 2-vCore/8-GiB D2ds v5 primary is $129.94/month; two compute instances are about $259.88 before disk and the rest of the app. This removes much of Azure's pilot-price advantage. GCP likewise doubles the modeled dedicated database CPU/RAM rates for HA. Backups support recovery but do not provide automatic failover. [Azure HA support](https://learn.microsoft.com/en-us/azure/postgresql/high-availability/how-to-configure-high-availability)
- **Custom domain on GCP:** default `run.app` is included. Direct domain mapping is still Preview; use a supported production front end when adding a custom domain and obtain its separate estimate. [Cloud Run domain options](https://docs.cloud.google.com/run/docs/mapping-custom-domains)
- **Email:** Resend Pro is $20/month for 50,000 emails. Its free tier has monthly and daily caps, so verify actual sending volume and peak-day alerts before choosing it. Azure native email is $.00025/message plus $.00012/MB; 1,000 small messages would cost well under $1, reducing the Azure pilot estimate by roughly $20 if selected. Deliverability setup and retry semantics still need validation. [Resend](https://resend.com/pricing), [Azure email pricing](https://learn.microsoft.com/en-us/azure/communication-services/concepts/email-pricing)
- **AI and research:** no model/provider has been approved or benchmarked. Track input/output tokens, retrieval calls, OCR, retries, and investigations per month. Set a separate initial $50/month AI spending target as a budget assumption, not a vendor quote. External model API charges are additional regardless of the hosting cloud. The same applies if using Bedrock or Vertex AI instead.
- **Market data:** actual SPX coverage, storage rights, institutional usage, and research redistribution remain quote/access dependent. A personal subscription or a connector available in an analyst's chat is not evidence that the deployed app has API rights. Obtain written coverage and licensing confirmation before enabling automated collection.
- **Availability and latency:** scale-to-zero may delay the first request. An always-warm instance, a second environment, heavy document processing, or verbose logs can materially exceed the pilot estimate. Provider budget alerts notify; they do not inherently cap spend. Enforce worker concurrency, retry limits, and per-provider AI quotas separately.

## Azure credits and future account migration

Azure's eligible new-user offer provides $200 for the first 30 days after signup. This is separate from the limited quantities of free services available for 12 months. Unused promotional dollars do not extend beyond their expiration date. Verify eligibility and remaining allowances in the intended deployment subscription before budgeting against them. [Azure free-account terms](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/avoid-charges-free-account)

For an eligible subscription, the PostgreSQL B1ms free-service allowance can cover 750 compute hours, 32 GB of storage, and 32 GB of backup storage per month during the benefit period. If all modeled database usage qualifies, the Azure baseline drops by about $16.09/month, from $51.09 to $35.00 including the paid email assumption. This is a conditional saving, not the ongoing price; verify the applicable meters and expiration in the portal. [Create eligible free services](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/create-free-services)

Changing billing ownership and moving an application into another subscription are different operations. Supported billing transfers depend on the source and destination agreement; Azure documents restrictions for Free Trial products. Do not assume transferring an existing subscription will make a collaborator's sign-up credit available to it. [Azure transfer rules](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/subscription-transfer)

If a collaborator qualifies for the offer, a practical option is to deploy into that collaborator's credit-backed subscription and migrate data and domain configuration as needed. Keep Docker images, infrastructure definitions, database migrations, and backup/restore procedures portable. A cross-tenant move also requires reviewing identity and access configuration. Prefer choosing the deployment account when the application is ready, since the 30-day credit clock starts at signup. Account-specific billing records and unrelated resource inventories are outside this research document.

## Next implementation step

Create a focused application-foundation issue and implement a local Next.js/TypeScript/PostgreSQL scaffold with synthetic teams and holdings. Add an Entra login proof of concept, explicit invitation checks, team isolation tests, a queued no-send investigation, and reviewed database migrations. Keep a small provider interface around queue, storage, email, and identity integration.

Then prepare Azure infrastructure as code for one East US environment: Container Apps web/jobs, PostgreSQL B1ms with 32 GiB disk and backups, private database networking, Blob/Queue Storage, identity, registry, logs, and secrets. Verify the deployment plan's real SKUs, restore a test backup, and replay synthetic THC/DRAM fixtures before live ingestion or notifications. Start with a $75 infrastructure-plus-email monthly budget alert; maintain the AI allowance separately.

The cost model is reproducible with `python3 docs/hosting-cost-model.py`. Specific cloud selection, account ownership, spending authorization, and provider contracts remain decisions to record before deployment.
