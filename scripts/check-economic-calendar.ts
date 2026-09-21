import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { validateRange } from "../src/lib/economic-calendar/dates";
import { loadConfiguredCalendar } from "../src/lib/economic-calendar/provider-selection";

const range = validateRange(process.argv[2] ?? null, process.argv[3] ?? null);
const result = await loadConfiguredCalendar(range);
const categories = Object.fromEntries(
  [...new Set(result.events.map((e) => e.category ?? "Uncategorized"))].map(
    (category) => [
      category,
      result.events.filter((e) => (e.category ?? "Uncategorized") === category)
        .length,
    ],
  ),
);
const report = {
  ...range,
  fetchedAt: new Date().toISOString(),
  ...result,
  count: result.events.length,
  categories,
};
const file = `/tmp/owl-calendar-coverage-${range.from}.json`;
await writeFile(file, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      file,
      count: report.count,
      provider: result.provider,
      futureWithEstimate: result.events.filter(
        (e) =>
          e.timestamp &&
          Date.parse(e.timestamp) > Date.now() &&
          e.estimate !== null,
      ).length,
      futureWithPrevious: result.events.filter(
        (e) =>
          e.timestamp &&
          Date.parse(e.timestamp) > Date.now() &&
          e.previous !== null,
      ).length,
      futureWithActual: result.events.filter(
        (e) =>
          e.timestamp &&
          Date.parse(e.timestamp) > Date.now() &&
          e.actual !== null,
      ).length,
      sources: result.sources,
      coverage: result.coverage,
    },
    null,
    2,
  ),
);
console.log(
  "Compare event identities, units and values against the full reference week; raw counts include different measurements of the same release.",
);
