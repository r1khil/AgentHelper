import "server-only";
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { and, eq } from "drizzle-orm";
import type { ToolSet } from "ai";
import { db } from "@/db/client";
import { mcpServers, type McpServer } from "@/db/schema";
import { sourceId, type Source } from "@/lib/providers/types";
import type { ToolResult } from "./tools";

/** A connected client is reused for this long before it is closed and reopened. */
const CLIENT_TTL_MS = 10 * 60_000;
const CONNECT_TIMEOUT_MS = 5000;
const CALL_TIMEOUT_MS = 30_000;

type Cached = { client: MCPClient; tools: ToolSet; instructions?: string; at: number; key: string };
const cache = new Map<string, Cached>();

/** The header value for a server comes from the environment; the database never holds it. */
export function authHeaders(server: Pick<McpServer, "authEnv">): Record<string, string> {
  if (!server.authEnv) return {};
  const v = process.env[server.authEnv];
  if (!v) throw new Error(`Environment variable ${server.authEnv} is not set on this deployment`);
  return { Authorization: /^(bearer|basic)\s/i.test(v) ? v : `Bearer ${v}` };
}

/** A tool name safe for the model: prefix_snake_case, no spaces or dots. */
export function prefixedName(prefix: string, name: string) {
  return `${prefix}_${name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

/** MCP content blocks as plain data for the model, and a text preview for the source card. */
export function flattenMcpResult(raw: unknown): { data: unknown; excerpt: string } {
  const r = raw as { content?: { type: string; text?: string; [k: string]: unknown }[]; structuredContent?: unknown; isError?: boolean } | undefined;
  if (!r || typeof r !== "object") return { data: raw, excerpt: "" };
  const texts = (r.content ?? []).filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text as string);
  const parsed = texts.map((t) => {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return t;
    }
  });
  const data = r.structuredContent ?? (parsed.length === 1 ? parsed[0] : parsed.length ? parsed : r.content);
  return { data, excerpt: texts.join("\n").replace(/\s+/g, " ").trim().slice(0, 360) };
}

/**
 * Wrap one MCP tool so it behaves like a native tool: the result becomes a ToolResult with a source
 * the answer can cite, and failures land in `error` instead of throwing.
 */
export function wrapMcpTool(server: Pick<McpServer, "name" | "url">, toolName: string, t: ToolSet[string]): ToolSet[string] {
  const exec = t.execute as ((input: unknown, opts: unknown) => Promise<unknown>) | undefined;
  if (!exec) return t;
  return {
    ...t,
    description: `${t.description ?? ""} (external tool from ${server.name}; cite its source id like any other)`.trim(),
    execute: async (input: unknown, opts: unknown): Promise<ToolResult<unknown>> => {
      const retrievedAt = new Date().toISOString();
      try {
        const raw = await Promise.race([exec(input, opts), new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${server.name}.${toolName} timed out after ${CALL_TIMEOUT_MS / 1000}s`)), CALL_TIMEOUT_MS))]);
        const { data, excerpt } = flattenMcpResult(raw);
        if ((raw as { isError?: boolean } | undefined)?.isError) return { data: null, sources: [], error: excerpt || `${server.name}.${toolName} returned an error` };
        const s: Source = {
          id: sourceId("mcp", `${server.name}:${toolName}:${JSON.stringify(input)}:${retrievedAt}`),
          title: `${server.name} · ${toolName}`,
          url: server.url,
          publisher: server.name,
          sourceType: "External tool",
          excerpt: excerpt || undefined,
          retrievedAt,
        };
        return { data: { ...(data && typeof data === "object" && !Array.isArray(data) ? (data as object) : { result: data }), sourceId: s.id }, sources: [s] };
      } catch (e) {
        return { data: null, sources: [], error: e instanceof Error ? e.message : String(e) };
      }
    },
  } as ToolSet[string];
}

async function connect(server: McpServer): Promise<Cached> {
  const key = `${server.id}:${server.url}:${server.authEnv ?? ""}:${(server.allowedTools ?? []).join(",")}:${server.toolPrefix}`;
  const hit = cache.get(server.id);
  if (hit && hit.key === key && Date.now() - hit.at < CLIENT_TTL_MS) return hit;
  if (hit) {
    cache.delete(server.id);
    hit.client.close().catch(() => {});
  }
  const client = await createMCPClient({
    transport: { type: "http", url: server.url, headers: authHeaders(server) },
    initializationOptions: { timeout: CONNECT_TIMEOUT_MS },
    clientName: "owls-nest-research-agent",
    onUncaughtError: (e) => console.error(`[mcp:${server.name}]`, e),
  });
  const all = (await client.tools()) as ToolSet;
  const allowed = server.allowedTools?.length ? new Set(server.allowedTools) : null;
  const tools: ToolSet = {};
  for (const [name, t] of Object.entries(all)) {
    if (allowed && !allowed.has(name)) continue;
    tools[prefixedName(server.toolPrefix, name)] = wrapMcpTool(server, name, t);
  }
  const entry: Cached = { client, tools, instructions: client.instructions, at: Date.now(), key };
  cache.set(server.id, entry);
  return entry;
}

export async function listMcpServers() {
  return db.select().from(mcpServers).orderBy(mcpServers.name);
}

export type McpToolBundle = { tools: ToolSet; instructions: string[]; servers: { name: string; toolCount: number }[]; failures: { name: string; error: string }[] };

/**
 * Tools from every enabled server, prefixed and wrapped. A server that cannot be reached is skipped
 * and its error recorded on the row so the Admin page shows it; the turn still runs with the rest.
 */
export async function loadMcpTools(): Promise<McpToolBundle> {
  const out: McpToolBundle = { tools: {}, instructions: [], servers: [], failures: [] };
  let servers: McpServer[] = [];
  try {
    servers = await db.select().from(mcpServers).where(and(eq(mcpServers.enabled, true)));
  } catch (e) {
    console.error("[mcp] could not list servers", e);
    return out;
  }
  await Promise.all(
    servers.map(async (server) => {
      try {
        const c = await connect(server);
        Object.assign(out.tools, c.tools);
        if (c.instructions) out.instructions.push(`${server.name}: ${c.instructions.slice(0, 1500)}`);
        out.servers.push({ name: server.name, toolCount: Object.keys(c.tools).length });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        out.failures.push({ name: server.name, error });
        db.update(mcpServers).set({ lastError: error.slice(0, 500), updatedAt: new Date() }).where(eq(mcpServers.id, server.id)).catch(() => {});
      }
    }),
  );
  return out;
}

/** Connect once from the Admin page, list tool names, and record the outcome on the row. */
export async function testMcpServer(id: string): Promise<{ ok: true; tools: string[]; instructions?: string } | { ok: false; error: string }> {
  const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1);
  if (!server) return { ok: false, error: "Server not found" };
  cache.get(server.id)?.client.close().catch(() => {});
  cache.delete(server.id);
  try {
    const c = await connect({ ...server, enabled: true });
    const names = Object.keys(c.tools);
    await db.update(mcpServers).set({ lastOkAt: new Date(), lastError: null, toolNames: names, updatedAt: new Date() }).where(eq(mcpServers.id, id));
    return { ok: true, tools: names, instructions: c.instructions };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.update(mcpServers).set({ lastError: error.slice(0, 500), updatedAt: new Date() }).where(eq(mcpServers.id, id));
    return { ok: false, error };
  }
}

/** Drop a cached client (after an admin edits or removes a server). */
export function forgetMcpClient(id: string) {
  const hit = cache.get(id);
  if (!hit) return;
  cache.delete(id);
  hit.client.close().catch(() => {});
}
