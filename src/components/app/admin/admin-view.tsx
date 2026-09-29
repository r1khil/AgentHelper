import Link from "next/link";
import { setAgentModel, setEmbeddingModel, setRerankModel } from "@/lib/actions/admin";
import { backfillFilingsNow, reembedNow, syncFilingsNow } from "@/lib/actions/jobs";
import { disconnectDrive, ingestDriveNow, renewDriveWatchNow, setDriveRoot, syncDriveNow } from "@/lib/actions/drive";
import { addMcpServer, removeMcpServer, setMcpDailyCap, testMcpServerNow, toggleMcpServer } from "@/lib/actions/mcp";
import type { DriveStatus } from "@/lib/drive/index";
import type { McpServer } from "@/db/schema";
import type { JobRunView } from "@/app/api/admin/job-runs/route";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Panel, PanelFooter, PanelHeader, Pill } from "@/components/app/panel";
import { PageHero } from "@/components/app/page-head";
import { AdminHead } from "./admin-head";
import { MemberActions } from "./member-actions";
import { jobResult, type ConnectionRow, type JobKey } from "./status";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Diagnostics } from "./diagnostics";
import { JobRunsLive } from "./job-runs-live";
import { JobsPanel, type JobsPanelProps } from "./jobs-panel";
import { MembersPanel, type MembersPanelProps } from "./members-panel";

type Option = { id: string; label: string };

export type AdminViewProps = {
  /** Which tab of /admin: Members (the default) or Jobs and connections (`?tab=jobs`). The PT sheet has its own route. */
  tab: "members" | "jobs";
  /** Scheduled jobs and services that need a look: the count on the Jobs and connections tab. */
  attention: number;
  connections: ConnectionRow[];
  /** The admin pressing the buttons, for "Send to me only" on the brief. */
  meEmail: string;
  canMutate: boolean;
  transparency: boolean;
  notice: { ok?: string; error?: string };
  members: MembersPanelProps;
  jobs: JobsPanelProps;
  runs: JobRunView[];
  services: { agent: boolean; news: boolean; email: boolean; webSearch: boolean };
  drive: DriveStatus;
  driveUnmatched: string[];
  filings: { lastSync: string | null; lastRun: { ok: boolean | null; at: string } | null };
  agent: { id: string; label: string | null; options: Option[] };
  /** The model that writes the Changelog's summaries. */
  changelogModel: string;
  retrieval: {
    configured: boolean;
    embedId: string;
    embedLabel: string | null;
    embedDims: number | null;
    embedOptions: (Option & { dims: number })[];
    rerankId: string;
    rerankOptions: Option[];
    stats: { documents: number; embeddedWithModel: number; chunksTotal: number; chunksWithModel: number } | null;
  };
  mcp: { servers: McpServer[]; budget: Record<string, { cap: number | null; used: number }> };
};

