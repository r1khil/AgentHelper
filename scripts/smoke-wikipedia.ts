// Exercise get_company_background against live Wikipedia and Wikidata without a model:
// a ticker resolved through the SEC CIK, a name, an ambiguous name, a follow-up by wikidataId and an unknown ticker.
// Usage: npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/smoke-wikipedia.ts [TICKER]
import { existsSync } from "node:fs";

const ENV = "/Users/rikhilsharma/Desktop/agenthelper/.claude/worktrees/agent-improvements-87fd9c/.env.local";
if (existsSync(ENV)) process.loadEnvFile(ENV); // only for EDGAR_USER_AGENT
// Keep the provider cache in memory: the local DATABASE_URL is production.
delete process.env.DATABASE_URL;

async function main() {
  const { makeWikipediaTools } = await import("@/lib/agent/wikipedia-tools");
  const tools = makeWikipediaTools();
  const run = async (input: Record<string, string>) => {
    const t0 = Date.now();
    const r = (await tools.get_company_background.execute!(input, { toolCallId: "smoke", messages: [] } as never)) as { data: Record<string, unknown> | null; sources: { id: string; title: string; retrievedAt: string }[]; error?: string };
    console.log(`\n== ${JSON.stringify(input)} — ${Date.now() - t0} ms, ${r.sources.length} sources${r.error ? `, ERROR ${r.error}` : ""}`);
    if (r.data) console.log(JSON.stringify(r.data, null, 2).slice(0, 2500));
    for (const s of r.sources) console.log(`  source ${s.id}: ${s.title} (retrieved ${s.retrievedAt})`);
    return r;
  };
  await run({ ticker: process.argv[2] ?? "AAPL" });
  await run({ ticker: "KKR" });
  await run({ name: "Mastercard" });
  await run({ name: "Sony" });
  const amb = await run({ name: "Delta" });
  const first = (amb.data?.candidates as { wikidataId: string }[] | undefined)?.[0];
  if (first) await run({ wikidataId: first.wikidataId });
  await run({ ticker: "ZZZZQ" });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
