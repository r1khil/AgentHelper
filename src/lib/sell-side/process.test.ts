import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  part: {
    seq: 0,
    path: "calls/team/call/0.webm",
    mimeType: "audio/webm",
    offset: "0",
    duration: "30",
    segments: null as unknown,
    text: null as string | null,
    summary: null as string | null,
  },
  messages: [] as unknown[],
  chatStatus: "idle",
  callStatus: "transcribing",
  internalFailure: false,
  writes: [] as unknown[],
}));
vi.mock("@/db/client", () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.writes.push(values);
          if ("segments" in values || "summary" in values) Object.assign(state.part, values);
          if ("status" in values) state.callStatus = String(values.status);
        },
      }),
    }),
  },
}));
vi.mock("@/lib/storage", () => ({ downloadModelFile: vi.fn(async () => Buffer.from("fake encoded audio")) }));
vi.mock("./generate", () => ({
  generateStructured: vi.fn(async (args) => {
    if (!args.validate)
      return { keyPoints: ["Call says FY27 revenue is $3.2 billion; uncertain margins."], numbers: [], positives: [], risks: [], themes: [], questions: [] };
    const sourceId = JSON.parse(args.prompt).availableSources.find((s: { sourceType?: string }) => s.sourceType === "Call transcript").id;
    return args.validate({
      overview: { text: "Revenue outlook; margins uncertain.", sourceIds: [sourceId] },
      keyPoints: [{ text: "FY27 revenue $3.2 billion.", sourceIds: [sourceId] }],
      numbers: [],
      positives: [],
      risks: [],
      themes: [],
      catalysts: [],
      questions: [],
      crossChecks: [
        {
          claim: "Revenue outlook",
          assessment: "Not retrieved",
          evidence: "No comparable-period internal evidence",
          followUp: "Obtain FY27 model",
          callSourceIds: [sourceId],
          internalSourceIds: [],
        },
      ],
      coverage: "Limited internal evidence; fiscal periods differ.",
    });
  }),
}));
vi.mock("./store", () => ({
  callParts: vi.fn(async () => [state.part]),
  getCall: vi.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    teamId: "team",
    chatId: "chat",
    ticker: "ABC",
    title: "Broker interview",
    expectedParts: 1,
    createdAt: "2026-09-20",
  })),
}));
const tools = vi.hoisted(() => ({ find: vi.fn(), search: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/agent/tools", () => ({
  makeTools: () => ({ find_documents: { execute: tools.find }, search_documents: { execute: tools.search }, read_document: { execute: tools.read } }),
}));
vi.mock("@/lib/chats", () => ({
  getChat: vi.fn(async () => ({ id: "chat", teamId: "team", runStatus: state.chatStatus })),
  loadMessages: vi.fn(async () => state.messages),
  saveMessages: vi.fn(async (_id, messages) => {
    state.messages = messages;
  }),
  setRunStatus: vi.fn(async (_id, status) => {
    state.chatStatus = status;
  }),
}));
import { processPart, analyzeCall } from "./process";
import type { UIMessage } from "ai";
import { generateStructured } from "./generate";
import { downloadModelFile } from "@/lib/storage";
import { collectSources } from "@/lib/agent/citations";

