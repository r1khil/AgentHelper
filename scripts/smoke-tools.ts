// Exercise the newer native tools against the live providers without a model:
// insider transactions (Form 4), holders and estimates (Yahoo), a web page, and a peer comparison.
// Usage: npx tsx --conditions=react-server scripts/smoke-tools.ts [TICKER]
import { config } from "dotenv";
config({ path: ".env.local" });
import { makeTools, type ToolResult } from "@/lib/agent/tools";

async function main() {
  const ticker = process.argv[2] ?? "AXP";
  const tools = makeTools({ teamId: "00000000-0000-0000-0000-000000000000", userId: "smoke" });
  const run = async (name: keyof typeof tools, input: unknown) => {
    const t0 = Date.now();
    const r = (await (tools[name].execute as (i: unknown, o: unknown) => Promise<ToolResult<unknown>>)(input, { toolCallId: name })) as ToolResult<unknown>;
    const d = r.data as Record<string, unknown> | null;
    console.log(`\n== ${String(name)} ${JSON.stringify(input)} — ${Date.now() - t0} ms, ${r.sources.length} sources${r.error ? `, ERROR ${r.error}` : ""}`);
    if (r.error) return r;
    if (name === "get_insider_transactions") {
      for (const f of ((d?.filings as { filedAt: string; parseError?: string; transactions: Record<string, unknown>[] }[]) ?? []).slice(0, 4)) console.log(`  ${f.filedAt}: ${f.transactions.length} txns${f.parseError ? ` (${f.parseError})` : ""} ${f.transactions.slice(0, 2).map((t) => `${t.owner} ${t.codeLabel} ${t.shares} @ ${t.pricePerShare}`).join(" | ")}`);
    } else if (name === "get_institutional_holders") {
      console.log(`  insiders ${d?.insidersPctHeld}% institutions ${d?.institutionsPctHeld}% (${d?.institutionsCount}); top: ${((d?.top as { organization: string; pctHeld: number }[]) ?? []).slice(0, 3).map((h) => `${h.organization} ${h.pctHeld}%`).join(", ")}`);
    } else if (name === "get_analyst_estimates") {
      for (const row of (d?.trend as { period: string; endDate: string; eps: { avg: number; analysts: number }; revenue: { avg: number } }[]) ?? []) console.log(`  ${row.period} (${row.endDate}): EPS ${row.eps.avg} (${row.eps.analysts} analysts), revenue ${row.revenue.avg}`);
      console.log(`  target mean ${d?.targetMeanPrice}, recs ${JSON.stringify((d?.recommendations as unknown[])?.[0])}`);
    } else if (name === "read_web_page") {
      console.log(`  title: ${d?.title}\n  ${String(d?.text ?? "").slice(0, 300).replace(/\n/g, " ")}`);
    } else if (name === "compare_peers") {
      for (const c of (d?.companies as Record<string, unknown>[]) ?? []) console.log(`  ${c.ticker} ${c.periodEnd ?? ""} ${c.error ?? JSON.stringify((c.values as Record<string, { value: unknown }>)?.revenue ?? (c.values as Record<string, unknown>))?.slice(0, 120)}`);
    }
    console.log(`  source: ${r.sources[0]?.id} ${r.sources[0]?.title} ${r.sources[0]?.sourceType ?? ""}`);
    return r;
  };
  await run("get_insider_transactions", { ticker, limit: 4 });
  await run("get_institutional_holders", { ticker });
  await run("get_analyst_estimates", { ticker });
  await run("read_web_page", { url: "https://www.federalreserve.gov/newsevents/pressreleases.htm", offset: 0, maxChars: 1500 });
  await run("read_web_page", { url: "http://169.254.169.254/latest/meta-data", offset: 0, maxChars: 500 });
  await run("compare_peers", { tickers: [ticker, "V", "MA"], periodKind: "quarter" });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
