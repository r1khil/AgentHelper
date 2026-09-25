// Check the Firecrawl fallback behind read_url without a model and without touching the database.
// The app's own fetch runs first; when it fails in a way Firecrawl can fix (or the page is near-empty), one
// Firecrawl scrape is made directly (1 credit) — bypassing the app_settings credit counter and provider_cache so the
// production database is only read, never written. With no FIRECRAWL_API_KEY it reports that the fallback is off.
// Usage: npm run smoke:firecrawl -- [URL] [--force]   (--force scrapes even when the direct read succeeded)
process.loadEnvFile("/Users/rikhilsharma/Desktop/agenthelper/.claude/worktrees/agent-improvements-87fd9c/.env.local");
import { fetchWebPage, safeWebUrl } from "@/lib/agent/web";
import { creditKey, creditsUsed, FIRECRAWL_MONTHLY_CAP, firecrawlCanHelp, firecrawlConfigured, looksUnrendered, scrapeFirecrawl } from "@/lib/providers/firecrawl";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const raw = args.find((a) => !a.startsWith("--")) ?? "https://www.nasdaq.com/market-activity/earnings";
  const check = safeWebUrl(raw);
  if (!check.ok) throw new Error(`Refused by the SSRF guard: ${check.reason}`);
  console.log(`URL: ${check.url.href}`);
  console.log(`Guard on a metadata address: ${JSON.stringify(safeWebUrl("http://169.254.169.254/latest/meta-data"))}`);

  let needed = force;
  const t0 = Date.now();
  try {
    const p = await fetchWebPage(check.url);
    const thin = looksUnrendered(p.text);
    console.log(`Direct fetch: ${p.text.length} chars in ${Date.now() - t0} ms, title ${JSON.stringify(p.title)}${thin ? " — looks unrendered" : ""}`);
    needed ||= thin;
  } catch (e) {
    const can = firecrawlCanHelp(e);
    console.log(`Direct fetch failed in ${Date.now() - t0} ms: ${e instanceof Error ? e.message : e} — Firecrawl ${can ? "would" : "would not"} be tried`);
    needed ||= can;
  }

  if (!firecrawlConfigured()) {
    console.log("\nFIRECRAWL_API_KEY is not set: the fallback is off and read_url behaves exactly as before.");
    return;
  }
  if (process.env.DATABASE_URL) {
    const used = await creditsUsed().catch((e) => `unreadable (${e instanceof Error ? e.message : e})`);
    console.log(`Counter ${creditKey()}: ${used} of ${FIRECRAWL_MONTHLY_CAP} (read only)`);
  }
  if (!needed) {
    console.log("\nThe direct read was fine, so read_url would not spend a credit. Pass --force to scrape anyway.");
    return;
  }
  const t1 = Date.now();
  const page = await scrapeFirecrawl(check.url);
  console.log(`\nFirecrawl (1 credit, not counted): ${page.text.length} chars in ${Date.now() - t1} ms`);
  console.log(`  title: ${page.title}\n  final: ${page.url}\n  ${page.text.slice(0, 400).replace(/\n/g, " ")}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
