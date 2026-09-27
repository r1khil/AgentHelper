// Build one weekly pack against the live database and print the Sunday email as it would go out.
// Usage: npm run smoke:weekly -- 2026-09-25   (defaults to that Friday). Sends no email.
import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { buildWeeklyPack } = await import("@/lib/weekly/build");
  const { getPack } = await import("@/lib/weekly/store");
  const { composeWeeklyEmail, weeklyEmailRecipients } = await import("@/lib/weekly/email");
  const week = process.argv[2] ?? "2026-09-25";
  const r = await buildWeeklyPack(week, { reason: "smoke" });
  console.log(JSON.stringify(r, null, 2));
  const pack = await getPack(week);
  if (!pack) throw new Error("no pack");
  console.log(JSON.stringify(pack.sources, null, 2));
  const recipients = await weeklyEmailRecipients();
  console.log("recipients:", JSON.stringify(recipients));
  const email = await composeWeeklyEmail(week, recipients.to);
  console.log(`\n${email?.subject}\n\n${email?.text}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
