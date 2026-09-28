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

type Dot = "good" | "caution" | "down";
const DOT: Record<Dot, string> = { good: "bg-up", caution: "bg-caution-foreground", down: "bg-down" };

/** S16: members on the left; connections and scheduled jobs on the right; Drive below, then the plumbing in a collapsed Diagnostics. */
export function AdminView(p: AdminViewProps) {
  const { drive, canMutate } = p;
  const ingestPending = drive.ingest?.pending ?? 0;
  const embeddedAll = p.retrieval.stats ? p.retrieval.stats.embeddedWithModel >= p.retrieval.stats.documents : true;

  const connections: { name: string; line: string; dot: Dot; actions: React.ReactNode; title?: string }[] = [
    {
      name: "Google Drive",
      dot: !drive.configured ? "down" : !drive.connected || drive.needsReconnect ? "caution" : drive.lastError ? "down" : drive.watch && !drive.watch.active ? "caution" : "good",
      line: !drive.configured
        ? "Not configured on this deployment"
        : !drive.connected
          ? "Not connected"
          : drive.needsReconnect
            ? "Reconnect needed"
            : [
                drive.rootFolderName ?? (drive.rootFolderId ? "Fund folder" : "Root folder not set"),
                `${drive.fileCount} files indexed`,
                drive.watch?.active ? `live updates until ${fmtDateTime(drive.watch.expiration)}` : "live updates off",
              ].join(" · "),
      title: drive.lastError ?? undefined,
      actions: canMutate ? (
        drive.connected && drive.rootFolderId && !drive.needsReconnect ? (
          <ActionForm action={syncDriveNow}>Sync now</ActionForm>
        ) : drive.configured ? (
          <a href="/api/google/connect" className={LINK}>
            {drive.connected ? "Reconnect" : "Connect"}
          </a>
        ) : null
      ) : (
        <a href="#drive" className={LINK}>
          Details
        </a>
      ),
    },
    {
      name: "SEC filings index",
      dot: p.filings.lastRun?.ok === false ? "down" : !p.filings.lastSync ? "caution" : "good",
      line: `10-K, 10-Q, 8-K and EX-99.1 for every holding · ${p.filings.lastSync ? `last sync ${p.filings.lastSync}` : "never synced"}${p.filings.lastRun ? ` · last run ${p.filings.lastRun.ok === false ? "failed" : "ok"} ${fmtDateTime(p.filings.lastRun.at)}` : ""}`,
      title: "Also runs inside the morning sweep.",
      actions: canMutate ? (
        <>
          <ActionForm action={syncFilingsNow}>Sync</ActionForm>
          <ActionForm action={backfillFilingsNow}>Backfill</ActionForm>
        </>
      ) : null,
    },
    {
      name: "Hoot",
      dot: p.services.agent ? "good" : "down",
      line: p.services.agent ? `Ready · web search ${p.services.webSearch ? "on" : "off"}` : "Off: not set up on this deployment",
      actions: (
        <a href="#agent" className={LINK}>
          {canMutate ? "Change" : "Details"}
        </a>
      ),
    },
    {
      name: "Document search",
      dot: !p.retrieval.configured ? "down" : ingestPending > 0 || !embeddedAll ? "caution" : "good",
      line: !p.retrieval.configured
        ? "Off: not set up on this deployment"
        : ingestPending
          ? `${ingestPending} ${ingestPending === 1 ? "file" : "files"} waiting to be read`
          : p.retrieval.stats
            ? `${p.retrieval.stats.embeddedWithModel} of ${p.retrieval.stats.documents} documents searchable`
            : "Status unavailable",
      actions:
        canMutate && drive.connected && drive.rootFolderId ? (
          <ActionForm action={ingestDriveNow} tone={ingestPending > 0 ? "caution" : undefined}>
            Read now
          </ActionForm>
        ) : (
          <a href="#retrieval" className={LINK}>
            Details
          </a>
        ),
    },
    {
      name: "Unmatched Drive folders",
      dot: p.driveUnmatched.length ? "caution" : "good",
      line: p.driveUnmatched.length
        ? `“${p.driveUnmatched[0]}”${p.driveUnmatched.length > 1 ? ` and ${p.driveUnmatched.length - 1} more` : ""} ${p.driveUnmatched.length > 1 ? "have" : "has"} no (TICKER) and no holding match`
        : "Every company folder matched a holding",
      actions: p.driveUnmatched.length ? (
        <a href="#drive" className={cn(LINK, "text-caution-foreground")}>
          Review
        </a>
      ) : null,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {(p.notice.ok || p.notice.error || !canMutate) && (
        <div className="flex flex-col gap-2">
          {p.notice.ok && <Banner tone="good">{p.notice.ok}</Banner>}
          {p.notice.error && <Banner tone="caution">{p.notice.error}</Banner>}
          {!canMutate && <Banner>View only. Changes here are made by an admin.</Banner>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:h-[calc(100dvh-104px)] lg:min-h-[600px] lg:grid-cols-[minmax(0,1fr)_440px]">
        <MembersPanel {...p.members} />
        <div className="flex min-h-0 flex-col gap-5">
          <Panel className="shrink-0">
            <PanelHeader title="Connections" />
            {connections.map((c) => (
              <div key={c.name} className="flex h-[52px] items-center gap-3 border-b border-row px-4 last:border-b-0">
                <span className={cn("size-2 shrink-0 rounded-full", DOT[c.dot])} aria-label={c.dot === "good" ? "Healthy" : c.dot === "caution" ? "Needs attention" : "Down"} />
                <div className="min-w-0 flex-1" title={c.title}>
                  <div className="text-[13.5px] font-semibold">{c.name}</div>
                  <div className="truncate text-xs text-muted-foreground" title={c.line}>
                    {c.line}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">{c.actions}</div>
              </div>
            ))}
            <PanelFooter>
              News (Finnhub) {p.services.news ? "on" : "off: set FINNHUB_API_KEY"} · Email {p.services.email ? "on" : "log only"} · Web search {p.services.webSearch ? "on" : "off"}
            </PanelFooter>
          </Panel>
          <JobsPanel {...p.jobs} />
        </div>
      </div>

      <Panel id="drive" className="scroll-mt-20">
        <PanelHeader title="Google Drive" aside={drive.connected ? `connected as ${drive.accountEmail}` : drive.configured ? "not connected" : "set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, DRIVE_TOKEN_KEY"} />
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="grid content-start gap-3 p-4 lg:border-r">
            <p className="text-[13.5px] text-ink-2">
              Hoot reads the Fund&rsquo;s document folder (initiating reports, earnings updates, models) and files analyst uploads into it. Permissions are read everything plus add new files only: the app never edits or deletes what you put there.
            </p>
            {canMutate && (
              <div className="flex flex-wrap items-center gap-2">
                <Button nativeButton={false} render={<a href="/api/google/connect" />} variant={drive.connected && !drive.needsReconnect ? "outline" : "default"} disabled={!drive.configured}>
                  {drive.connected ? "Reconnect Google" : "Connect Google Drive"}
                </Button>
                {drive.connected && (
                  <form action={disconnectDrive}>
                    <Button type="submit" variant="ghost" className="text-destructive">
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
                  <Button type="submit" variant="outline">
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Layout expected inside it: one folder per sector team, then one folder per company named like &ldquo;American Express (AXP)&rdquo;.</p>
              </form>
            )}
          </div>
          <div className="grid content-start gap-3 p-4">
            {!drive.connected ? (
              <p className="text-[13.5px] text-muted-foreground">{drive.configured ? "Connect the Fund's Google account to start." : "Add the three Drive variables to the environment, redeploy, then connect."}</p>
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
          <div className="flex items-center justify-between gap-3 border-t bg-band-2 px-4 py-2.5">
            <span className="text-xs text-muted-foreground">
              With live updates on, Drive tells the app about changes as they happen; the morning sweep still does a full crawl and renews the channel. Reading files (summaries, search index) continues in the background a few at a time.
            </span>
            <div className="flex shrink-0 gap-2">
              <form action={renewDriveWatchNow}>
                <Button type="submit" variant="outline">
                  Renew live updates
                </Button>
              </form>
              <form action={ingestDriveNow}>
                <Button type="submit" variant="outline">
                  Read files now
                </Button>
              </form>
              <form action={syncDriveNow}>
                <Button type="submit" variant="outline">
                  Sync now
                </Button>
              </form>
            </div>
          </div>
        )}
      </Panel>

      <Diagnostics summary="Hoot's models, document search, recent job runs, external tools and the PT sheet read">
        <Panel>
          <PanelHeader title="Recent runs" aside={p.transparency ? "click a run for its step log" : "updates live while a job runs"} />
          <div className="overflow-x-auto">
            <JobRunsLive initial={p.runs} transparency={p.transparency} />
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel id="agent" className="scroll-mt-20">
            <PanelHeader title="Research agent" aside={p.services.agent ? `using ${p.agent.label ?? p.agent.id}` : "set OPENROUTER_API_KEY"} />
            <form action={setAgentModel} className="grid gap-2 p-4">
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
                  <Button type="submit" variant="outline">
                    Save
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Applies to the next chat turn, draft feedback, earnings extraction, research-log distillation, and earnings prep packs. All three are free OpenRouter models; a rate-limited model hands the request to the next one on the list.
              </p>
              <p className="text-xs text-muted-foreground">
                Changelog summaries are written by <span className="font-mono">{p.changelogModel}</span> (set with CHANGELOG_MODEL).
              </p>
            </form>
            <PanelFooter>
              Web search (Tavily): {p.services.webSearch ? "on; the agent has search_web and read_url." : "off; set TAVILY_API_KEY to give the agent search_web (read_url still opens a URL directly)."}
            </PanelFooter>
          </Panel>

          <Panel id="retrieval" className="scroll-mt-20">
            <PanelHeader title="Retrieval" aside={p.retrieval.configured ? `${p.retrieval.embedLabel ?? p.retrieval.embedId}${p.retrieval.embedDims ? `, ${p.retrieval.embedDims} dims` : ""}` : "embeddings off"} />
            <div className="grid gap-3 p-4">
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
                    <Button type="submit" variant="outline">
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
                    <Button type="submit" variant="outline">
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
              <form action={reembedNow} className="flex items-center justify-between gap-3 border-t bg-band-2 px-4 py-2.5">
                <span className="text-xs text-muted-foreground">
                  Search fuses vector and full-text hits, then reranks. Free OpenRouter models share one budget (20 requests/min, 50 or 1,000/day) with the chat model: a switch re-embeds a few documents per run and stops on a 429 until the next run.
                </span>
                <Button type="submit" variant="outline" className="shrink-0">
                  Re-embed now
                </Button>
              </form>
            )}
          </Panel>
        </div>

        <McpPanel mcp={p.mcp} canMutate={canMutate} />

        {drive.connected && (
          <Panel>
            <PanelHeader title="PT sheet read" />
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[13px] text-ink-2">The price target sheet is read separately from the Drive folder: allowed tabs only, never edited. See each tab exactly as Hoot reads it.</span>
              <Button nativeButton={false} render={<Link href="/admin/pt-sheet" prefetch={false} />} variant="outline" className="shrink-0">
                Test PT sheet read
              </Button>
            </div>
          </Panel>
        )}
      </Diagnostics>
    </div>
  );
}

const LINK = "rounded-full text-[12.5px] font-semibold whitespace-nowrap text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

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

function Banner({ tone, children }: { tone?: "good" | "caution"; children: React.ReactNode }) {
  return (
    <div role="status" className={cn("rounded-[10px] px-3.5 py-2 text-[13px]", tone === "good" ? "bg-good text-good-foreground" : tone === "caution" ? "bg-caution text-caution-foreground" : "bg-band text-ink-2")}>
      {children}
    </div>
  );
}

function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 border-t border-row text-[13px]">
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
    <Panel id="mcp" className="scroll-mt-20">
      <PanelHeader title="External tools (MCP servers)" count={servers.length || undefined} aside={servers.length ? `${servers.filter((m) => m.enabled).length} of ${servers.length} enabled` : "none registered"} />
      <div className={cn("grid", canMutate && "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
        <div className="min-w-0 overflow-x-auto">
          {servers.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground">
              No MCP servers yet. Register a remote server (Streamable HTTP) and its tools join the research agent under the prefix you choose. Auth tokens stay in environment variables; only the variable name is stored here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Server</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tools</TableHead>
                  {canMutate && <TableHead className="pr-4 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="pl-4 align-top">
                      <div className="font-medium">{m.name}</div>
                      <div className="max-w-[280px] truncate text-xs text-muted-foreground" title={m.url}>
                        {m.url}
                      </div>
                      {m.authEnv && <div className="text-xs text-muted-foreground">auth from {m.authEnv}</div>}
                    </TableCell>
                    <TableCell className="align-top font-mono text-xs">{m.toolPrefix}_</TableCell>
                    <TableCell className="align-top text-xs">
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
                    <TableCell className="max-w-[240px] align-top text-xs whitespace-normal text-muted-foreground">
                      {m.toolNames?.length ? m.toolNames.join(", ") : "—"}
                      {m.allowedTools?.length ? <div className="mt-1">allowed: {m.allowedTools.join(", ")}</div> : null}
                    </TableCell>
                    {canMutate && (
                      <TableCell className="pr-4 text-right align-top">
                        <div className="flex justify-end gap-1.5">
                          <form action={testMcpServerNow}>
                            <input type="hidden" name="id" value={m.id} />
                            <Button type="submit" size="sm" variant="outline">
                              Test
                            </Button>
                          </form>
                          <form action={toggleMcpServer}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="enabled" value={m.enabled ? "false" : "true"} />
                            <Button type="submit" size="sm" variant="outline">
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
                          <Label htmlFor={`mcp-cap-${m.id}`} className="text-xs font-normal text-muted-foreground">
                            Daily cap
                          </Label>
                          <Input id={`mcp-cap-${m.id}`} name="cap" inputMode="numeric" placeholder="none" defaultValue={budget[m.name]?.cap ?? ""} className="h-7 w-16 font-mono text-xs" />
                          <Button type="submit" size="sm" variant="outline">
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
          <form action={addMcpServer} className="grid content-start gap-2 border-t p-4 lg:border-t-0 lg:border-l">
            <div className="text-[13.5px] font-semibold">Add a server</div>
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
            <Button type="submit" variant="outline" className="justify-self-start">
              Add and test
            </Button>
            <p className="text-xs text-muted-foreground">Tools appear to the agent as prefix_toolname. The env var is read on this deployment and sent as a Bearer token; set it on Vercel before adding the server.</p>
          </form>
        )}
      </div>
    </Panel>
  );
}
