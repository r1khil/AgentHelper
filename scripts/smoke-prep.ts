// Build an earnings prep pack for a holding's next upcoming report with the real model, print it, and
// check that every bullet cites a source the run retrieved. Leaves the pack on the row (the page shows it).
// Usage: npm run smoke:prep -- AXP [--reset]   (--reset clears the stored pack first)
import { config } from "dotenv";
config({ path: ".env.local" });
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { earnings, holdings, notifications } from "@/db/schema";
import { buildPrepPack, prepWindow } from "@/lib/jobs/earnings-prep";
import { PREDICTIVE_RE } from "@/lib/agent/prep-pack";

async function main() {
  const ticker = (process.argv[2] ?? "AXP").toUpperCase();
  const [h] = await db.select().from(holdings).where(and(eq(holdings.ticker, ticker), eq(holdings.status, "active"))).limit(1);
  if (!h) throw new Error(`No active holding ${ticker}`);
  const [e] = await db.select().from(earnings).where(and(eq(earnings.holdingId, h.id), eq(earnings.status, "upcoming"))).orderBy(asc(earnings.reportDate)).limit(1);
  if (!e) throw new Error(`No upcoming earnings row for ${ticker}; run the morning job's earnings refresh first`);
  console.log(`${ticker} reports ${e.reportDate} (${e.dateStatus}); morning window today is ${JSON.stringify(prepWindow())}`);
  if (process.argv.includes("--reset")) await db.update(earnings).set({ prepPack: null, prepPackAt: null, prepPackError: null }).where(eq(earnings.id, e.id));
  const t0 = Date.now();
  const r = await buildPrepPack(e.id);
  console.log(`built in ${Date.now() - t0} ms:`, r.ok ? `${r.steps} steps, dropped ${JSON.stringify(r.dropped)}` : `FAILED ${r.error}`);
  if (!r.ok) process.exit(1);
  for (const d of r.dropped.samples ?? []) console.log("  dropped ->", d);
  const known = new Set(r.pack.sources.map((s) => s.id));
  let bad = 0;
  for (const s of r.pack.sections) {
    console.log(`\n## ${s.title} (${s.bullets.length})`);
    for (const b of s.bullets) {
      const unknown = b.sourceIds.filter((id) => !known.has(id));
      const predictive = s.key !== "not_retrieved" && PREDICTIVE_RE.test(b.text);
      if (unknown.length || predictive) bad++;
      console.log(`- ${b.text} [${b.sourceIds.join(",")}]${unknown.length ? ` UNKNOWN ${unknown}` : ""}${predictive ? " PREDICTIVE" : ""}`);
    }
  }
  console.log(`\nsources: ${r.pack.sources.length}`);
  for (const s of r.pack.sources) console.log(`  ${s.id} ${s.title} ${s.publishedAt?.slice(0, 10) ?? ""}`);
  const notes = await db.select({ subject: notifications.subject, dedupeKey: notifications.dedupeKey }).from(notifications).where(eq(notifications.refId, e.id));
  console.log(`notifications queued for this event: ${notes.length}`, notes.map((n) => n.dedupeKey));
  if (bad) throw new Error(`${bad} bullet(s) failed the citation or boundary check`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
