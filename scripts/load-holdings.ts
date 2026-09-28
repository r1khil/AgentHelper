// Replaces every holding with the Fund's current book. Deleting a holding cascades to its
// notes, movements, earnings, and models, so this is a reset: run with --apply to write.
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { holdings, teams } from "../src/db/schema";
import { pickCompanyName } from "../src/lib/company-name";

// As of 2026-09-17. [ticker, shares, portfolio weight %]
const BOOK: Record<string, [string, number, number][]> = {
  consumer: [
    ["XLY", 757, 1.81],
    ["AMZN", 632, 3.42],
    ["XLP", 2246, 4.03],
    ["GOOG", 699, 5.17],
    ["META", 257, 3.77],
    ["XLC", 842, 2.04],
  ],
  tech: [
    ["MSFT", 399, 4.27],
    ["TDIV", 2076, 5.11],
    ["AVGO", 631, 4.71],
    ["DRAM", 1702, 2.12],
    ["TSM", 560, 5.18],
    ["XLK", 1190, 4.81],
    ["CIBR", 1494, 3.27],
    ["SKYY", 964, 3.41],
    ["SOXX", 280, 3.13],
  ],
  industrials: [
    ["XLI", 1001, 3.64],
    ["RSG", 737, 3.47],
  ],
  commodities: [
    ["NEE", 1717, 3.0],
    ["VST", 987, 3.05],
    ["RING", 815, 1.48],
  ],
  healthcare: [
    ["MCK", 235, 4.45],
    ["THC", 522, 2.94],
    ["CI", 638, 3.79],
    ["SYK", 349, 2.1],
  ],
  fig: [
    ["EVR", 326, 1.84],
    ["KKR", 1351, 2.85],
    ["KRE", 2094, 3.28],
    ["AXP", 487, 3.26],
    ["PLD", 662, 1.93],
  ],
};

async function main() {
  const apply = process.argv.includes("--apply");
  const { lookupCompany } = await import("../src/lib/providers/yahoo");
  const { tickerToCik } = await import("../src/lib/providers/edgar");
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const db = drizzle(sql);

  const teamRows = await db.select().from(teams);
  const rows: (typeof holdings.$inferInsert)[] = [];
  for (const [slug, book] of Object.entries(BOOK)) {
    const team = teamRows.find((t) => t.slug === slug);
    if (!team) throw new Error(`No team with slug ${slug}`);
    for (const [ticker, shares, weight] of book) {
      const [company, cik] = await Promise.all([lookupCompany(ticker), tickerToCik(ticker)]);
      if (!company) throw new Error(`Could not find ${ticker} on the market data provider`);
      const companyName = pickCompanyName(ticker, [company.name, cik?.name]);
      rows.push({ teamId: team.id, ticker, companyName, cik: cik?.cik ?? null, shares: String(shares), weightPct: weight.toFixed(2) });
      console.log(`${slug.padEnd(12)} ${ticker.padEnd(5)} ${String(shares).padStart(5)} ${weight.toFixed(2).padStart(5)}%  ${companyName}`);
    }
  }
  const total = rows.reduce((s, r) => s + Number(r.weightPct), 0);
  console.log(`${rows.length} holdings, ${total.toFixed(2)}% invested`);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to replace the holdings table.");
  } else {
    await db.transaction(async (tx) => {
      const gone = await tx.delete(holdings).returning({ ticker: holdings.ticker });
      await tx.insert(holdings).values(rows);
      console.log(`Deleted ${gone.length} (${gone.map((g) => g.ticker).join(", ") || "none"}), inserted ${rows.length}`);
    });
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