/** Members, or Jobs and connections: Manage / Admin with its tabs, then the tab's own page. */
export function AdminView(p: AdminViewProps) {
  const { drive, canMutate } = p;
  const notices = (p.notice.ok || p.notice.error) && (
    <p role="status" className={cn("mb-4 text-body font-medium", p.notice.error ? "text-caution-foreground" : "text-foreground")}>
      {p.notice.error ?? p.notice.ok}
    </p>
  );

  if (p.tab === "members") {
    return (
      <>
        <AdminHead active="members" attention={p.attention} actions={canMutate ? <MemberActions teams={p.members.teams} /> : undefined} />
        {notices}
        <MembersPanel {...p.members} />
      </>
    );
  }

  const needs = p.connections.filter((c) => c.attention);
  const failedJobs = ["close", "prices", "daily_brief", "morning", "weekly"].flatMap((job) => {
    const res = jobResult(job === "daily_brief" ? "brief" : (job as JobKey), p.jobs.last[job]);
    return res.attention ? [JOB_NAMES[job]] : [];
  });
  const names = [...failedJobs, ...needs.map((c) => `${c.name}: ${c.line.split(" · ")[0]}`)];
  return (
    <>
      <AdminHead active="jobs" attention={p.attention} />
      {notices}
      <PageHero
        label={`Scheduled jobs and outside services${canMutate ? "" : " · view only, an admin runs and changes them"}`}
        value={p.attention === 0 ? "All clear" : p.attention === 1 ? "1 needs attention" : `${p.attention} need attention`}
        note={names.length ? `${names.slice(0, 3).join(" · ")}${names.length > 3 ? ` · ${names.length - 3} more` : ""}` : "No job has failed and every service is connected"}
      />

      <div className="mt-6 grid grid-cols-1 items-start gap-14 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <JobsPanel {...p.jobs} meEmail={p.meEmail} />
        <section aria-labelledby="conn">
          <h2 id="conn" className="mb-1 text-title font-bold tracking-[-0.01em]">
            Connections
          </h2>
          {p.connections.map((c) => (
            <div key={c.key} className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-row text-body">
              <span className="flex min-w-0 flex-col py-1" title={c.title}>
                <b className="font-semibold">{c.name}</b>
                <span className={cn("truncate text-caption", c.attention ? "text-caution-foreground" : "text-muted-foreground")} title={c.line}>
                  {c.line}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">{connectionActions(c, p)}</span>
            </div>
          ))}
          {drive.connected && (
            <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-row text-body">
              <span className="flex min-w-0 flex-col py-1">
                <b className="font-semibold">PT sheet</b>
                <span className="truncate text-caption text-muted-foreground">Read from the Drive folder: allowed tabs only, never edited</span>
              </span>
              <Link href="/admin/pt-sheet" prefetch={false} className={LINK}>
                Test the read
              </Link>
            </div>
          )}
          <p className="mt-2 text-caption text-muted-foreground">
            News {p.services.news ? "on" : "off: set FINNHUB_API_KEY"} · Email {p.services.email ? "on" : "log only"} · Web search {p.services.webSearch ? "on" : "off"}
          </p>
        </section>
      </div>

      <div className="mt-10 flex flex-col gap-6">
      <Panel id="drive" variant="plain" className="scroll-mt-20">
        <PanelHeader title="Google Drive" aside={drive.connected ? `connected as ${drive.accountEmail}` : drive.configured ? "not connected" : "set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, DRIVE_TOKEN_KEY"} />
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="grid content-start gap-3 py-3">
            <p className="text-body text-ink-2">
              Hoot reads the Fund&rsquo;s document folder (initiating reports, earnings updates, models) and files analyst uploads into it. Permissions are read everything plus add new files only: the app never edits or deletes what you put there.
            </p>
            {canMutate && (
              <div className="flex flex-wrap items-center gap-2">
                <Button nativeButton={false} render={<a href="/api/google/connect" />} variant={drive.connected && !drive.needsReconnect ? "outline" : "default"} disabled={!drive.configured}>
                  {drive.connected ? "Reconnect Google" : "Connect Google Drive"}
                </Button>
                {drive.connected && (
                  <form action={disconnectDrive}>
                    <Button type="submit" variant="ghost">
                      Disconnect
                    </Button>
                  </form>
                )}
              </div>
            )}
            {canMutate && drive.connected && (
              <form action={setDriveRoot} className="grid gap-1.5 border-t border-row pt-3">
                <Label htmlFor="drive-root">Root folder (URL or id)</Label>
                <div className="flex items-center gap-2">
                  <Input id="drive-root" name="root" placeholder="https://drive.google.com/drive/folders/…" defaultValue={drive.rootFolderId ?? ""} required />
                  <Button type="submit" variant="secondary">
                    Save
                  </Button>
                </div>
                <p className="text-body text-muted-foreground">Layout expected inside it: one folder per sector team, then one folder per company named like &ldquo;American Express (AXP)&rdquo;.</p>
              </form>
            )}
          </div>
          <div className="grid content-start gap-3 py-3">
            {!drive.connected ? (
              <p className="text-body text-muted-foreground">{drive.configured ? "Connect the Fund's Google account to start." : "Add the three Drive variables to the environment, redeploy, then connect."}</p>
            ) : (
              <KV
                rows={[
                  ["Account", drive.accountEmail ?? "—"],
                  [
                    "Root folder",
                    drive.rootFolderId ? (
                      <a href={`https://drive.google.com/drive/folders/${drive.rootFolderId}`} target="_blank" rel="noreferrer" className="hover:underline">
                        {drive.rootFolderName ?? drive.rootFolderId}
                      </a>
                    ) : (
                      <span className="text-caution-foreground">not set</span>
                    ),
                  ],
                  ["Indexed", `${drive.fileCount} files, ${drive.matchedCount} matched to holdings`],
                  ["Last sync", drive.lastSyncAt ? fmtDateTime(drive.lastSyncAt) : "never"],
                  ...(drive.ingest
                    ? ([
                        [
                          "Read by the app",
                          <>
                            {drive.ingest.summarized} summarized, {drive.ingest.embedded} searchable of {drive.ingest.matched} matched
                            {drive.ingest.pending ? `; ${drive.ingest.pending} pending` : ""}
                            {drive.ingest.errored ? <span className="text-caution-foreground">; {drive.ingest.errored} with errors</span> : null}
                            {drive.ingest.pendingProposals ? `; ${drive.ingest.pendingProposals} thesis proposal${drive.ingest.pendingProposals === 1 ? "" : "s"} awaiting review` : ""}
                          </>,
                        ],
                      ] as [string, React.ReactNode][])
                    : []),
                  ...(drive.watch
                    ? ([
                        [
                          "Live updates",
                          drive.watch.active ? (
                            <>
                              on, channel valid until {drive.watch.expiration ? fmtDateTime(drive.watch.expiration) : "?"}
                              {drive.watch.lastChangeSyncAt ? `; last change applied ${fmtDateTime(drive.watch.lastChangeSyncAt)}` : ""}
                            </>
                          ) : (
                            <span className="text-caution-foreground">off{drive.watch.error ? `: ${drive.watch.error}` : ""}</span>
                          ),
                        ],
                      ] as [string, React.ReactNode][])
                    : []),
                  ...(drive.lastError ? ([["Error", <span key="e" className="text-destructive">{drive.lastError}</span>]] as [string, React.ReactNode][]) : []),
                  ...(p.driveUnmatched.length ? ([["Unmatched folders", p.driveUnmatched.join(" · ")]] as [string, React.ReactNode][]) : []),
                ]}
              />
            )}
          </div>
        </div>
        {canMutate && drive.connected && drive.rootFolderId && (
          <div className="flex items-center justify-between gap-3 border-t border-row py-2.5">
            <span className="text-body text-muted-foreground">
              With live updates on, Drive tells the app about changes as they happen; the morning sweep still does a full crawl and renews the channel. Reading files (summaries, search index) continues in the background a few at a time.
            </span>
            <div className="flex shrink-0 gap-2">
              <form action={renewDriveWatchNow}>
                <Button type="submit" variant="secondary">
                  Renew live updates
                </Button>
              </form>
              <form action={ingestDriveNow}>
                <Button type="submit" variant="secondary">
                  Read files now
                </Button>
              </form>
              <form action={syncDriveNow}>
                <Button type="submit" variant="secondary">
                  Sync now
                </Button>
              </form>
            </div>
          </div>
        )}
      </Panel>

      <Diagnostics summary="Hoot's models, document search, recent job runs and external tools">
        <Panel variant="plain">
          <PanelHeader title="Recent runs" aside={p.transparency ? "click a run for its step log" : "updates live while a job runs"} />
          <div className="overflow-x-auto">
            <JobRunsLive initial={p.runs} transparency={p.transparency} />
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel id="agent" variant="plain" className="scroll-mt-20">
            <PanelHeader title="Research agent" aside={p.services.agent ? `using ${p.agent.label ?? p.agent.id}` : "set OPENROUTER_API_KEY"} />
            <form action={setAgentModel} className="grid gap-2 py-3">
              <Label htmlFor="agent-model">Model</Label>
              <div className="flex flex-wrap items-center gap-2">
                <NativeSelect id="agent-model" name="model" defaultValue={p.agent.id} className="w-72" disabled={!canMutate}>
                  {p.agent.options.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  {!p.agent.label && <option value={p.agent.id}>{p.agent.id} (from environment)</option>}
                </NativeSelect>
                {canMutate && (
                  <Button type="submit" variant="secondary">
                    Save
                  </Button>
                )}
              </div>
              <p className="text-body text-muted-foreground">
                Applies to the next chat turn, draft feedback, earnings extraction, research-log distillation, and earnings prep packs. GPT-6 Luna and Muse Spark are paid (about half a cent to a cent a chat turn). If one is rate-limited or unavailable, the request goes to the other.
              </p>
              <p className="text-body text-muted-foreground">
                Changelog summaries are written by <span className="font-mono">{p.changelogModel}</span> (set with CHANGELOG_MODEL).
              </p>
            </form>
            <PanelFooter>
              Web search (Tavily): {p.services.webSearch ? "on; the agent has search_web and read_url." : "off; set TAVILY_API_KEY to give the agent search_web (read_url still opens a URL directly)."}
            </PanelFooter>
          </Panel>

          <Panel id="retrieval" variant="plain" className="scroll-mt-20">
            <PanelHeader title="Retrieval" aside={p.retrieval.configured ? `${p.retrieval.embedLabel ?? p.retrieval.embedId}${p.retrieval.embedDims ? `, ${p.retrieval.embedDims} dims` : ""}` : "embeddings off"} />
            <div className="grid gap-3 py-3">
              <form action={setEmbeddingModel} className="grid gap-1.5">
                <Label htmlFor="embed-model">Embedding model</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect id="embed-model" name="model" defaultValue={p.retrieval.embedId} className="w-72" disabled={!canMutate}>
                    {p.retrieval.embedOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} ({m.dims} dims)
                      </option>
                    ))}
                    {!p.retrieval.embedLabel && <option value={p.retrieval.embedId}>{p.retrieval.embedId} (from environment; not in the registry)</option>}
                  </NativeSelect>
                  {canMutate && (
                    <Button type="submit" variant="secondary">
                      Save
                    </Button>
                  )}
                </div>
              </form>
              <form action={setRerankModel} className="grid gap-1.5">
                <Label htmlFor="rerank-model">Reranker</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect id="rerank-model" name="model" defaultValue={p.retrieval.rerankId} className="w-72" disabled={!canMutate}>
                    {p.retrieval.rerankOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                    {!p.retrieval.rerankOptions.some((m) => m.id === p.retrieval.rerankId) && <option value={p.retrieval.rerankId}>{p.retrieval.rerankId} (from environment)</option>}
                  </NativeSelect>
                  {canMutate && (
                    <Button type="submit" variant="secondary">
                      Save
                    </Button>
                  )}
                </div>
              </form>
              <KV
                rows={[
                  [
                    "Embedded",
                    p.retrieval.stats
                      ? `${p.retrieval.stats.embeddedWithModel} of ${p.retrieval.stats.documents} indexed documents with this model (${p.retrieval.stats.chunksWithModel} of ${p.retrieval.stats.chunksTotal} chunks)`
                      : "unavailable (apply drizzle/0013_documents.sql)",
                  ],
                ]}
              />
            </div>
            {canMutate && (
              <form action={reembedNow} className="flex items-center justify-between gap-3 border-t border-row py-2.5">
                <span className="text-body text-muted-foreground">
                  Search fuses vector and full-text hits, then reranks. Free OpenRouter models share one budget (20 requests/min, 50 or 1,000/day) with the chat model: a switch re-embeds a few documents per run and stops on a 429 until the next run.
                </span>
                <Button type="submit" variant="secondary" className="shrink-0">
                  Re-embed now
                </Button>
              </form>
            )}
          </Panel>
        </div>

        <McpPanel mcp={p.mcp} canMutate={canMutate} />

      </Diagnostics>
      </div>
    </>
  );
}

