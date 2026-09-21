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

import { authHeaders, flattenMcpResult, loadMcpTools, prefixedName, wrapMcpTool } from "./mcp";

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
    expect(b.servers).toEqual([{ name: "EDGAR MCP", toolCount: 1 }]);
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
