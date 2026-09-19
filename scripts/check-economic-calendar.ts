import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { validateRange } from "../src/lib/economic-calendar/dates";
import { tradingEconomicsProvider } from "../src/lib/economic-calendar/trading-economics";

// Emits a review artifact, not production fixtures. No credentials are included.
const key = process.env.TRADING_ECONOMICS_API_KEY;
if (!key)
  throw new Error(
    "Set TRADING_ECONOMICS_API_KEY with full U.S. calendar access before coverage validation.",
  );
const range = validateRange(process.argv[2] ?? null, process.argv[3] ?? null);
const events = await tradingEconomicsProvider(key).getEvents(range);
const categories = Object.fromEntries(
  [...new Set(events.map((event) => event.category ?? "Uncategorized"))].map(
    (category) => [
      category,
      events.filter((event) => (event.category ?? "Uncategorized") === category)
        .length,
    ],
  ),
);
const report = {
  ...range,
  fetchedAt: new Date().toISOString(),
  provider: "Trading Economics",
  count: events.length,
  categories,
  events,
};
const file = `/tmp/owl-calendar-coverage-${range.from}.json`;
await writeFile(file, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({ file, count: events.length, categories }, null, 2),
);
console.log(
  "Compare this full feed against a complete MarketWatch week. Counts alone do not establish coverage parity.",
);