const LINK = "rounded-full text-body font-semibold whitespace-nowrap text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** A one-button form styled as the Connections panel's action link. */
function ActionForm({ action, tone, children }: { action: () => Promise<void>; tone?: "caution"; children: React.ReactNode }) {
  return (
    <form action={action}>
      <button type="submit" className={cn(LINK, tone === "caution" && "text-caution-foreground")}>
        {children}
      </button>
    </form>
  );
}


const JOB_NAMES: Record<string, string> = { close: "Close check", prices: "Price history", daily_brief: "Hoot's evening brief", morning: "Morning sweep", weekly: "Weekly update pack" };

/** What each connection row lets you do: an admin runs it, an exec sees where the details are. */
function connectionActions(c: ConnectionRow, p: AdminViewProps): React.ReactNode {
  const { drive, canMutate } = p;
  const ingestPending = drive.ingest?.pending ?? 0;
  const link = (href: string, label: string, caution?: boolean) => (
    <a href={href} className={cn(LINK, caution && "text-caution-foreground")}>
      {label}
    </a>
  );
  switch (c.key) {
    case "drive":
      if (!canMutate) return link("#drive", "Details");
      if (drive.connected && drive.rootFolderId && !drive.needsReconnect) return <ActionForm action={syncDriveNow}>Sync now</ActionForm>;
      return drive.configured ? link("/api/google/connect", drive.connected ? "Reconnect" : "Connect", c.attention) : null;
    case "drive-unmatched":
      return c.attention ? link("#drive", "Review", true) : null;
    case "filings":
      return canMutate ? (
        <>
          <ActionForm action={syncFilingsNow}>Sync</ActionForm>
          <ActionForm action={backfillFilingsNow}>Backfill</ActionForm>
        </>
      ) : null;
    case "hoot":
      return link("#agent", canMutate ? "Change" : "Details");
    case "search":
      return canMutate && drive.connected && drive.rootFolderId ? (
        <ActionForm action={ingestDriveNow} tone={ingestPending > 0 ? "caution" : undefined}>
          Read now
        </ActionForm>
      ) : (
        link("#retrieval", "Details")
      );
    case "mcp":
      return link("#mcp", canMutate ? "Manage" : "Details");
    default:
      return null;
  }
}

