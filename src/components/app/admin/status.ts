import type { DriveStatus } from "@/lib/drive/index";
import { fmtDate, fmtDateTime } from "@/lib/format";

// What Admin says about each scheduled job and outside service, in words. Pure, so the page, the header's count
// and the tests agree: a failed job or a service that needs someone is amber ("needs attention"), everything else is grey.

/** `job_runs.job` names the Scheduled jobs and Connections rows show a last run for. */
export const TRACKED_JOBS = ["prices", "daily_brief", "morning", "weekly", "drive_sync", "filings_sync", "screen", "filing_changes"] as const;

/** A job's latest run, as the Scheduled jobs list shows it. */
export type JobLastRun = { startedAt: string; finishedAt: string | null; ok: boolean | null; summary: Record<string, unknown> };

export type JobKey = "prices" | "brief" | "morning" | "bellwethers" | "prep" | "weekly" | "screen" | "filing_changes";

/** A run with no finish after this long died with its function (jobs stop at 300s); it will never record an end. */
export const ABANDONED_AFTER_MS = 15 * 60_000;

/** Whether a run is still going: unfinished and young enough to be. An older unfinished run was killed. */
export const stillRunning = (r: Pick<JobLastRun, "startedAt" | "finishedAt">, now = Date.now()) => !r.finishedAt && now - Date.parse(r.startedAt) < ABANDONED_AFTER_MS;

/** The result of a job's last run in words, and whether it needs a look. */
export function jobResult(key: JobKey, r: JobLastRun | null | undefined, now = Date.now()): { text: string; attention: boolean } {
  if (!r) return { text: key === "bellwethers" || key === "prep" ? "Runs with the morning sweep" : "No runs yet", attention: false };
  // The screen runs in ten-minute pieces over an hour or more; its job row stays open until the last piece.
  if (key === "screen" && !r.finishedAt) return { text: `Running since ${fmtDateTime(r.startedAt)}, continues every 10 minutes`, attention: false };
  const when = fmtDateTime(r.startedAt);
  if (!r.finishedAt) return stillRunning(r, now) ? { text: `Running since ${when}`, attention: false } : { text: `${when} · didn't finish (timed out)`, attention: true };
  if (r.ok === false) return { text: `${when} · failed`, attention: true };
  const s = r.summary as { status?: string; updated?: unknown[]; email?: { status?: string } };
  if (s.status === "skipped") return { text: `${when} · skipped`, attention: false };
  if (key === "prices" && s.updated) return { text: `${when} · ${s.updated.length} holdings`, attention: false };
  if (key === "weekly") return s.email?.status === "sent" ? { text: `${when} · built and sent`, attention: false } : { text: `${when} · built, not sent`, attention: true };
  return { text: `${when} · ok`, attention: false };
}

export type ConnectionName = "drive" | "drive-unmatched" | "filings" | "hoot" | "search" | "email" | "news" | "web" | "mcp";

export type ConnectionRow = { key: ConnectionName; name: string; line: string; attention: boolean; title?: string };

export type ConnectionInput = {
  drive: DriveStatus;
  driveUnmatched: string[];
  filings: { lastSync: string | null; lastRun: { ok: boolean | null; at: string; finishedAt: string | null } | null };
  services: { agent: boolean; news: boolean; email: boolean; webSearch: boolean };
  retrieval: { configured: boolean; stats: { documents: number; embeddedWithModel: number } | null };
  mcp: { total: number; enabled: number; failing: number; names: string[] };
};

