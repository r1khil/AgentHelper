// Opens the trade ledger from the book already on holdings (shares + weight %): one opening buy
// per holding at the as-of close, and one deposit sized so cash matches the book's uninvested
// weight. Refuses to run once the ledger has trades. Dry run unless --apply.
// Usage: npx tsx scripts/seed-ledger.ts [--as-of 2026-09-17] [--apply]
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, isNull } from "drizzle-orm";
import { DateTime } from "luxon";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { DEFAULT_TEAM_SECTORS } from "../src/lib/attribution/sectors";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const asOf = args.includes("--as-of") ? args[args.indexOf("--as-of") + 1] : "2026-09-17";
  const { getBarsRange } = await import("../src/lib/providers/yahoo");
  const { ensureSecurity, historyFrom, ledgerSymbols, syncHoldingsFromLedger } = await import("../src/lib/attribution/store");
  const { syncPrices } = await import("../src/lib/prices");

  // loadSeries runs queries in parallel, which stalls on a single pooled connection.
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 4 });
  const db = drizzle(sql, { schema });
  const { holdings, trades, cashFlows, teams, teamSectors } = schema;

  const existing = await db.select({ id: trades.id }).from(trades).where(isNull(trades.voidedAt)).limit(1);
  if (existing.length) throw new Error("The ledger already has trades. Record changes on the ledger page instead.");

  const book = (await db.select().from(holdings).where(eq(holdings.status, "active"))).filter((h) => h.shares && Number(h.shares) > 0);
  if (!book.length) throw new Error("No active holdings with shares.");

  const from = DateTime.fromISO(asOf).minus({ days: 10 }).toISODate()!;
  const rows: { ticker: string; shares: number; close: number; bookWeight: number }[] = [];
  for (const h of book) {
    const { bars } = await getBarsRange(h.ticker, from, asOf);
    const bar = bars.find((b) => b.date === asOf);
    if (!bar) throw new Error(`No ${asOf} close for ${h.ticker} yet. Run again after the session has closed.`);
    rows.push({ ticker: h.ticker, shares: Number(h.shares), close: bar.close, bookWeight: Number(h.weightPct ?? 0) });
  }

  const invested = rows.reduce((s, r) => s + r.shares * r.close, 0);
  const investedPct = rows.reduce((s, r) => s + r.bookWeight, 0);
  if (investedPct <= 0 || investedPct > 100) throw new Error(`Book weights add up to ${investedPct}%.`);
  const nav = invested / (investedPct / 100);

  for (const r of rows) {
    const implied = ((r.shares * r.close) / nav) * 100;
    console.log(`${r.ticker.padEnd(5)} ${String(r.shares).padStart(6)} x ${r.close.toFixed(2).padStart(9)}  implied ${implied.toFixed(2).padStart(5)}%  book ${r.bookWeight.toFixed(2).padStart(5)}%  diff ${(implied - r.bookWeight).toFixed(2)}`);
  }
  console.log(`${rows.length} opening positions as of ${asOf}; invested $${invested.toFixed(2)} (${investedPct.toFixed(2)}%), NAV $${nav.toFixed(2)}, cash $${(nav - invested).toFixed(2)}`);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to write the ledger.");
    await sql.end();
    return;
  }

  for (const r of rows) if (!(await ensureSecurity(db, r.ticker))) throw new Error(`Could not look up ${r.ticker}`);
  await db.transaction(async (tx) => {
    await tx.insert(cashFlows).values({ flowDate: asOf, kind: "deposit", amount: nav.toFixed(2), note: "Opening balance" });
    await tx.insert(trades).values(
      rows.map((r) => ({ tradeDate: asOf, ticker: r.ticker, side: "buy" as const, kind: "opening" as const, shares: r.shares.toString(), price: r.close.toString(), note: "Opening position" })),
    );
  });

  if (!(await db.select().from(teamSectors).limit(1)).length) {
    const teamRows = await db.select().from(teams);
    const values = Object.entries(DEFAULT_TEAM_SECTORS).flatMap(([slug, sectors]) => {
      const team = teamRows.find((t) => t.slug === slug);
      return team ? sectors.map((sector) => ({ sector, teamId: team.id })) : [];
    });
    if (values.length) await db.insert(teamSectors).values(values);
    console.log(`Assigned ${values.length} sectors to teams`);
  }

  const synced = await syncPrices(db, { symbols: await ledgerSymbols(db), from: historyFrom(asOf) });
  console.log(`Prices: updated ${synced.updated.length}, failed ${Object.keys(synced.failed).join(", ") || "none"}`);
  console.log(`Holdings refreshed: ${await syncHoldingsFromLedger(db)}`);
  await sql.end({ timeout: 5 });
}

main()
  // Provider clients can keep sockets open; the work is done, so exit rather than wait on them.
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
