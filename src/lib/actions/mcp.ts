"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { mcpServers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { forgetMcpClient, testMcpServer } from "@/lib/agent/mcp";
import { mcpCapKey } from "@/lib/agent/mcp-budget";
import { setSetting } from "@/lib/settings";

function back(message?: string, ok = false): never {
  const q = message ? `&${ok ? "ok" : "error"}=${encodeURIComponent(message)}` : "";
  redirect(`/admin?tab=jobs${q}#mcp`);
}

const serverSchema = z.object({
  name: z.string().trim().min(2).max(60),
  url: z.string().trim().url().refine((u) => u.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)/.test(u), "Use an https:// URL"),
  authEnv: z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/, "Environment variable names are UPPER_SNAKE_CASE").optional().or(z.literal("")),
  toolPrefix: z.string().trim().regex(/^[a-z][a-z0-9]{1,15}$/, "Prefix: 2 to 16 lowercase letters or digits").optional().or(z.literal("")),
  allowedTools: z.string().trim().optional(),
});

/** A default prefix from the name: "EDGAR MCP" → "edgarmcp". */
function prefixFrom(name: string) {
  const p = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  return /^[a-z]/.test(p) && p.length >= 2 ? p : "ext";
}

export async function addMcpServer(fd: FormData) {
  const me = await requireAdmin();
  const parsed = serverSchema.safeParse({ name: fd.get("name"), url: fd.get("url"), authEnv: fd.get("authEnv") ?? "", toolPrefix: fd.get("toolPrefix") ?? "", allowedTools: fd.get("allowedTools") ?? "" });
  if (!parsed.success) back(parsed.error.issues[0]?.message ?? "Check the server details");
  const v = parsed.data;
  const allowed = (v.allowedTools ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  try {
    const [row] = await db
      .insert(mcpServers)
      .values({ name: v.name, url: v.url, authEnv: v.authEnv || null, toolPrefix: v.toolPrefix || prefixFrom(v.name), allowedTools: allowed.length ? allowed : null, createdBy: me.id })
      .returning({ id: mcpServers.id });
    const test = await testMcpServer(row.id);
    revalidatePath("/admin");
    back(test.ok ? `Added ${v.name} with ${test.tools.length} tool${test.tools.length === 1 ? "" : "s"}` : `Added ${v.name}, but the connection test failed: ${test.error}`, test.ok);
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) back("A server with that name already exists");
    throw e;
  }
}

export async function removeMcpServer(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const [row] = await db.delete(mcpServers).where(eq(mcpServers.id, id)).returning({ name: mcpServers.name });
  forgetMcpClient(id);
  revalidatePath("/admin");
  back(row ? `Removed ${row.name}` : "Server not found", !!row);
}

export async function toggleMcpServer(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const enabled = String(fd.get("enabled") ?? "") === "true";
  const [row] = await db.update(mcpServers).set({ enabled, updatedAt: new Date() }).where(eq(mcpServers.id, id)).returning({ name: mcpServers.name });
  forgetMcpClient(id);
  revalidatePath("/admin");
  back(row ? `${row.name} ${enabled ? "enabled" : "disabled"}` : "Server not found", !!row);
}

export async function testMcpServerNow(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const r = await testMcpServer(id);
  revalidatePath("/admin");
  back(r.ok ? `Connected: ${r.tools.length} tool${r.tools.length === 1 ? "" : "s"}${r.tools.length ? ` (${r.tools.slice(0, 6).join(", ")}${r.tools.length > 6 ? ", …" : ""})` : ""}` : `Connection failed: ${r.error}`, r.ok);
}

/** Calls per UTC day before the server's tools answer with a budget message instead; blank removes the cap. */
export async function setMcpDailyCap(fd: FormData) {
  const me = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const raw = String(fd.get("cap") ?? "").trim();
  if (raw && !/^\d{1,6}$/.test(raw)) back("The daily cap is a whole number of calls, or blank for no cap");
  const [row] = await db.select({ name: mcpServers.name }).from(mcpServers).where(eq(mcpServers.id, id)).limit(1);
  if (!row) back("Server not found");
  await setSetting(mcpCapKey(row.name), raw ? String(Number(raw)) : "", me.id);
  revalidatePath("/admin");
  back(raw ? `${row.name}: at most ${Number(raw)} call${Number(raw) === 1 ? "" : "s"} a day` : `${row.name}: no daily cap`, true);
}
