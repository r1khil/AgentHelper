// Writes Hoot's daily attribution brief against the live database and prints the email. Sends nothing
// unless --send=<address> is given (then only to that address).
// Usage: npm run smoke:daily-brief -- [YYYY-MM-DD] [--send=me@theowlfund.com]
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });
config();

async function main() {
  const { runDailyBriefAnalysis, sendDailyBrief } = await import("../src/lib/jobs/daily-brief");
  const { briefEmail } = await import("../src/lib/jobs/daily-brief-format");
  const date = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const sendTo = process.argv.find((a) => a.startsWith("--send="))?.slice(7);
  const t0 = Date.now();
  const r = await runDailyBriefAnalysis({ sessionDate: date });
  console.log(`analysis ${r.status}${r.reason ? ` (${r.reason})` : ""} in ${((Date.now() - t0) / 1000).toFixed(0)}s, model ${r.model}, ${r.steps} steps\n`);
  if (r.facts) console.log(briefEmail({ sessionDate: r.sessionDate, facts: r.facts, analysis: r.analysis ?? null, sources: r.sources ?? [], failure: r.reason, appUrl: process.env.APP_URL }).body);
  if (sendTo) console.log(await sendDailyBrief({ sessionDate: r.sessionDate, to: [sendTo] }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
