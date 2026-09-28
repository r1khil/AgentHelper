// One-off: rewrite company names stored in SEC capitals ("AMAZON COM INC") in holdings.company_name and
// securities.name, using Yahoo's properly cased name where it has one and title-casing otherwise. Names that
// already have lower-case letters are left alone. Dry run by default: prints old → new for every row it would
// change. Pass --apply to write both tables in one transaction.
//   npx tsx --conditions=react-server scripts/normalize-company-names.ts [--apply]
// Reads Yahoo directly with one batched quote request (no provider cache, so a dry run writes nothing).
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import YahooFinance from "yahoo-finance2";
import { holdings, securities } from "../src/db/schema";
import { cleanCompanyName, isAllCaps, pickCompanyName } from "../src/lib/company-name";

type Change = { table: "holdings" | "securities"; key: string; ticker: string; status?: string; from: string; to: string; source: "yahoo" | "title-case" };

async function yahooNames(tickers: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!tickers.length) return out;
  try {
    const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
    const quotes = await yf.quote(tickers);
    for (const q of quotes) {
      const name = q.longName ?? q.shortName;
      if (name) out.set(q.symbol, name);
    }
  } catch (e) {
    console.warn(`Yahoo lookup failed (${e instanceof Error ? e.message : String(e)}); falling back to title case for every row.`);
  }
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const db = drizzle(sql);

  const hs = (await db.select({ id: holdings.id, ticker: holdings.ticker, name: holdings.companyName, status: holdings.status }).from(holdings)).filter((h) => isAllCaps(h.name));
  const ss = (await db.select({ ticker: securities.ticker, name: securities.name }).from(securities)).filter((s) => isAllCaps(s.name));
  const tickers = [...new Set([...hs, ...ss].map((r) => r.ticker))].sort();
  const names = await yahooNames(tickers);

  const decide = (ticker: string, current: string) => {
    const yahoo = names.get(ticker);
    const to = pickCompanyName(ticker, [yahoo, current]);
    return { to, source: (yahoo && to === cleanCompanyName(yahoo) ? "yahoo" : "title-case") as Change["source"] };
  };
  const changes: Change[] = [];
  for (const h of hs) {
    const d = decide(h.ticker, h.name);
    if (d.to !== h.name) changes.push({ table: "holdings", key: h.id, ticker: h.ticker, status: h.status, from: h.name, ...d });
  }
  for (const s of ss) {
    const d = decide(s.ticker, s.name);
    if (d.to !== s.name) changes.push({ table: "securities", key: s.ticker, ticker: s.ticker, from: s.name, ...d });
  }

  changes.sort((a, b) => a.table.localeCompare(b.table) || a.ticker.localeCompare(b.ticker));
  for (const c of changes) {
    console.log(`${c.table.padEnd(10)} ${c.ticker.padEnd(5)} ${(c.status ?? "").padEnd(6)} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}  [${c.source}]`);
  }
  console.log(`${changes.length} rows to change (${changes.filter((c) => c.table === "holdings").length} holdings, ${changes.filter((c) => c.table === "securities").length} securities); Yahoo named ${names.size} of the ${tickers.length} tickers in capitals.`);

  if (!apply) {
    console.log("Dry run: nothing written. Re-run with --apply to write these names.");
  } else if (changes.length) {
    await db.transaction(async (tx) => {
      for (const c of changes) {
        if (c.table === "holdings") await tx.update(holdings).set({ companyName: c.to }).where(eq(holdings.id, c.key));
        else await tx.update(securities).set({ name: c.to }).where(eq(securities.ticker, c.key));
      }
    });
    console.log(`Wrote ${changes.length} rows.`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
