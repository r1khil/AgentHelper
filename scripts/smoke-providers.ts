import { config } from "dotenv";
config({ path: ".env.local" });
config();

const symbol = process.argv[2] ?? "AAPL";

async function main() {
  const { getDailyBars, getQuote, getEarningsDate, SPX_SYMBOL } = await import("../src/lib/providers/yahoo");
  const { tickerToCik, listFilings, getCompanyFacts, conceptFacts } = await import("../src/lib/providers/edgar");
  const { getCompanyNews, finnhubConfigured } = await import("../src/lib/providers/finnhub");

  const bars = await getDailyBars(symbol, 5);
  console.log(`${symbol} last closes:`, bars.slice(-2));
  const spx = await getDailyBars(SPX_SYMBOL, 5);
  console.log("^GSPC last closes:", spx.slice(-2));
  const q = await getQuote(symbol);
  console.log("quote:", q.price, q.name, q.marketState, q.asOf);

  const cik = await tickerToCik(symbol);
  console.log("cik:", cik);
  if (cik) {
    const filings = await listFilings(cik.cik, { forms: ["10-Q", "10-K", "8-K"], limit: 3 });
    console.log("filings:", filings.map((f) => `${f.form} ${f.filedAt} ${f.url}`));
    const facts = await getCompanyFacts(cik.cik);
    const rev = conceptFacts(facts, "RevenueFromContractWithCustomerExcludingAssessedTax", "USD").slice(-4);
    console.log("revenue facts:", rev.map((f) => `${f.start}..${f.end} ${f.periodKind} ${f.val} (${f.form} ${f.filed})`));
  }
  const e = await getEarningsDate(symbol);
  console.log("earnings:", e);
  if (finnhubConfigured()) {
    const news = await getCompanyNews(symbol, new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
    console.log("news:", news.slice(0, 3).map((n) => `${n.publishedAt} ${n.source}: ${n.headline}`));
  } else {
    console.log("news: FINNHUB_API_KEY not set");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
