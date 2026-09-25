// Register (or update) Alpha Vantage's remote MCP server for the research agent, and set its daily call cap.
// This writes to whatever DATABASE_URL points at, so it refuses to run without --yes.
// Usage: ENV_FILE=<path to .env.local> npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/register-alphavantage.ts --yes [--cap=20] [--test]
//   --cap=N   calls per UTC day before the tools answer with a budget message (default 20; the free key allows 25)
//   --test    connect once afterwards and record the tool list (needs ALPHAVANTAGE_API_KEY in the env file; lists tools only, no quota used)
import { existsSync } from "node:fs";
import { db } from "@/db/client";
import { mcpServers } from "@/db/schema";
import { testMcpServer } from "@/lib/agent/mcp";
import { mcpCapKey } from "@/lib/agent/mcp-budget";
import { setSetting } from "@/lib/settings";

const envFile = process.env.ENV_FILE ?? ".env.local";
if (existsSync(envFile)) process.loadEnvFile(envFile);

const ALPHA_VANTAGE = {
  name: "Alpha Vantage",
  url: "https://mcp.alphavantage.co/mcp",
  // Sent as `Authorization: Bearer <key>`; the server treats it exactly like the deprecated ?apikey= query.
  authEnv: "ALPHAVANTAGE_API_KEY",
  toolPrefix: "av",
  // News with sentiment scores, congressional trades, spot FX, and the free daily/weekly/monthly commodity
  // series. Technical indicators stay out on purpose (computed locally from get_price_history), as do the
  // meta tools TOOL_CALL/TOOL_GET/TOOL_LIST: TOOL_CALL would reach every tool and bypass this list.
  allowedTools: ["NEWS_SENTIMENT", "CONGRESS_TRADES", "CURRENCY_EXCHANGE_RATE", "WTI", "BRENT", "NATURAL_GAS", "COPPER"],
};

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--yes")) {
    console.error("This writes the mcp_servers row and app_settings cap to the database in DATABASE_URL. Re-run with --yes to proceed.");
    process.exit(2);
  }
  const capArg = args.find((a) => a.startsWith("--cap="))?.slice(6) ?? "20";
  if (!/^\d{1,6}$/.test(capArg)) throw new Error("--cap must be a whole number");
  const cap = Number(capArg);

  const v = ALPHA_VANTAGE;
  const [row] = await db
    .insert(mcpServers)
    .values({ name: v.name, url: v.url, authEnv: v.authEnv, toolPrefix: v.toolPrefix, allowedTools: v.allowedTools, enabled: true })
    .onConflictDoUpdate({ target: mcpServers.name, set: { url: v.url, authEnv: v.authEnv, toolPrefix: v.toolPrefix, allowedTools: v.allowedTools, enabled: true, updatedAt: new Date() } })
    .returning({ id: mcpServers.id });
  await setSetting(mcpCapKey(v.name), String(cap), null);
  console.log(`Registered ${v.name} (${row.id}) with ${v.allowedTools.length} allowed tools and a cap of ${cap} calls per UTC day.`);
  if (!process.env[v.authEnv]) console.warn(`${v.authEnv} is not set here. Set it on Vercel (Production) before the agent can use these tools.`);

  if (args.includes("--test")) {
    const r = await testMcpServer(row.id);
    console.log(r.ok ? `Connected: ${r.tools.join(", ")}` : `Connection failed: ${r.error}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