function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 border-t border-row text-body">
      {rows.map(([k, v]) => (
        <div key={k} className="col-span-2 grid grid-cols-subgrid border-b border-row py-2 last:border-b-0">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function McpPanel({ mcp, canMutate }: { mcp: AdminViewProps["mcp"]; canMutate: boolean }) {
  const { servers, budget } = mcp;
  return (
    <Panel id="mcp" variant="plain" className="scroll-mt-20">
      <PanelHeader title="External tools (MCP servers)" count={servers.length || undefined} aside={servers.length ? `${servers.filter((m) => m.enabled).length} of ${servers.length} enabled` : "none registered"} />
      <div className={cn("grid", canMutate && "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
        <div className="min-w-0 overflow-x-auto">
          {servers.length === 0 ? (
            <p className="py-3 text-body text-muted-foreground">
              No MCP servers yet. Register a remote server (Streamable HTTP) and its tools join the research agent under the prefix you choose. Auth tokens stay in environment variables; only the variable name is stored here.
            </p>
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
                {servers.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="align-top">
                      <div className="font-medium">{m.name}</div>
                      <div className="max-w-[280px] truncate text-caption text-muted-foreground" title={m.url}>
                        {m.url}
                      </div>
                      {m.authEnv && <div className="text-body text-muted-foreground">auth from {m.authEnv}</div>}
                    </TableCell>
                    <TableCell className="align-top font-mono text-body">{m.toolPrefix}_</TableCell>
                    <TableCell className="align-top text-body">
                      <Pill tone={m.enabled ? "good" : "neutral"}>{m.enabled ? "Enabled" : "Disabled"}</Pill>
                      <div className="mt-1 text-muted-foreground">{m.lastOkAt ? `ok ${fmtDateTime(m.lastOkAt)}` : "never connected"}</div>
                      {m.lastError && (
                        <div className="mt-1 max-w-[220px] truncate text-destructive" title={m.lastError}>
                          {m.lastError}
                        </div>
                      )}
                      {budget[m.name]?.cap != null && (
                        <div className="mt-1 text-muted-foreground">
                          today {budget[m.name].used} of {budget[m.name].cap} calls (UTC)
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px] align-top text-body whitespace-normal text-muted-foreground">
                      {m.toolNames?.length ? m.toolNames.join(", ") : "—"}
                      {m.allowedTools?.length ? <div className="mt-1">allowed: {m.allowedTools.join(", ")}</div> : null}
                    </TableCell>
                    {canMutate && (
                      <TableCell className="text-right align-top">
                        <div className="flex justify-end gap-1.5">
                          <form action={testMcpServerNow}>
                            <input type="hidden" name="id" value={m.id} />
                            <Button type="submit" size="sm" variant="secondary">
                              Test
                            </Button>
                          </form>
                          <form action={toggleMcpServer}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="enabled" value={m.enabled ? "false" : "true"} />
                            <Button type="submit" size="sm" variant="secondary">
                              {m.enabled ? "Disable" : "Enable"}
                            </Button>
                          </form>
                          <form action={removeMcpServer}>
                            <input type="hidden" name="id" value={m.id} />
                            <Button type="submit" size="sm" variant="ghost">
                              Remove
                            </Button>
                          </form>
                        </div>
                        <form action={setMcpDailyCap} className="mt-1.5 flex items-center justify-end gap-1.5">
                          <input type="hidden" name="id" value={m.id} />
                          <Label htmlFor={`mcp-cap-${m.id}`} className="text-body font-normal text-muted-foreground">
                            Daily cap
                          </Label>
                          <Input id={`mcp-cap-${m.id}`} name="cap" inputMode="numeric" placeholder="none" defaultValue={budget[m.name]?.cap ?? ""} className="h-7 w-16 text-body" />
                          <Button type="submit" size="sm" variant="secondary">
                            Save
                          </Button>
                        </form>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        {canMutate && (
          <form action={addMcpServer} className="grid content-start gap-2 border-t py-3 lg:border-t-0 lg:border-l lg:py-0 lg:pl-4">
            <div className="text-body font-semibold">Add a server</div>
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
            <Button type="submit" variant="secondary" className="justify-self-start">
              Add and test
            </Button>
            <p className="text-body text-muted-foreground">Tools appear to the agent as prefix_toolname. The env var is read on this deployment and sent as a Bearer token; set it on Vercel before adding the server.</p>
          </form>
        )}
      </div>
    </Panel>
  );
}
