// Build one weekly pack against the live database and print it as the page would copy it.
// Usage: npm run smoke:weekly -- 2026-09-18   (defaults to that Friday). Sends no email.
import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { buildWeeklyPack } = await import("@/lib/weekly/build");
  const { getPack, listRequests, normalizeAgenda, packFigures } = await import("@/lib/weekly/store");
  const { packText } = await import("@/lib/weekly/format");
  const week = process.argv[2] ?? "2026-09-18";
  const r = await buildWeeklyPack(week, { reason: "smoke" });
  console.log(JSON.stringify(r, null, 2));
  const pack = await getPack(week);
  if (!pack) throw new Error("no pack");
  console.log(JSON.stringify(pack.sources, null, 2));
  console.log(packText({ weekEnding: week, figures: packFigures(pack), performers: pack.performers, agenda: normalizeAgenda(pack.agenda), lastWeekAgenda: normalizeAgenda(pack.lastWeekAgenda) }));
  console.log("requests:", (await listRequests(week)).length);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