beforeEach(() => {
  vi.clearAllMocks();
  state.part = { seq: 0, path: "calls/team/call/0.webm", mimeType: "audio/webm", offset: "0", duration: "30", segments: null, text: null, summary: null };
  state.messages = [];
  state.chatStatus = "idle";
  state.callStatus = "transcribing";
  state.writes = [];
  vi.stubEnv("OPENROUTER_API_KEY", "test-only");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      expect(url).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("qwen/qwen3-asr-0.6b");
      expect(body.response_format).toBe("verbose_json");
      expect(body.input_audio.format).toBe("webm");
      expect(typeof body.input_audio.data).toBe("string");
      return Response.json({
        text: "FY27 revenue is $3.2 billion. What about margin uncertainty?",
        segments: [
          { id: 0, seek: 0, start: 1, end: 5, text: "FY27 revenue is $3.2 billion.", tokens: [1, 2] },
          { id: 1, seek: 5, start: 6, end: 12, text: "What about margin uncertainty?", tokens: [3, 4] },
        ],
      });
    }),
  );
  tools.find.mockResolvedValue({ data: { documents: [{ documentId: "internal1" }] }, sources: [] });
  tools.search.mockResolvedValue({ data: null, sources: [], error: "Embeddings unavailable" });
  tools.read.mockResolvedValue({
    data: { text: "Our FY26 model has revenue of $2.8 billion." },
    sources: [{ id: "drive-1", documentId: "internal1", title: "ABC model", publisher: "Analyst Drive", retrievedAt: "2026-09-20" }],
  });
});
describe("call processing integration with existing agent pipeline", () => {
  it("transcribes, persists, summarizes, automatically retrieves company files, and preserves both citation types", async () => {
    await processPart("call");
    await processPart("call");
    expect(state.part.text).toContain("[00:00:06–00:00:12] What about margin uncertainty?");
    expect(state.part.summary).toContain("$3.2 billion");
    await analyzeCall("call", { id: "user", fullName: "Analyst", role: "associate_analyst" });
    expect(tools.find).toHaveBeenCalledWith({ ticker: "ABC", kind: "drive", limit: 10 }, expect.anything());
    expect(tools.read).toHaveBeenCalledWith({ documentId: "internal1", offset: 0, maxChars: 6000 }, expect.anything());
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(state.callStatus).toBe("ready");
    const sources = [...collectSources(state.messages as UIMessage[]).values()];
    expect(sources.map((s) => s.documentId)).toEqual(expect.arrayContaining(["internal1", "call-11111111-1111-4111-8111-111111111111"]));
    expect(JSON.stringify(state.messages)).toContain("Embeddings unavailable");
    expect(JSON.stringify(state.messages)).toContain("Supports / Contradicts / Not covered / Not retrieved");
  });
  it("saves transcription before summary failure and reuses it on retry", async () => {
    await processPart("call");
    vi.mocked(generateStructured).mockRejectedValueOnce(new Error("Model offline"));
    await expect(processPart("call")).rejects.toThrow("Model offline");
    expect(state.part.text).toContain("$3.2 billion");
    expect(state.part.summary).toBeNull();
    await processPart("call");
    expect(fetch).toHaveBeenCalledOnce();
    expect(downloadModelFile).toHaveBeenCalledOnce();
    await processPart("call");
    expect(generateStructured).toHaveBeenCalledTimes(2);
  });
  it("blocks partial recordings before any retrieval or generation", async () => {
    await expect(analyzeCall("call", { id: "user", fullName: "Analyst", role: "admin" })).rejects.toThrow("missing or unprocessed");
    expect(tools.find).not.toHaveBeenCalled();
    expect(generateStructured).not.toHaveBeenCalled();
  });
  it("retains explicit evidence failures when internal files are unavailable", async () => {
    await processPart("call");
    await processPart("call");
    tools.find.mockResolvedValue({ data: null, sources: [], error: "Drive not connected" });
    await analyzeCall("call", { id: "user", fullName: "Analyst", role: "admin" });
    expect(JSON.stringify(state.messages)).toContain("Drive not connected");
    expect(tools.read).not.toHaveBeenCalled();
  });
  it("does not claim success if structured synthesis fails", async () => {
    await processPart("call");
    await processPart("call");
    vi.mocked(generateStructured).mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(analyzeCall("call", { id: "user", fullName: "Analyst", role: "admin" })).rejects.toThrow("Provider unavailable");
    expect(state.chatStatus).toBe("error");
    expect(state.callStatus).not.toBe("ready");
    await analyzeCall("call", { id: "user", fullName: "Analyst", role: "admin" });
    expect(state.callStatus).toBe("ready");
    expect(tools.find).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    const count = state.messages.length;
    await analyzeCall("call", { id: "user", fullName: "Analyst", role: "admin" });
    expect(state.messages).toHaveLength(count);
  });
});
