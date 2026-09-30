import { describe, expect, it } from "vitest";
import type { DriveStatus } from "@/lib/drive/index";
import { attentionCount, connectionRows, jobResult, type JobLastRun } from "./status";

const run = (over: Partial<JobLastRun> = {}): JobLastRun => ({ startedAt: "2026-09-25T20:20:00Z", finishedAt: "2026-09-25T20:21:00Z", ok: true, summary: {}, ...over });
const drive = (over: Partial<DriveStatus> = {}): DriveStatus => ({ configured: true, connected: true, needsReconnect: false, rootFolderId: "r", rootFolderName: "Owl Fund", fileCount: 10, matchedCount: 9, watch: { active: true, expiration: new Date("2026-10-01T00:00:00Z"), error: null, lastChangeSyncAt: null }, ...over }) as DriveStatus;
const input = (over: object = {}) => ({
  drive: drive(),
  driveUnmatched: [] as string[],
  filings: { lastSync: "2026-09-28", lastRun: { ok: true, at: "2026-09-28T14:00:00Z", finishedAt: "2026-09-28T14:00:07Z" } },
  services: { agent: true, news: true, email: true, webSearch: true },
  retrieval: { configured: true, stats: { documents: 5, embeddedWithModel: 5 } },
  mcp: { total: 2, enabled: 2, failing: 0, names: ["FRED", "Wikipedia"] },
  ...over,
});

describe("jobResult", () => {
  it("says what the last run did, and asks for a look at a failure", () => {
    expect(jobResult("prices", run({ summary: { updated: ["THC", "KRE"] } }))).toEqual({ text: "Fri, Sep 25, 4:20 PM ET · 2 holdings", attention: false });
    expect(jobResult("prices", run({ ok: false }))).toMatchObject({ text: "Fri, Sep 25, 4:20 PM ET · failed", attention: true });
    expect(jobResult("weekly", run({ summary: { email: { status: "held" } } }))).toMatchObject({ text: expect.stringContaining("built, not sent"), attention: true });
    expect(jobResult("weekly", run({ summary: { email: { status: "sent" } } })).attention).toBe(false);
  });
  it("is not a failure to have not run, or to run with the sweep", () => {
    expect(jobResult("prices", null)).toEqual({ text: "No runs yet", attention: false });
    expect(jobResult("prep", null)).toEqual({ text: "Runs with the morning sweep", attention: false });
    expect(jobResult("prices", run({ finishedAt: null }), Date.parse("2026-09-25T20:25:00Z"))).toEqual({ text: "Running since Fri, Sep 25, 4:20 PM ET", attention: false });
  });
  it("reads a run that never finished as timed out, not running all day", () => {
    expect(jobResult("morning", run({ finishedAt: null, ok: null }), Date.parse("2026-09-25T22:30:00Z"))).toEqual({ text: "Fri, Sep 25, 4:20 PM ET · didn't finish (timed out)", attention: true });
  });
});

describe("connectionRows and attentionCount", () => {
  it("has nothing to check when every service is up", () => {
    const rows = connectionRows(input());
    expect(rows.every((r) => !r.attention)).toBe(true);
    expect(attentionCount({}, rows)).toBe(0);
  });
  it("counts a Drive that needs reconnecting, and a failed job", () => {
    const rows = connectionRows(input({ drive: drive({ needsReconnect: true }) }));
    expect(rows[0]).toMatchObject({ key: "drive", line: "Reconnect needed", attention: true });
    expect(attentionCount({ weekly: run({ ok: false }), prices: run() }, rows)).toBe(2);
  });
  it("says how far the filings index is complete and how the last run ended", () => {
    const now = Date.parse("2026-09-29T22:30:00Z");
    const ok = connectionRows(input(), now).find((r) => r.key === "filings")!;
    expect(ok.line).toContain("complete through");
    expect(ok.line).toContain(", ok");
    expect(ok.attention).toBe(false);
    const dead = connectionRows(input({ filings: { lastSync: "2026-09-28", lastRun: { ok: null, at: "2026-09-29T14:30:07Z", finishedAt: null } } }), now).find((r) => r.key === "filings")!;
    expect(dead.line).toMatch(/didn't finish$/);
    expect(dead.attention).toBe(true);
    const never = connectionRows(input({ filings: { lastSync: null, lastRun: null } }), now).find((r) => r.key === "filings")!;
    expect(never.line).toContain("no complete sync yet");
    expect(never.line).not.toContain("last run");
  });
  it("counts folders with no holding, a failing tool server and email that is not set up", () => {
    const rows = connectionRows(input({ driveUnmatched: ["Acme"], mcp: { total: 1, enabled: 1, failing: 1, names: ["FRED"] }, services: { agent: true, news: true, email: false, webSearch: true } }));
    expect(rows.filter((r) => r.attention).map((r) => r.key)).toEqual(["drive-unmatched", "email", "mcp"]);
  });
});
