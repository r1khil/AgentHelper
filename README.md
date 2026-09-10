# AgentHelper

An evidence workspace for Owlfund sector teams, built around one principle:

> The agent prepares the evidence; the analyst owns the interpretation.

The project helps analysts gather information, investigate major movements, prepare for earnings, and review model historicals while preserving source traceability and analyst learning.

## Project status

The movement pilot is implemented on `codex/v1-pilot`: Next.js, PostgreSQL, invite-only Entra sign-in, durable jobs, sourced investigations, captured notifications, and fixture reasoning feedback. Azure deployment configuration targets a two-developer environment; all market/evidence inputs are synthetic. Live providers and Fund rollout are deferred.

See [local setup and deployment](docs/deployment.md) and [implementation validation](docs/v1-validation.md).
The first release provides dedicated team workspaces, closing-movement investigations, sourced evidence, analyst reasoning feedback, completion tracking, and meaningful daily briefings.

## Start here

- [Original project outline](docs/original-outline.txt)
- [Product scope and ownership boundaries](docs/product.md)
- [First-release specification](docs/mvp.md)
- [Proposed architecture and data contracts](docs/architecture.md)
- [Implementation roadmap](docs/roadmap.md)
- [Approved decisions and remaining choices](docs/decisions.md)
- [Stack recommendation, cloud hosting costs, and credit considerations](docs/stack-and-hosting-research.md)
- [Collaboration workflow](CONTRIBUTING.md)

## Phases

| Phase                | Outcome                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| 1: Movement pilot    | Teams can investigate qualifying movements, record completion, and receive meaningful briefings. |
| 2: Earnings          | Reusable checklists, sourced results, refreshed charts, and preserved expectations.              |
| 3: Model historicals | Analyst-approved company mappings support sourced proposals and exception review.                |
| 4: Six teams         | Shared collection and Fund policies, permission-aware research, and semester continuity.         |

## Relationship to Historicals Solver

This is a separate project serving the same organization. Historicals Solver is a potential integration for phase 3; no integration or shared implementation is assumed. Define the integration contract and review the existing tool before connecting it.

## Working together

Pick a roadmap item, open an issue with acceptance criteria, implement it on a short-lived branch, and ask the other collaborator to review the pull request. See [CONTRIBUTING.md](CONTRIBUTING.md).

Keep real holdings, private analyst notes, credentials, and licensed source material out of the repository. Use synthetic or appropriately redistributable fixtures. No open-source license has been selected.
