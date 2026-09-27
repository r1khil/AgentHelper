import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/sell-side/store", () => ({ getCall: vi.fn(), callParts: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(), canOpenChat: vi.fn() }));
vi.mock("@/lib/chats", () => ({ getChat: vi.fn(), loadMessages: vi.fn(), effectiveRunStatus: vi.fn() }));
vi.mock("@/lib/drive/index", () => ({ getFileText: vi.fn() }));
vi.mock("@/lib/documents/index", () => ({ getDocument: vi.fn() }));
import { getCurrentUser, canOpenChat } from "@/lib/auth";
import { effectiveRunStatus, getChat, loadMessages } from "@/lib/chats";
import { getDocument } from "@/lib/documents/index";
import { getFileText } from "@/lib/drive/index";
import { GET } from "./route";

const chatId = "11111111-1111-4111-8111-111111111111";
const request = (id = "file_123") => GET(new Request(`http://localhost/api/sources/${id}?chatId=${chatId}`), { params: Promise.resolve({ documentId: id }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user" } as never);
  vi.mocked(canOpenChat).mockReturnValue(true);
  vi.mocked(getChat).mockResolvedValue({ id: chatId, teamId: "team" } as never);
  vi.mocked(loadMessages).mockResolvedValue([
    {
      id: "a",
      role: "assistant",
      parts: [{ type: "tool-read_document", state: "output-available", output: { sources: [{ id: "drive-1", documentId: "file_123", title: "Transcript" }] } }],
    },
  ] as never);
  vi.mocked(getDocument).mockResolvedValue({ id: "file_123", kind: "drive", title: "Transcript", url: "https://drive.google.com/file/d/file_123/view", version: "v1", textFor: "v1", text: "cached" } as never);
  vi.mocked(getFileText).mockResolvedValue({ text: "Opening remarks. Revenue grew 8%. Questions.", meta: {} } as never);
});

describe("source document endpoint", () => {
  it("waits for an in-flight turn to persist instead of incorrectly declaring the source unavailable", async () => {
    vi.mocked(loadMessages).mockResolvedValue([]);
    vi.mocked(effectiveRunStatus).mockReturnValue("running");
    const res = await request();
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ pending: true });
    expect(getFileText).not.toHaveBeenCalled();
  });
  it("opens the exact retrieved internal document and never redirects", async () => {
    const res = await request();
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toMatchObject({ title: "Transcript", text: "Opening remarks. Revenue grew 8%. Questions.", url: "https://drive.google.com/file/d/file_123/view" });
    expect(getFileText).toHaveBeenCalledWith("file_123");
  });
  it("preserves the document and original link when extraction is unavailable", async () => {
    vi.mocked(getFileText).mockRejectedValue(new Error("Extraction failed"));
    const res = await request();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: "Transcript", text: null, url: "https://drive.google.com/file/d/file_123/view" });
  });
  it("serves an indexed SEC filing from the corpus with its sec.gov link", async () => {
    const id = "6f2b7a1e-1111-4111-8111-222222222222";
    vi.mocked(loadMessages).mockResolvedValue([{ id: "a", role: "assistant", parts: [{ type: "tool-search_documents", state: "output-available", output: { sources: [{ id: "doc-1", documentId: id, title: "10-K" }] } }] }] as never);
    vi.mocked(getDocument).mockResolvedValue({ id, kind: "filing", title: "AXP 10-K filed 2026-02-10", url: "https://www.sec.gov/Archives/edgar/data/4962/x.htm", version: "acc", textFor: "acc", text: "## Item 1A\n\nRisks." } as never);
    const res = await request(id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: "AXP 10-K filed 2026-02-10", text: "## Item 1A\n\nRisks.", url: "https://www.sec.gov/Archives/edgar/data/4962/x.htm" });
    expect(getFileText).not.toHaveBeenCalled();
  });
  it("returns unavailable for a removed document", async () => {
    vi.mocked(getDocument).mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(getFileText).not.toHaveBeenCalled();
  });
  it("requires authentication without returning chat HTML", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(getFileText).not.toHaveBeenCalled();
  });
  it.each(["other-team", "unretrieved"])("rejects %s document access", async (scenario) => {
    if (scenario === "other-team") vi.mocked(canOpenChat).mockReturnValue(false);
    else vi.mocked(loadMessages).mockResolvedValue([]);
    expect((await request()).status).toBe(404);
    expect(getDocument).not.toHaveBeenCalled();
    expect(getFileText).not.toHaveBeenCalled();
  });
  it("returns a graceful unavailable response for database failures", async () => {
    vi.mocked(getChat).mockRejectedValue(new Error("Database down"));
    const res = await request();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Source temporarily unavailable." });
  });
});

import { getCall, callParts } from "@/lib/sell-side/store";
describe("call transcript source viewer", () => {
  const callId = "22222222-2222-4222-8222-222222222222";
  const fileId = `call-${callId}`;
  const open = () => request(fileId);
  it("opens saved transcript text through the existing authenticated citation endpoint", async () => {
    vi.mocked(loadMessages).mockResolvedValue([{ id: "a", role: "assistant", parts: [{ type: "tool-read_call_transcript", state: "output-available", output: { sources: [{ id: "call-1", documentId: fileId, title: "Call" }] } }] }] as never);
    vi.mocked(getCall).mockResolvedValue({ id: callId, teamId: "team", title: "Broker call" } as never);
    vi.mocked(callParts).mockResolvedValue([{ text: "[00:00:01–00:00:04] Revenue grew 8%." }] as never);
    const res = await open();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: "Broker call", text: "[00:00:01–00:00:04] Revenue grew 8%.", url: null });
    expect(getDocument).not.toHaveBeenCalled();
    vi.mocked(getCall).mockResolvedValue({ teamId: "another-team" } as never);
    expect((await open()).status).toBe(404);
  });
});
