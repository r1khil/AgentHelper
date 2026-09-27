import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { invitations, profiles, teams } from "@/db/schema";
import { requireRole, transparencyEnabled } from "@/lib/auth";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import { createTestAccount, inviteMember, removeMember, revokeInvitation, setAgentModel, setEmbeddingModel, setRerankModel, setWeeklyRecipients, updateMember } from "@/lib/actions/admin";
import { backfillFilingsNow, reembedNow, runBellwethersNow, runCloseNow, runEarningsPrepNow, runMorningNow, runDailyBriefNow, runPricesNow, runWeeklyNow, syncFilingsNow } from "@/lib/actions/jobs";
import { EMBEDDING_MODELS, RERANK_MODELS, embeddingDims, embeddingModelId, rerankModelId } from "@/lib/agent/retrieval-models";
import { embeddingConfigured } from "@/lib/agent/embeddings";
import { embeddingStats } from "@/lib/documents/index";
import { getSetting } from "@/lib/settings";
import { WEEKLY_RECIPIENTS_SETTING, inboundConfigured } from "@/lib/weekly/ask";
import { FILINGS_LAST_SYNC_SETTING } from "@/lib/jobs/filings";
import { tavilyConfigured } from "@/lib/web/tavily";
import { disconnectDrive, ingestDriveNow, renewDriveWatchNow, setDriveRoot, syncDriveNow } from "@/lib/actions/drive";
import { addMcpServer, removeMcpServer, setMcpDailyCap, testMcpServerNow, toggleMcpServer } from "@/lib/actions/mcp";
import { listMcpServers } from "@/lib/agent/mcp";
import { mcpBudgets } from "@/lib/agent/mcp-budget";
import { driveStatus } from "@/lib/drive/index";
import { jobRuns } from "@/db/schema";
import { fmtDateTime } from "@/lib/format";
import { JobRunsLive } from "@/components/app/admin/job-runs-live";
import type { JobRunView } from "@/app/api/admin/job-runs/route";
import { emailConfigured } from "@/lib/jobs/notify";
import { finnhubConfigured } from "@/lib/providers/finnhub";
import { AGENT_MODELS, agentConfigured, agentModelId } from "@/lib/agent/model";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Admin" };
// Jobs started from this page run inside its server actions; give them the same budget as the cron routes.
export const maxDuration = 300;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  // Execs see everything an admin sees; only admins can change anything (the server actions enforce this too).
  const me = await requireRole("exec", "admin");
  const canMutate = me.role === "admin";
  const { ok, error } = await searchParams;
  const transparency = transparencyEnabled(me);
  const runRows = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(12);
  const runs: JobRunView[] = runRows.map((r) => ({
    id: r.id,
    job: r.job,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    ok: r.ok,
    summary: r.summary,
    current: r.progress.at(-1) ?? null,
    progress: transparency ? r.progress : null,
  }));
  const [drive, lastDriveRun] = await Promise.all([driveStatus(), db.select().from(jobRuns).where(eq(jobRuns.job, "drive_sync")).orderBy(desc(jobRuns.startedAt)).limit(1).then((r) => r[0] ?? null)]);
  const currentModelId = await agentModelId();
  const mcp = await listMcpServers().catch(() => []);
  const mcpBudget = await mcpBudgets(mcp.map((m) => m.name)).catch(() => ({}) as Awaited<ReturnType<typeof mcpBudgets>>);
  const currentModel = AGENT_MODELS.find((m) => m.id === currentModelId);
  const [embedId, rerankId, filingsLastSync, weeklyRecipients] = await Promise.all([embeddingModelId(), rerankModelId(), getSetting(FILINGS_LAST_SYNC_SETTING), getSetting(WEEKLY_RECIPIENTS_SETTING)]);
  const weeklyLabel = `Cron Sunday 13:00 UTC · inbound email ${inboundConfigured() ? "on" : "not configured"}`;
  const embedModel = EMBEDDING_MODELS.find((m) => m.id === embedId);
  const embedDims = (() => {
    try {
      return embeddingDims(embedId);
    } catch {
      return null;
    }
  })();
  const retrieval = await embeddingStats(embedId).catch(() => null);
  const lastFilingsRun = await db.select().from(jobRuns).where(eq(jobRuns.job, "filings_sync")).orderBy(desc(jobRuns.startedAt)).limit(1).then((r) => r[0] ?? null);
  const driveUnmatched = ((lastDriveRun?.summary as { unmatched?: string[] } | undefined)?.unmatched ?? []).slice(0, 12);
  const driveLabel = !drive.configured ? "off" : !drive.connected ? "not connected" : drive.needsReconnect ? "reconnect needed" : `on (${drive.fileCount} files)`;
  const [allTeams, members, pending] = await Promise.all([
    db.select().from(teams).orderBy(asc(teams.sortOrder)),
    db
      .select({ p: profiles, teamName: teams.name })
      .from(profiles)
      .leftJoin(teams, eq(teams.id, profiles.teamId))
      .orderBy(asc(profiles.role), asc(profiles.fullName)),
    db.select().from(invitations).where(isNull(invitations.acceptedAt)).orderBy(desc(invitations.createdAt)),
  ]);

  const roleOptions = ROLES.map((r) => (
    <option key={r} value={r}>
      {ROLE_LABELS[r]}
    </option>
  ));
  const teamOptions = (
    <>
      <option value="">No team (fund-wide)</option>
      {allTeams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </>
  );

  return (
    <>
      <PageHeader title="Admin" description="Members, invitations, test accounts, and scheduled jobs." />
      {ok && <Notice tone="ok">{ok}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {!canMutate && <Notice tone="info">View only. Changes here are made by an admin.</Notice>}

      <SectionTitle aside={`Agent: ${agentConfigured() ? "on" : "off"} · News: ${finnhubConfigured() ? "on" : "off"} · Email: ${emailConfigured() ? "on" : "log only"} · Drive: ${driveLabel}`}>Jobs</SectionTitle>
      <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {canMutate ? (
        <Card className="p-4">
          <form action={runCloseNow} className="grid gap-2">
            <Label htmlFor="job-date">Close check (movements)</Label>
            <div className="flex items-center gap-2">
              <Input id="job-date" name="date" type="date" className="w-40" />
              <Button type="submit" size="sm" variant="outline">Run</Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="force" className="size-3.5" /> Re-run even if this session already completed
            </label>
            <p className="text-xs text-muted-foreground">Leave the date empty for today. Scheduled weekdays at 5:00 p.m. New York (Supabase pg_cron), with a 7 p.m. Vercel backstop.</p>
          </form>
          <form action={runMorningNow} className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-sm">Morning sweep (reminders, earnings, email)</span>
            <Button type="submit" size="sm" variant="outline">Run</Button>
          </form>
          <form action={runPricesNow} className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-sm">Price history (attribution closes, dividends, splits)</span>
            <Button type="submit" size="sm" variant="outline">Run</Button>
          </form>
          <form action={runDailyBriefNow} className="mt-3 grid gap-2 border-t pt-3">
            <Label htmlFor="brief-date">Hoot&apos;s daily attribution brief</Label>
            <div className="flex items-center gap-2">
              <Input id="brief-date" name="date" type="date" className="w-40" />
              <Button type="submit" size="sm" variant="outline">Run</Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="everyone" className="size-3.5" /> Email everyone on the list, not just me
            </label>
            <p className="text-xs text-muted-foreground">Weekdays: prices and close check at 5:00 p.m., Hoot&apos;s analysis at 5:05, email to Aadi, Saad, Rikhil and Max at 5:15 (New York). If the email fails it is retried every 15 minutes until midnight, and admins are emailed once it is late.</p>
          </form>
          <form action={runBellwethersNow} className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-sm">Sector bellwethers (ETF constituents, earnings dates, industries)</span>
            <Button type="submit" size="sm" variant="outline">Run</Button>
          </form>
          <form action={runEarningsPrepNow} className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-sm">Earnings prep packs (reports in the next five trading days, up to three per run)</span>
            <Button type="submit" size="sm" variant="outline">Run</Button>
          </form>
          <div className="mt-3 grid gap-2 border-t pt-3">
            <Label htmlFor="weekly-date">Weekly update (pack for last Friday, then the process-update asks)</Label>
            <div className="flex items-center gap-2">
              <form action={runWeeklyNow} className="flex items-center gap-2">
                <Input id="weekly-date" name="date" type="date" className="w-40" />
                <Button type="submit" size="sm" variant="outline">Run</Button>
              </form>
            </div>
            <p className="text-xs text-muted-foreground">Leave the date empty for today. {weeklyLabel}.</p>
            <form action={setWeeklyRecipients} className="grid gap-1.5">
              <Label htmlFor="weekly-recipients">Ask these people (blank = every exec)</Label>
              <div className="flex items-center gap-2">
                <Input id="weekly-recipients" name="recipients" defaultValue={weeklyRecipients ?? ""} placeholder="apatil@theowlfund.com, squddus@theowlfund.com" />
                <Button type="submit" size="sm" variant="outline">Save</Button>
              </div>
            </form>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-sm">
              SEC filings index (10-K, 10-Q, 8-K and EX-99.1 for every holding)
              <span className="block text-xs text-muted-foreground">
                {filingsLastSync ? `Last sync ${filingsLastSync}` : "Never synced"}
                {lastFilingsRun ? ` · last run ${lastFilingsRun.ok === false ? "failed" : "ok"} ${fmtDateTime(lastFilingsRun.startedAt)}` : ""}. Also runs inside the morning sweep.
              </span>
            </span>
            <div className="flex shrink-0 gap-2">
              <form action={syncFilingsNow}>
                <Button type="submit" size="sm" variant="outline">Sync filings</Button>
              </form>
              <form action={backfillFilingsNow}>
                <Button type="submit" size="sm" variant="outline">Backfill (2y)</Button>
              </form>
            </div>
          </div>
        </Card>
        ) : (
        <Card className="p-4 text-sm">
          <ul className="grid gap-2">
            <li>Close check (movements). Scheduled weekdays at 5:00 p.m. New York (Supabase pg_cron), with a 7 p.m. Vercel backstop.</li>
            <li className="border-t pt-2">Morning sweep (reminders, earnings, email). Scheduled at 14:00 UTC.</li>
            <li className="border-t pt-2">Price history (attribution closes, dividends, splits). Scheduled at 23:30 UTC.</li>
            <li className="border-t pt-2">Sector bellwethers (ETF constituents, earnings dates, industries). Runs inside the morning sweep.</li>
            <li className="border-t pt-2">Earnings prep packs (agent-gathered evidence for reports in the next five trading days). Runs inside the morning sweep.</li>
            <li className="border-t pt-2">SEC filings index (10-K, 10-Q, 8-K and EX-99.1 for every holding). Runs inside the morning sweep{filingsLastSync ? `; last sync ${filingsLastSync}` : ""}.</li>
            <li className="border-t pt-2">Weekly update (pack for last Friday, then the process-update asks). {weeklyLabel}. Asks go to {weeklyRecipients || "every exec"}.</li>
          </ul>
        </Card>
        )}
        <Card className="overflow-x-auto p-0">
          <JobRunsLive initial={runs} transparency={transparency} />
        </Card>
      </div>

      <SectionTitle aside={agentConfigured() ? `using ${currentModel?.label ?? currentModelId}` : "set OPENROUTER_API_KEY"}>Research agent</SectionTitle>
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <form action={setAgentModel} className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="agent-model">Model</Label>
              <NativeSelect id="agent-model" name="model" defaultValue={currentModelId} className="w-72" disabled={!canMutate}>
                {AGENT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                {!currentModel && <option value={currentModelId}>{currentModelId} (from environment)</option>}
              </NativeSelect>
            </div>
            {canMutate && <Button type="submit" size="sm" variant="outline">Save</Button>}
            <p className="basis-full text-xs text-muted-foreground">Applies to the next chat turn, draft feedback, earnings extraction, research-log distillation, and earnings prep packs. All three are free OpenRouter models; a rate-limited model hands the request to the next one on the list.</p>
          </form>
          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Web search (Tavily): {tavilyConfigured() ? "on; the agent has search_web and read_url." : "off; set TAVILY_API_KEY to give the agent search_web (read_url still opens a URL directly)."}</p>
        </Card>
        <Card className="p-4">
          <SectionTitle aside={embeddingConfigured() ? `${embedModel?.label ?? embedId}${embedDims ? `, ${embedDims} dims` : ""}` : "embeddings off"}>Retrieval</SectionTitle>
          <form action={setEmbeddingModel} className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="embed-model">Embedding model</Label>
              <NativeSelect id="embed-model" name="model" defaultValue={embedId} className="w-72" disabled={!canMutate}>
                {EMBEDDING_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.dims} dims)
                  </option>
                ))}
                {!embedModel && <option value={embedId}>{embedId} (from environment; not in the registry)</option>}
              </NativeSelect>
            </div>
            {canMutate && <Button type="submit" size="sm" variant="outline">Save</Button>}
          </form>
          <form action={setRerankModel} className="mt-3 flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="rerank-model">Reranker</Label>
              <NativeSelect id="rerank-model" name="model" defaultValue={rerankId} className="w-72" disabled={!canMutate}>
                {RERANK_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                {!RERANK_MODELS.some((m) => m.id === rerankId) && <option value={rerankId}>{rerankId} (from environment)</option>}
              </NativeSelect>
            </div>
            {canMutate && <Button type="submit" size="sm" variant="outline">Save</Button>}
          </form>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t pt-3 text-sm">
            <dt className="text-muted-foreground">Embedded</dt>
            <dd className="tnum">
              {retrieval ? `${retrieval.embeddedWithModel} of ${retrieval.documents} indexed documents with this model (${retrieval.chunksWithModel} of ${retrieval.chunksTotal} chunks)` : "unavailable (apply drizzle/0013_documents.sql)"}
            </dd>
          </dl>
          {canMutate && (
            <form action={reembedNow} className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">Search fuses vector and full-text hits, then reranks. Free OpenRouter models share one budget (20 requests/min, 50 or 1,000/day) with the chat model: a switch re-embeds a few documents per run and stops on a 429 until the next run.</span>
              <Button type="submit" size="sm" variant="outline" className="shrink-0">Re-embed now</Button>
            </form>
          )}
        </Card>
      </div>

      <SectionTitle aside={mcp.length ? `${mcp.filter((m) => m.enabled).length} of ${mcp.length} enabled` : "none registered"}>
        <span id="mcp">External tools (MCP servers)</span>
      </SectionTitle>
      <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="overflow-x-auto p-0">
          {mcp.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No MCP servers yet. Register a remote server (Streamable HTTP) and its tools join the research agent under the prefix you choose. Auth tokens stay in environment variables; only the variable name is stored here.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tools</TableHead>
                  {canMutate && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {mcp.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium">{m.name}</div>
                      <div className="max-w-[280px] truncate text-xs text-muted-foreground" title={m.url}>{m.url}</div>
                      {m.authEnv && <div className="text-xs text-muted-foreground">auth from {m.authEnv}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{m.toolPrefix}_</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={m.enabled ? "default" : "secondary"}>{m.enabled ? "enabled" : "disabled"}</Badge>
                      <div className="mt-1 text-muted-foreground">{m.lastOkAt ? `ok ${fmtDateTime(m.lastOkAt)}` : "never connected"}</div>
                      {m.lastError && <div className="mt-1 max-w-[220px] truncate text-destructive" title={m.lastError}>{m.lastError}</div>}
                      {mcpBudget[m.name]?.cap != null && (
                        <div className="mt-1 text-muted-foreground">
                          today {mcpBudget[m.name].used} of {mcpBudget[m.name].cap} calls (UTC)
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                      {m.toolNames?.length ? m.toolNames.join(", ") : "—"}
                      {m.allowedTools?.length ? <div className="mt-1">allowed: {m.allowedTools.join(", ")}</div> : null}
                    </TableCell>
                    {canMutate && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <form action={testMcpServerNow}>
                            <input type="hidden" name="id" value={m.id} />
                            <Button type="submit" size="sm" variant="outline">Test</Button>
                          </form>
                          <form action={toggleMcpServer}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="enabled" value={m.enabled ? "false" : "true"} />
                            <Button type="submit" size="sm" variant="outline">{m.enabled ? "Disable" : "Enable"}</Button>
                          </form>
                          <form action={removeMcpServer}>
                            <input type="hidden" name="id" value={m.id} />
                            <Button type="submit" size="sm" variant="ghost">Remove</Button>
                          </form>
                        </div>
                        <form action={setMcpDailyCap} className="mt-1.5 flex items-center justify-end gap-1.5">
                          <input type="hidden" name="id" value={m.id} />
                          <Label htmlFor={`mcp-cap-${m.id}`} className="text-xs font-normal text-muted-foreground">Daily cap</Label>
                          <Input id={`mcp-cap-${m.id}`} name="cap" inputMode="numeric" placeholder="none" defaultValue={mcpBudget[m.name]?.cap ?? ""} className="h-7 w-16 text-xs" />
                          <Button type="submit" size="sm" variant="outline">Save</Button>
                        </form>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        {canMutate && (
          <Card className="p-4">
            <form action={addMcpServer} className="grid gap-2">
              <div className="grid gap-1">
                <Label htmlFor="mcp-name">Name</Label>
                <Input id="mcp-name" name="name" placeholder="EDGAR full-text search" required />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="mcp-url">Server URL (Streamable HTTP)</Label>
                <Input id="mcp-url" name="url" placeholder="https://example.com/mcp" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label htmlFor="mcp-prefix">Tool prefix</Label>
                  <Input id="mcp-prefix" name="toolPrefix" placeholder="edgar" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="mcp-auth">Auth env var</Label>
                  <Input id="mcp-auth" name="authEnv" placeholder="EDGAR_MCP_TOKEN" />
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="mcp-allowed">Allowed tools (optional, comma-separated)</Label>
                <Input id="mcp-allowed" name="allowedTools" placeholder="search, get_filing" />
              </div>
              <Button type="submit" size="sm" variant="outline" className="justify-self-start">Add and test</Button>
              <p className="text-xs text-muted-foreground">Tools appear to the agent as prefix_toolname. The env var is read on this deployment and sent as a Bearer token; set it on Vercel before adding the server.</p>
            </form>
          </Card>
        )}
      </div>

      <SectionTitle aside={drive.connected ? `connected as ${drive.accountEmail}` : drive.configured ? "not connected" : "set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, DRIVE_TOKEN_KEY"}>Google Drive</SectionTitle>
      <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="p-4">
          <p className="text-sm">
            The agent reads the Fund&rsquo;s document folder (initiating reports, earnings updates, models) and files analyst uploads into it. Permissions are read everything plus add new files only: the app never edits or deletes what you put there.
          </p>
          {canMutate && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button render={<a href="/api/google/connect" />} size="sm" variant={drive.connected && !drive.needsReconnect ? "outline" : "default"} disabled={!drive.configured}>
              {drive.connected ? "Reconnect Google" : "Connect Google Drive"}
            </Button>
            {drive.connected && (
              <form action={disconnectDrive}>
                <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                  Disconnect
                </Button>
              </form>
            )}
          </div>
          )}
          {canMutate && drive.connected && (
            <form action={setDriveRoot} className="mt-4 grid gap-2 border-t pt-3">
              <Label htmlFor="drive-root">Root folder (URL or id)</Label>
              <div className="flex items-center gap-2">
                <Input id="drive-root" name="root" placeholder="https://drive.google.com/drive/folders/…" defaultValue={drive.rootFolderId ?? ""} required />
                <Button type="submit" size="sm" variant="outline">
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Layout expected inside it: one folder per sector team, then one folder per company named like &ldquo;American Express (AXP)&rdquo;.</p>
            </form>
          )}
          {drive.connected && (
            <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">The price target sheet is read separately: allowed tabs only, never edited.</span>
              <Button nativeButton={false} render={<Link href="/admin/pt-sheet" prefetch={false} />} size="sm" variant="outline" className="shrink-0">
                Test PT sheet read
              </Button>
            </div>
          )}
        </Card>
        <Card className="p-4 text-sm">
          {!drive.connected ? (
            <p className="text-muted-foreground">{drive.configured ? "Connect the Fund's Google account to start." : "Add the three Drive variables to the environment, redeploy, then connect."}</p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted-foreground">Account</dt>
              <dd>{drive.accountEmail}</dd>
              <dt className="text-muted-foreground">Root folder</dt>
              <dd>
                {drive.rootFolderId ? (
                  <a href={`https://drive.google.com/drive/folders/${drive.rootFolderId}`} target="_blank" rel="noreferrer" className="hover:underline">
                    {drive.rootFolderName ?? drive.rootFolderId}
                  </a>
                ) : (
                  <span className="text-warning-foreground">not set</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Indexed</dt>
              <dd className="tnum">
                {drive.fileCount} files, {drive.matchedCount} matched to holdings
              </dd>
              <dt className="text-muted-foreground">Last sync</dt>
              <dd className="tnum">{drive.lastSyncAt ? fmtDateTime(drive.lastSyncAt) : "never"}</dd>
              {drive.ingest && (
                <>
                  <dt className="text-muted-foreground">Read by the app</dt>
                  <dd className="tnum">
                    {drive.ingest.summarized} summarized, {drive.ingest.embedded} embedded of {drive.ingest.matched} matched
                    {drive.ingest.pending ? `; ${drive.ingest.pending} pending` : ""}
                    {drive.ingest.errored ? <span className="text-warning-foreground">; {drive.ingest.errored} with errors</span> : null}
                    {drive.ingest.pendingProposals ? `; ${drive.ingest.pendingProposals} thesis proposal${drive.ingest.pendingProposals === 1 ? "" : "s"} awaiting review` : ""}
                  </dd>
                </>
              )}
              {drive.watch && (
                <>
                  <dt className="text-muted-foreground">Live updates</dt>
                  <dd>
                    {drive.watch.active ? (
                      <span className="tnum">on, channel valid until {drive.watch.expiration ? fmtDateTime(drive.watch.expiration) : "?"}{drive.watch.lastChangeSyncAt ? `; last change applied ${fmtDateTime(drive.watch.lastChangeSyncAt)}` : ""}</span>
                    ) : (
                      <span className="text-warning-foreground">off{drive.watch.error ? `: ${drive.watch.error}` : ""}</span>
                    )}
                  </dd>
                </>
              )}
              {drive.lastError && (
                <>
                  <dt className="text-destructive">Error</dt>
                  <dd className="text-destructive">{drive.lastError}</dd>
                </>
              )}
              {driveUnmatched.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Unmatched folders</dt>
                  <dd className="text-xs text-muted-foreground">{driveUnmatched.join(" · ")}</dd>
                </>
              )}
            </dl>
          )}
          {canMutate && drive.connected && drive.rootFolderId && (
            <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">With live updates on, Drive tells the app about changes as they happen; the morning sweep still does a full crawl and renews the channel. Reading files (summaries, search index) continues in the background a few at a time.</span>
              <div className="flex shrink-0 gap-2">
                <form action={renewDriveWatchNow}>
                  <Button type="submit" size="sm" variant="outline">
                    Renew live updates
                  </Button>
                </form>
                <form action={ingestDriveNow}>
                  <Button type="submit" size="sm" variant="outline">
                    Read files now
                  </Button>
                </form>
                <form action={syncDriveNow}>
                  <Button type="submit" size="sm" variant="outline">
                    Sync now
                  </Button>
                </form>
              </div>
            </div>
          )}
        </Card>
      </div>

      <SectionTitle aside={`${members.length} members`}>Members</SectionTitle>
      <Card className="mb-8 overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Sign-in</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map(({ p, teamName }) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.fullName}
                  {p.id === me.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                  {!p.onboardedAt && (
                    <Badge variant="outline" className="ml-1.5 border-warning text-warning-foreground">
                      setup pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.kind === "password" ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Badge variant="secondary">username</Badge>
                      {p.username}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <Badge variant="secondary">google</Badge>
                      {p.email}
                    </span>
                  )}
                </TableCell>
                {canMutate ? (
                  <TableCell colSpan={2}>
                    <form action={updateMember} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <NativeSelect name="role" defaultValue={p.role} className="w-40">
                        {roleOptions}
                      </NativeSelect>
                      <NativeSelect name="teamId" defaultValue={p.teamId ?? ""} className="w-56">
                        {teamOptions}
                      </NativeSelect>
                      <Button type="submit" size="sm" variant="outline">
                        Save
                      </Button>
                    </form>
                  </TableCell>
                ) : (
                  <>
                    <TableCell className="text-muted-foreground">{ROLE_LABELS[p.role]}</TableCell>
                    <TableCell className="text-muted-foreground">{teamName ?? "Fund-wide"}</TableCell>
                  </>
                )}
                <TableCell className="text-right">
                  {canMutate && p.id !== me.id && (
                    <form action={removeMember}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                        Remove
                      </Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {canMutate && (
          <>
          <SectionTitle>Invite a member (Google sign-in)</SectionTitle>
          <Card className="p-4">
            <form action={inviteMember} className="grid gap-3">
              <Field label="Email" htmlFor="inv-email">
                <Input id="inv-email" name="email" type="email" placeholder="name@temple.edu" required />
              </Field>
              <Field label="Full name" htmlFor="inv-name">
                <Input id="inv-name" name="fullName" required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Role" htmlFor="inv-role">
                  <NativeSelect id="inv-role" name="role" defaultValue="associate_analyst">
                    {roleOptions}
                  </NativeSelect>
                </Field>
                <Field label="Team" htmlFor="inv-team">
                  <NativeSelect id="inv-team" name="teamId" defaultValue="">
                    {teamOptions}
                  </NativeSelect>
                </Field>
              </div>
              <Button type="submit" className="justify-self-start">
                Add to roster
              </Button>
            </form>
          </Card>
          </>
          )}

          {pending.length > 0 && (
            <>
              <SectionTitle aside="not yet signed in">Pending invitations</SectionTitle>
              <Card className="p-0">
                <Table>
                  <TableBody>
                    {pending.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <div className="font-medium">{i.fullName ?? i.email}</div>
                          <div className="text-xs text-muted-foreground">{i.email}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{ROLE_LABELS[i.role]}</TableCell>
                        <TableCell className="text-muted-foreground">{allTeams.find((t) => t.id === i.teamId)?.name ?? "Fund-wide"}</TableCell>
                        <TableCell className="text-right">
                          {canMutate && (
                            <form action={revokeInvitation}>
                              <input type="hidden" name="id" value={i.id} />
                              <Button type="submit" size="sm" variant="ghost">
                                Revoke
                              </Button>
                            </form>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </div>

        {canMutate && (
        <div>
          <SectionTitle>Create a test account (username + password)</SectionTitle>
          <Card className="p-4">
            <form action={createTestAccount} className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Username" htmlFor="ta-user">
                  <Input id="ta-user" name="username" autoCapitalize="none" placeholder="max.lead" required />
                </Field>
                <Field label="Password" htmlFor="ta-pass">
                  <Input id="ta-pass" name="password" type="text" autoComplete="off" minLength={8} required />
                </Field>
              </div>
              <Field label="Full name" htmlFor="ta-name">
                <Input id="ta-name" name="fullName" required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Role" htmlFor="ta-role">
                  <NativeSelect id="ta-role" name="role" defaultValue="associate_analyst">
                    {roleOptions}
                  </NativeSelect>
                </Field>
                <Field label="Team" htmlFor="ta-team">
                  <NativeSelect id="ta-team" name="teamId" defaultValue={allTeams[0]?.id ?? ""}>
                    {teamOptions}
                  </NativeSelect>
                </Field>
              </div>
              <Button type="submit" className="justify-self-start">
                Create account
              </Button>
              <p className="text-xs text-muted-foreground">
                Test accounts sign in with the username box on the login page. No email is involved.
              </p>
            </form>
          </Card>
        </div>
        )}
      </div>
    </>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Notice({ tone, children }: { tone: "ok" | "error" | "info"; children: React.ReactNode }) {
  return (
    <div
      className={
        tone === "ok"
          ? "mb-4 rounded-md border border-up/30 bg-up/5 px-3 py-2 text-sm"
          : tone === "info"
            ? "mb-4 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            : "mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      }
    >
      {children}
    </div>
  );
}
