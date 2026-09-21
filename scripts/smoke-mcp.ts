// Register a temporary MCP server row, load its tools the way a turn does, call one, then clean up.
// Usage: npx tsx --conditions=react-server scripts/smoke-mcp.ts <server-url>
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mcpServers } from "@/db/schema";
import { loadMcpTools, testMcpServer } from "@/lib/agent/mcp";

async function main() {
  const url = process.argv[2];
  if (!url) throw new Error("Usage: smoke-mcp.ts <server-url>");
  const [row] = await db.insert(mcpServers).values({ name: `smoke ${Date.now()}`, url, toolPrefix: "smoke" }).returning();
  try {
    console.log("test:", JSON.stringify(await testMcpServer(row.id)));
    const bundle = await loadMcpTools();
    console.log("servers:", JSON.stringify(bundle.servers), "failures:", JSON.stringify(bundle.failures));
    console.log("instructions:", bundle.instructions);
    const names = Object.keys(bundle.tools);
    console.log("tools:", names);
    const first = names[0];
    if (first) {
      const r = await (bundle.tools[first].execute as (i: unknown, o: unknown) => Promise<unknown>)({ ticker: "AXP" }, { toolCallId: "x" });
      console.log("call result:", JSON.stringify(r).slice(0, 400));
    }
  } finally {
    await db.delete(mcpServers).where(eq(mcpServers.id, row.id));
    console.log("cleaned up");
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
