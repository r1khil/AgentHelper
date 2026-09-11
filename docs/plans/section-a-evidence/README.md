# Section A acceptance — PASS with explicit exceptions

Run: 2026-09-11, approximately 17:06–17:15 UTC, after the user said “ok. execute the plan.” Worktree: `section-a/acceptance`; application source `d6991ac`. No application code changed.

## Deployment and authentication

- Origin: `https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io`.
- Read-only Azure CLI returned active revision `agenthelper--recov2`, `Healthy`, on `ghcr.io/r1khil/agenthelper@sha256:26e8831b4a85cee6c361a79b6090104c07533f54ed0d2c67a1e900af29d33d40`. Worker image matches.
- Latest worker execution `agenthelper-worker-29819100`: `Succeeded`, 17:00:00–17:00:22 UTC. Previous 16:00 and 15:00 executions also succeeded.
- Health returned HTTP 200 and `{"status":"ok","service":"agenthelper"}` in 0.054887 s and 0.040806 s. Both were warm. No scale-to-zero or revision replacement was induced.
- At 17:08:50 UTC, login headers returned HTTP 307 to the `agenthelperdev2026.ciamlogin.com` tenant's authorize endpoint, with exact redirect URI `https://agenthelper.redtree-e725cc47.eastus.azurecontainerapps.io/auth/callback`. State, nonce and cookies were not saved.
- Browser TaskSpace `AgentHelper Dev`, ID 0, existing app tab adopted as `p1`. Initial navigation displayed `/login`; clicking **Continue with Microsoft** returned to authenticated overview as Rikhil Sharma, Fund administrator. No new OTP interaction was required or claimed. Administration, sources and briefings were accessible. Database evidence reports one non-fixture user and one non-fixture administrator.
- Default sandbox attempts failed for browser bootstrap, DNS and Azure session-file access. Reviewed escalated execution succeeded for all three. The first database probe's URI-in-PGDATABASE configuration did not connect; explicit PostgreSQL environment fields succeeded. These were execution-environment issues, not application failures. Credentials were not printed or saved.

## Replay and delivery results

Two sequential browser clicks on **Replay THC + DRAM**: 17:10:42.761 UTC (HTTP 200, approximately 447 ms) and 17:12:22.801 UTC (HTTP 200, approximately 300 ms). Both returned to administration with no application error and all ten scoped jobs `done`, one attempt each. Browser actions may write application data; external evidence queries were SELECT-only in repeatable-read/read-only transactions.

| Scoped record | S0 baseline | S1 first replay | S2 second replay |
| --- | ---: | ---: | ---: |
| Holdings | 2 | 2 | 2 |
| Movement events / investigations | 2 / 2 | 2 / 2 | 2 / 2 |
| Observations | 4 | 4 | 4 |
| Sources / evidence records | 4 / 6 | 4 / 6 | 4 / 6 |
| Briefings / briefing items | 2 / 5 | 2 / 5 | 2 / 5 |
| Jobs | 10 | 10 | 10 |
| Captured deliveries | 8 | 8 | 8 |

[S0](s0.json): 17:09:47.956518 UTC. [S1](s1.json): 17:10:45.955420 UTC. [S2](s2.json): 17:12:25.740359 UTC. Every saved field except the snapshot timestamp is identical, including IDs, keys, attempts and statuses. [Comparison result](comparison.json).

- THC investigation `1aa462cc-819c-4fe0-b988-ea6c398fba11`, event `b1b44f98-8c48-43d9-bd0b-933841065d32`, Healthcare.
- DRAM investigation `f92f9d4c-10ee-468f-b23b-f93c6a9d7c8a`, event `f5ab8217-df79-434a-8f7e-4695ef985572`, Technology.
- One event/investigation and two observations per fixture; both SPX consumers accounted for, no extra observations.
- Eight distinct delivery keys match the eight non-evidence jobs exactly: two alerts, two reminders, two overdue notifications and two briefings. All deliveries are `captured`, have recipients, and contain the synthetic captured-email marker. The two evidence jobs have evidence records, not email deliveries.
- All four linked source pages and both briefings rendered. Calculation inputs gave THC +5.1%, SPX +0.8%, relative +4.3 pp; DRAM -3.5%, SPX +0.8%, relative -4.3 pp. Facts and hypotheses remained separately labeled, with fixture/causality limitations visible.
- Fixtures existed before this run: this proves deployed replay/reuse, not first ingestion into an empty database.

## THC completion

THC started open with empty reasoning. Saved [explicit acceptance-test text](completion-test-text.txt), checked “No clear catalyst found,” requested fixture learning prompts, selected both THC source checkboxes, and clicked **Mark completed**. Completion persisted after reload at 17:14:11.284130 UTC. The exact test text remained and the save-reasoning/completion controls were removed.

[S3](s3.json) and [completion verification](completion-check.json) establish two valid supporting-source links, one `fixture` feedback record, and exactly two new audit events (`reasoning.saved`, `investigation.completed`). Text hash: `0b962a4eeff90a239d29034d2771337b`. DRAM remained open with empty reasoning; all its saved fields were unchanged. Events, observations, sources, evidence, jobs, briefings and deliveries were unchanged from S2.

Reminder/overdue jobs were already done before acceptance, so there were no pending/running reminders to cancel. Existing captured deliveries remain historical; this run does not claim to exercise pending-reminder cancellation.

One automation wait timed out looking for `in_progress` while the UI displays `in progress`. Inspection confirmed the save succeeded; it was not resubmitted. This was a test-driver wait error, not an application failure.

## Evidence and exceptions

Browser records: `browser-baseline.txt`, `replay-1.txt`, `replay-2.txt`, `thc-before.txt`, `dram-before.txt`, `dram-after-replay.txt`, `thc-feedback.txt`, `thc-completed.txt`, `overview-final.txt`, `source-*.txt`, and `briefing-*.txt`. [Final overview screenshot](overview-final.png) and [investigation statuses](investigation-statuses-final.png) were visually inspected. Recipient addresses are redacted from saved investigation snapshots. [snapshot.sql](snapshot.sql) is the SELECT-only query; JSON snapshots omit credentials, session tokens and recipient addresses. The existing app tab was retained on the final overview for user review and the TaskSpace was returned using `finish`.

Muse/Claude processes exist, but the old workflow could not be identified conclusively as running or finished. No concurrent acceptance writes or validation-doc changes were observed. No workflow was launched or cancelled; this dated evidence supersedes its acceptance deferrals without claiming its workflow finished.

Second developer sign-in remains deferred. Failed Azure resources remain retained, with no deletion/support case. No billing verification, infrastructure change, migration, seed, direct database mutation, commit, push or PR occurred. The approved browser sign-in/replay/reasoning/feedback/completion actions are the only deployed application mutations in this run. No application fix was needed, so dependencies/build/unit/integration tests were not rerun; prior test results remain historical.

Required synthetic deployment acceptance is complete with these exceptions. This does not establish real market-data accuracy, analyst outcomes, or production readiness under Sections B–E.
