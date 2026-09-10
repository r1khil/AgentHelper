# Decision log

## Approved baseline — 2026-09-10

Approver: Rikhil Sharma, exercising final Fund policy authority. Approved in conversation after reviewing the proposed decisions and implementation task list. This baseline supersedes conflicting proposals in the original outline. Timing and staffing remain with Rikhil and Max.

Purpose: improve learning and analyst outputs while preserving human reasoning. Agents should proactively prepare useful evidence and questions.

| Area | Approved decision |
| --- | --- |
| Product | One shared application; dedicated workspace and persistent holdings, theses, peers, prior updates, and open questions for each team. |
| Proactivity | Automatically investigate qualifying movements. Deliver daily team briefings on material developments and upcoming catalysts; suppress empty briefings. Earnings preparation follows movements. |
| Learning boundary | Gather evidence, explain concepts, suggest sourced possible catalysts, and ask questions. Analysts author causal arguments, thesis implications, and investment conclusions. |
| Analyst feedback | After the analyst supplies reasoning, flag unsupported claims, missing evidence, alternative explanations, and contradictions with the recorded thesis. Request revisions rather than generate a replacement update. |
| Context | Require holdings and owners; add theses, peers, and prior updates as available. Flag missing context. Analysts approve stored thesis changes; never infer investment positions from chat alone. |
| Movement | Absolute difference of daily returns versus actual SPX >= 4 percentage points, either direction, using official closing observations. Apply to ETFs too, with constituent and sector investigation. |
| Data quality | Licensed provider with actual SPX coverage; no silent proxy. Missing, stale, or incompatible observations create visible errors. Provider selection depends on verified access and coverage. |
| Evidence | Prefer filings, company announcements, and investor-relations materials; supplement with reputable reporting. Factual assertions require source and timestamp. Separate facts, calculations, and possible explanations. |
| Notifications | Email factual alerts and meaningful briefing links to the relevant team; work occurs in the web application. Dry runs send nothing. |
| Ownership | Holding owner is responsible, with team lead as fallback. Missing ownership must be visible. |
| Deadlines | Noon America/New_York on the next trading day. One reminder before the deadline and one overdue notice to owner and lead. |
| Completion | Analyst-authored update plus supporting sources, with actor and completion time recorded. |
| Stack | TypeScript, Next.js, PostgreSQL, managed authentication/storage, and durable background jobs. Replaceable provider integrations. |
| Access | Invite-only Fund access. Members access their own team's work; Fund administrators access all teams. Cross-team sharing requires explicit approval. |
| Validation | Replay THC and DRAM; treat their explanations as analyst claims to investigate. Verify boundaries, invalid data, duplicates, retries, provenance, and permissions. |
| Success | Evaluate evidence explanation, fact/hypothesis distinction, and defensible thesis implications; also preparation time and unsupported claims. Collect brief feedback after investigations. |

## Remaining implementation choices and inputs

These were not resolved by baseline approval:

- Specific market-data, research, model, email, hosting, auth/storage, and job providers; account access and spending budget.
- Reference-close adjustments, corporate actions, session calendar, timestamp tolerance, and closing-data availability rules.
- Actual team roster, holdings, owners, administrator list, and email recipients.
- Daily briefing send time, materiality criteria, pre-deadline reminder offset, and delivery-failure owner.
- Provider storage rights, retention, and source permissions.
- Cross-team sharing approver and approval mechanism.
- Repository licensing; historicals integration and proficiency rules remain deferred.

## Future decision record template

- Decision:
- Owner / approver:
- Date:
- Chosen behavior:
- Rationale and evidence:
- Acceptance examples:
- Supersedes:
