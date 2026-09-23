import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ claim: true, sets: [] as Record<string, unknown>[], after: [] as (() => Promise<void>)[] }));
vi.mock("next/server", () => ({
  after: (fn: () => Promise<void>) => {
    mocks.after.push(fn);
  },
}));
vi.mock("@/db/client", () => ({
  db: {
    update: () => ({
      set: (v: Record<string, unknown>) => {
        mocks.sets.push(v);
        return { where: () => ({ returning: async () => (mocks.claim ? [{}] : []) }) };
      },
    }),
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(), canAccessTeam: vi.fn() }));
vi.mock("@/lib/agent/model", () => ({ agentConfigured: vi.fn(() => true) }));
vi.mock("@/lib/storage", () => ({ signModelUpload: vi.fn(async (path: string) => ({ path, token: "signed" })) }));
vi.mock("@/lib/sell-side/store", () => ({ getCall: vi.fn(), callParts: vi.fn() }));
vi.mock("@/lib/sell-side/process", () => ({ analyzeCall: vi.fn(), processPart: vi.fn() }));
import { getCurrentUser, canAccessTeam } from "@/lib/auth";
import { signModelUpload } from "@/lib/storage";
import { getCall, callParts } from "@/lib/sell-side/store";
import { analyzeCall, processPart } from "@/lib/sell-side/process";
import { ANALYSIS_ERROR } from "@/lib/sell-side/status";
import { POST, GET } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ callId: id }) };
const post = (body: unknown) => POST(new Request(`http://localhost/api/sell-side/${id}`, { method: "POST", body: JSON.stringify(body) }), ctx);
const part = { seq: 0, segments: [], summary: "Call notes" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.claim = true;
  mocks.sets = [];
  mocks.after = [];
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user", fullName: "Analyst", role: "admin" } as never);
  vi.mocked(canAccessTeam).mockReturnValue(true);
  vi.mocked(getCall).mockResolvedValue({ id, teamId: "team", status: "recording", expectedParts: null } as never);
  vi.mocked(callParts).mockResolvedValue([part] as never);
});
describe("recording API access and recovery", () => {
  it("rejects signed-out reads and mutations", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await post({ action: "analyze" })).status).toBe(401);
    expect((await GET(new Request("http://localhost"), ctx)).status).toBe(401);
    expect(getCall).not.toHaveBeenCalled();
  });
  it("rejects other-team calls before audio or processing access", async () => {
    vi.mocked(canAccessTeam).mockReturnValue(false);
    expect((await post({ action: "upload", seq: 0, mimeType: "audio/webm", offset: 0, duration: 120 })).status).toBe(404);
    expect((await GET(new Request("http://localhost"), ctx)).status).toBe(404);
    expect(signModelUpload).not.toHaveBeenCalled();
    expect(callParts).not.toHaveBeenCalled();
  });
  it("signs only a server-derived path inside the authorized call", async () => {
    const res = await post({ action: "upload", seq: 0, mimeType: "audio/webm", offset: 0, duration: 120, path: "another-team/secret" });
    expect(res.status).toBe(200);
    expect(signModelUpload).toHaveBeenCalledWith(`calls/team/${id}/0.webm`);
  });
  it.each([
    { action: "upload", seq: 120, mimeType: "audio/webm", offset: 0, duration: 120 },
    { action: "upload", seq: -1, mimeType: "audio/webm", offset: 0, duration: 120 },
    { action: "process", expectedParts: 0 },
  ])("rejects invalid input %j", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(signModelUpload).not.toHaveBeenCalled();
  });
  it("refuses to mutate a finalized recording", async () => {
    vi.mocked(getCall).mockResolvedValue({ id, teamId: "team", status: "ready", expectedParts: 1 } as never);
    expect((await post({ action: "upload", seq: 0, mimeType: "audio/webm", offset: 0, duration: 120 })).status).toBe(409);
  });
  it("allows only one concurrent processor", async () => {
    mocks.claim = false;
    expect((await post({ action: "process", expectedParts: 1 })).status).toBe(409);
    expect(processPart).not.toHaveBeenCalled();
  });
  it("reports a missing part without processing or claiming success", async () => {
    expect((await post({ action: "process", expectedParts: 2 })).status).toBe(502);
    expect(processPart).not.toHaveBeenCalled();
    expect(mocks.sets).toContainEqual(expect.objectContaining({ lease: null, status: "error" }));
  });
  it("processes one part then reports durable progress", async () => {
    const res = await post({ action: "process", expectedParts: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ completed: 1, total: 1, done: true });
    expect(processPart).toHaveBeenCalledWith(id);
  });
  it("runs analysis after the response and saves a retryable error", async () => {
    vi.mocked(getCall).mockResolvedValue({ id, teamId: "team", status: "transcribing", expectedParts: 1 } as never);
    vi.mocked(analyzeCall).mockRejectedValue(new Error("Model outage"));
    expect((await post({ action: "analyze" })).status).toBe(202);
    expect(analyzeCall).not.toHaveBeenCalled();
    await mocks.after[0]();
    expect(mocks.sets).toContainEqual(expect.objectContaining({ lease: null, status: "error", error: ANALYSIS_ERROR }));
  });
});
