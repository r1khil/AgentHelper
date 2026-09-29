import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const dbState: { servers: unknown[]; updates: unknown[] } = { servers: [], updates: [] };
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => dbState.servers, orderBy: async () => dbState.servers }) }),
    update: () => ({ set: (v: unknown) => ({ where: async () => dbState.updates.push(v) }) }),
  },
}));
const createMCPClient = vi.fn();
vi.mock("@ai-sdk/mcp", () => ({ createMCPClient: (...a: unknown[]) => createMCPClient(...a) }));
const claimMcpCall = vi.fn<(server: string) => Promise<{ ok: true } | { ok: false; cap: number }>>(async () => ({ ok: true }));
vi.mock("./mcp-budget", async (orig) => ({ ...(await orig<typeof import("./mcp-budget")>()), claimMcpCall: (s: string) => claimMcpCall(s) }));

import { authHeaders, flattenMcpResult, inbandError, loadMcpTools, prefixedName, wrapMcpTool } from "./mcp";

const server = { id: "s1", name: "EDGAR MCP", url: "https://mcp.example.com/mcp", authEnv: null, enabled: true, toolPrefix: "edgar", allowedTools: null, lastOkAt: null, lastError: null, toolNames: null, createdBy: null, createdAt: new Date(), updatedAt: new Date() };

describe("helpers", () => {
  it("builds bearer headers from the environment only", () => {
    expect(authHeaders({ authEnv: null })).toEqual({});
    process.env.TEST_MCP_TOKEN = "abc";
    expect(authHeaders({ authEnv: "TEST_MCP_TOKEN" })).toEqual({ Authorization: "Bearer abc" });
    process.env.TEST_MCP_TOKEN = "Basic xyz";
    expect(authHeaders({ authEnv: "TEST_MCP_TOKEN" })).toEqual({ Authorization: "Basic xyz" });
    expect(() => authHeaders({ authEnv: "MISSING_VAR_XYZ" })).toThrow(/not set/);
  });
  it("prefixes and sanitizes tool names", () => {
    expect(prefixedName("edgar", "get.filings v2")).toBe("edgar_get_filings_v2");
  });
  it("flattens text content, parsing JSON when it can", () => {
    expect(flattenMcpResult({ content: [{ type: "text", text: '{"a":1}' }] })).toEqual({ data: { a: 1 }, excerpt: '{"a":1}' });
    expect(flattenMcpResult({ content: [{ type: "text", text: "hello" }, { type: "text", text: "world" }] })).toEqual({ data: ["hello", "world"], excerpt: "hello world" });
    expect(flattenMcpResult({ structuredContent: { x: 2 }, content: [] }).data).toEqual({ x: 2 });
  });
});

describe("wrapMcpTool", () => {
  it("turns a result into a ToolResult with a citable source", async () => {
    const t = wrapMcpTool(server, "search", { description: "Search filings", execute: async () => ({ content: [{ type: "text", text: '{"hits":3}' }] }) } as never);
    const r = (await t.execute!({ q: "x" }, {} as never)) as { data: { hits: number; sourceId: string }; sources: { id: string; publisher: string; sourceType: string }[] };
    expect(r.data.hits).toBe(3);
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0].id.startsWith("mcp-")).toBe(true);
    expect(r.data.sourceId).toBe(r.sources[0].id);
    expect(r.sources[0].sourceType).toBe("External tool");
    expect(t.description).toContain("external tool from EDGAR MCP");
  });
  it("reports MCP errors and thrown errors in `error`", async () => {
    const bad = wrapMcpTool(server, "x", { execute: async () => ({ isError: true, content: [{ type: "text", text: "nope" }] }) } as never);
    expect(((await bad.execute!({}, {} as never)) as { error?: string }).error).toBe("nope");
    const thrown = wrapMcpTool(server, "x", { execute: async () => { throw new Error("boom"); } } as never);
    expect(((await thrown.execute!({}, {} as never)) as { error?: string }).error).toBe("boom");
  });
  it("treats an error reported as an ordinary result as an error, not a source", async () => {
    const limited = { error: { type: "rate_limit", message: "The demo API key is for demo purposes only.", detail: "Alpha Vantage rate limit reached." } };
    const t = wrapMcpTool(server, "GLOBAL_QUOTE", { execute: async () => ({ content: [{ type: "text", text: JSON.stringify(limited) }], structuredContent: limited }) } as never);
    const r = (await t.execute!({ symbol: "IBM" }, {} as never)) as { error?: string; sources: unknown[] };
    expect(r.error).toBe("EDGAR MCP.GLOBAL_QUOTE: The demo API key is for demo purposes only. Alpha Vantage rate limit reached.");
    expect(r.sources).toEqual([]);
  });
  it("returns the budget message without calling the server once the day's cap is used", async () => {
    const exec = vi.fn(async () => ({ content: [] }));
    claimMcpCall.mockResolvedValueOnce({ ok: false, cap: 20 });
    const t = wrapMcpTool({ ...server, name: "Alpha Vantage" }, "NEWS_SENTIMENT", { execute: exec } as never);
    const r = (await t.execute!({}, {} as never)) as { data: unknown; error?: string };
    expect(r).toEqual({ data: null, sources: [], error: "Daily budget for Alpha Vantage is used up (20 calls); try again tomorrow or use a native tool" });
    expect(exec).not.toHaveBeenCalled();
    expect(claimMcpCall).toHaveBeenLastCalledWith("Alpha Vantage");
  });
});

describe("inbandError", () => {
  it("recognises lone error payloads and leaves real data alone", () => {
    expect(inbandError({ error: "bad symbol" })).toBe("bad symbol");
    expect(inbandError({ Information: "Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day." })).toMatch(/25 requests per day/);
    expect(inbandError({ "Error Message": "Invalid API call." })).toBe("Invalid API call.");
    expect(inbandError({ error: null })).toBeNull();
    expect(inbandError({ error: "x", data: [1] })).toBeNull();
    expect(inbandError({ "Global Quote": { "05. price": "227.06" } })).toBeNull();
    expect(inbandError(["error"])).toBeNull();
    expect(inbandError("error")).toBeNull();
  });
});

describe("loadMcpTools", () => {
  beforeEach(() => {
    createMCPClient.mockReset();
    dbState.servers = [];
    dbState.updates = [];
  });
  it("prefixes tools, honours allowed_tools, and collects server instructions", async () => {
    dbState.servers = [{ ...server, allowedTools: ["search"] }];
    createMCPClient.mockResolvedValue({ instructions: "Use search first.", tools: async () => ({ search: { execute: async () => ({}) }, delete: { execute: async () => ({}) } }), close: async () => {} });
    const b = await loadMcpTools();
    expect(Object.keys(b.tools)).toEqual(["edgar_search"]);
    expect(b.instructions).toEqual(["EDGAR MCP: Use search first."]);
    expect(b.servers).toEqual([{ name: "EDGAR MCP", prefix: "edgar", toolCount: 1 }]);
    expect(createMCPClient.mock.calls[0][0]).toMatchObject({ transport: { type: "http", url: server.url } });
  });
  it("skips a server that fails to connect and records the error", async () => {
    dbState.servers = [{ ...server, id: "s2", name: "Broken" }];
    createMCPClient.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const b = await loadMcpTools();
    expect(b.tools).toEqual({});
    expect(b.failures).toEqual([{ name: "Broken", error: "connect ECONNREFUSED" }]);
    expect(dbState.updates[0]).toMatchObject({ lastError: "connect ECONNREFUSED" });
  });
});