/** Every outside service, with what is true of it and whether that needs a look. */
export function connectionRows(p: ConnectionInput, now = Date.now()): ConnectionRow[] {
  const { drive } = p;
  const filingsRun = p.filings.lastRun;
  const filingsRunState = !filingsRun
    ? null
    : filingsRun.ok === false
      ? "failed"
      : filingsRun.finishedAt
        ? "ok"
        : stillRunning({ startedAt: filingsRun.at, finishedAt: null }, now)
          ? "running"
          : "didn't finish";
  const ingestPending = drive.ingest?.pending ?? 0;
  const embeddedAll = p.retrieval.stats ? p.retrieval.stats.embeddedWithModel >= p.retrieval.stats.documents : true;
  const driveLine = !drive.configured
    ? "Not set up on this deployment"
    : !drive.connected
      ? "Not connected"
      : drive.needsReconnect
        ? "Reconnect needed"
        : [
            drive.rootFolderName ?? (drive.rootFolderId ? "Fund folder" : "Root folder not set"),
            `${drive.fileCount} files indexed`,
            drive.watch?.active ? `live updates until ${fmtDateTime(drive.watch.expiration)}` : "live updates off",
          ].join(" · ");
  const driveAttention = !drive.configured || !drive.connected || drive.needsReconnect || Boolean(drive.lastError) || Boolean(drive.watch && !drive.watch.active);
  return [
    { key: "drive", name: "Google Drive", line: driveLine, attention: driveAttention, title: drive.lastError ?? undefined },
    {
      key: "drive-unmatched",
      name: "Unmatched Drive folders",
      line: p.driveUnmatched.length
        ? `“${p.driveUnmatched[0]}”${p.driveUnmatched.length > 1 ? ` and ${p.driveUnmatched.length - 1} more` : ""} ${p.driveUnmatched.length > 1 ? "have" : "has"} no (TICKER) and no holding match`
        : "Every company folder matched a holding",
      attention: p.driveUnmatched.length > 0,
    },
    {
      key: "filings",
      name: "SEC filings index",
      // "Complete through" is the date every holding was last listed; a run that skipped some leaves it behind.
      line: `10-K, 10-Q, 8-K and EX-99.1 for every holding · ${p.filings.lastSync ? `complete through ${fmtDate(p.filings.lastSync) || p.filings.lastSync}` : "no complete sync yet"}${filingsRun ? ` · last run ${fmtDateTime(filingsRun.at)}, ${filingsRunState}` : ""}`,
      attention: filingsRunState === "failed" || filingsRunState === "didn't finish" || !p.filings.lastSync,
      title: "Also runs inside the morning sweep.",
    },
    { key: "hoot", name: "Hoot", line: p.services.agent ? `Ready · web search ${p.services.webSearch ? "on" : "off"}` : "Off: not set up on this deployment", attention: !p.services.agent },
    {
      key: "search",
      name: "Document search",
      line: !p.retrieval.configured
        ? "Off: not set up on this deployment"
        : ingestPending
          ? `${ingestPending} ${ingestPending === 1 ? "file" : "files"} waiting to be read`
          : p.retrieval.stats
            ? `${p.retrieval.stats.embeddedWithModel} of ${p.retrieval.stats.documents} documents searchable`
            : "Status unavailable",
      attention: !p.retrieval.configured || ingestPending > 0 || !embeddedAll,
    },
    { key: "email", name: "Email (OpenMail)", line: p.services.email ? "Connected · all fund email" : "Not set up: email is logged, not sent", attention: !p.services.email },
    { key: "news", name: "News (Finnhub)", line: p.services.news ? "Connected" : "Off: set FINNHUB_API_KEY", attention: !p.services.news },
    { key: "web", name: "Web search (Tavily)", line: p.services.webSearch ? "Connected" : "Off: set TAVILY_API_KEY", attention: !p.services.webSearch },
    {
      key: "mcp",
      name: "External tools (MCP)",
      line: p.mcp.total ? `${p.mcp.total} ${p.mcp.total === 1 ? "server" : "servers"} · ${p.mcp.names.slice(0, 3).join(", ")}${p.mcp.failing ? ` · ${p.mcp.failing} failing` : ""}` : "None registered",
      attention: p.mcp.failing > 0,
    },
  ];
}

/** How many scheduled jobs and services need a look: the count on the Jobs and connections tab. */
export function attentionCount(last: Record<string, JobLastRun | null>, connections: ConnectionRow[]): number {
  const jobs: [JobKey, string][] = [["prices", "prices"], ["brief", "daily_brief"], ["morning", "morning"], ["weekly", "weekly"]];
  const failing = jobs.filter(([key, run]) => jobResult(key, last[run]).attention).length;
  return failing + connections.filter((c) => c.attention).length;
}
