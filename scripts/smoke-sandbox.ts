// Run run_python once against a real Vercel Sandbox, without a model and without the database:
// AXP and SPY price datasets, their daily-return correlation and beta, and a check that the sandbox is offline.
// Credentials: `npx vercel link --yes --project owlfund-workspace --scope rikhil1` then
// `npx vercel env pull .env.sandbox.local --environment=development --yes` (the token lasts 12 hours).
// Only VERCEL_OIDC_TOKEN is read from that file. The snapshot id is kept in a temp file instead of app_settings.
// Usage: npm run smoke:sandbox [-- TICKER BENCHMARK]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";
import type { CurrentUser } from "@/lib/auth";
import type { ToolResult } from "@/lib/agent/tools";
import { makeSandboxTools } from "@/lib/agent/sandbox-tools";
import { loadDataset } from "@/lib/sandbox/datasets";
import { runPython, sandboxAvailable, type SnapshotStore } from "@/lib/sandbox/python";

const ENV_FILE = path.resolve(".env.sandbox.local");
const SNAPSHOT_FILE = path.join(tmpdir(), "owlfund-sandbox-snapshot.json");

function loadToken() {
  if (process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_TOKEN) return;
  if (!existsSync(ENV_FILE)) throw new Error(`No ${ENV_FILE}. Run: npx vercel env pull .env.sandbox.local --environment=development --yes`);
  const token = parseEnv(readFileSync(ENV_FILE, "utf8")).VERCEL_OIDC_TOKEN;
  if (!token) throw new Error(`${ENV_FILE} has no VERCEL_OIDC_TOKEN; is OIDC enabled for the project?`);
  process.env.VERCEL_OIDC_TOKEN = token;
}

const fileStore: SnapshotStore = {
  async get() {
    try {
      return (JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8")) as { id?: string }).id ?? null;
    } catch {
      return null;
    }
  },
  async set(id) {
    writeFileSync(SNAPSHOT_FILE, JSON.stringify({ id, at: new Date().toISOString() }));
  },
};

async function main() {
  loadToken();
  if (!sandboxAvailable()) throw new Error("Sandbox credentials are not available.");
  const [ticker = "AXP", bench = "SPY"] = process.argv.slice(2);
  const ctx = { viewer: { id: "smoke", role: "analyst", teamId: null, team: null } as unknown as CurrentUser, teamId: "00000000-0000-0000-0000-000000000000" };
  let runs = 0;
  const tools = makeSandboxTools(ctx, {
    run: (input) => runPython({ ...input, store: fileStore }),
    // Prices only: holdings and returns read the production database.
    load: (req) => (req.name.toLowerCase().startsWith("prices:") ? loadDataset(ctx, req) : Promise.reject(new Error("smoke: prices only"))),
    countRun: async () => ++runs,
  });
  const code = `import pandas as pd, numpy as np, statsmodels.api as sm
a = pd.read_csv("data/prices_${ticker}.csv", parse_dates=["date"]).set_index("date")["adj_close"]
b = pd.read_csv("data/prices_${bench}.csv", parse_dates=["date"]).set_index("date")["adj_close"]
r = pd.concat({"${ticker}": a, "${bench}": b}, axis=1).dropna().pct_change().dropna()
fit = sm.OLS(r["${ticker}"], sm.add_constant(r["${bench}"])).fit()
print(f"Sessions: {len(r)} ({r.index[0].date()} to {r.index[-1].date()})")
print(f"Correlation of daily returns, ${ticker} vs ${bench}: {r.corr().iloc[0, 1]:.3f}")
print(f"Beta of ${ticker} to ${bench}: {fit.params['${bench}']:.3f} (R^2 {fit.rsquared:.3f})")
import urllib.request
try:
    urllib.request.urlopen("https://example.com", timeout=5)
    print("NETWORK: reachable (egress is NOT blocked)")
except Exception as e:
    print(f"NETWORK: blocked ({type(e).__name__})")
`;
  const t0 = Date.now();
  const execute = tools.run_python!.execute as (i: unknown, o: unknown) => Promise<ToolResult<Record<string, unknown> | null>>;
  const r = await execute({ code, datasets: [{ name: `prices:${ticker}` }, { name: `prices:${bench}` }] }, { toolCallId: "smoke", messages: [] });
  console.log(`run_python: ${Date.now() - t0} ms${r.error ? `, ERROR ${r.error}` : ""}`);
  if (r.data) {
    const { stdout, stderr, files, ...rest } = r.data;
    console.log(JSON.stringify(rest));
    console.log("files:", JSON.stringify(files));
    console.log(`--- stdout ---\n${stdout}`);
    if (stderr) console.log(`--- stderr ---\n${stderr}`);
  }
  for (const s of r.sources) console.log(`source ${s.id} · ${s.title} · ${s.sourceType ?? ""}\n  ${(s.excerpt ?? "").slice(0, 360).replace(/\n/g, "\n  ")}`);
  console.log(`snapshot id kept in ${SNAPSHOT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
