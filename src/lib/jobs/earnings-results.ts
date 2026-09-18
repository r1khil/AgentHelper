import "server-only";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { generateText } from "ai";
import { db } from "@/db/client";
import { earnings, evidenceItems, holdings } from "@/db/schema";
import { conceptFacts, filingUrlForFact, getCompanyFacts, getFilingText, listFilingDocuments, listFilings } from "@/lib/providers/edgar";
import { agentConfigured, agentModelFor, agentModelId } from "@/lib/agent/model";
import type { Actuals } from "@/lib/earnings";

const CONCEPTS: { label: string; concepts: string[]; unit: string }[] = [
  { label: "Revenue", concepts: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"], unit: "USD" },
  { label: "Gross profit", concepts: ["GrossProfit"], unit: "USD" },
  { label: "Operating income", concepts: ["OperatingIncomeLoss"], unit: "USD" },
  { label: "Net income", concepts: ["NetIncomeLoss"], unit: "USD" },
  { label: "Diluted EPS", concepts: ["EarningsPerShareDiluted"], unit: "USD/shares" },
];

/** After the report date: pull the 8-K (Item 2.02), its press-release exhibit, and any XBRL facts; extract a sourced actuals table. */
export async function gatherEarningsResults(earningsId: string) {
  const [row] = await db.select({ e: earnings, h: holdings }).from(earnings).innerJoin(holdings, eq(holdings.id, earnings.holdingId)).where(eq(earnings.id, earningsId)).limit(1);
  if (!row) throw new Error("Earnings event not found");
  const { e, h } = row;
  if (!h.cik) throw new Error(`${h.ticker} has no SEC registrant, cannot gather results`);
  const report = DateTime.fromISO(e.reportDate);
  const since = report.minus({ days: 2 }).toISODate()!;
  const until = report.plus({ days: 7 }).toISODate()!;

  const items: (typeof evidenceItems.$inferInsert)[] = [];
  const sources: Actuals["sources"] = [];
  const missing: string[] = [];
  let releaseText = "";

  const eightKs = (await listFilings(h.cik, { forms: ["8-K", "8-K/A"], since, limit: 10 })).filter((f) => f.filedAt <= until);
  const resultsFiling = eightKs.find((f) => f.items?.includes("2.02")) ?? eightKs[0];
  if (!resultsFiling) {
    missing.push("No 8-K found in the window after the report date yet.");
  } else {
    sources.push({ id: "8k", title: `${h.ticker} 8-K filed ${resultsFiling.filedAt}`, url: resultsFiling.url });
    items.push({ earningsId, kind: "filing", title: `8-K filed ${resultsFiling.filedAt}${resultsFiling.items ? ` (items ${resultsFiling.items})` : ""}`, url: resultsFiling.url, publisher: "SEC EDGAR", publishedAt: new Date(`${resultsFiling.filedAt}T12:00:00Z`), payload: { accession: resultsFiling.accession } });
    const docs = await listFilingDocuments(h.cik, resultsFiling.accession);
    const exhibit = docs.find((d) => /^EX-99(\.1)?$/i.test(d.type ?? "") && /\.htm/i.test(d.name)) ?? docs.find((d) => /^EX-99/i.test(d.type ?? "") && /\.htm/i.test(d.name)) ?? docs.find((d) => /ex[-_]?99|exhibit99|-99\./i.test(d.name) && /\.htm/i.test(d.name));
    if (exhibit) {
      releaseText = (await getFilingText(exhibit.url)).slice(0, 40000);
      sources.push({ id: "release", title: `${h.ticker} press release (EX-99.1)`, url: exhibit.url });
      items.push({ earningsId, kind: "release", title: `Press release exhibit ${exhibit.name}`, url: exhibit.url, publisher: "SEC EDGAR", publishedAt: new Date(`${resultsFiling.filedAt}T12:00:00Z`), payload: { excerpt: releaseText.slice(0, 1500) } });
    } else {
      missing.push("No EX-99.1 press release exhibit found in the 8-K.");
    }
  }

  // XBRL facts, if the 10-Q/10-K is already on file.
  let xbrlLines: string[] = [];
  try {
    const facts = await getCompanyFacts(h.cik);
    for (const c of CONCEPTS) {
      const concept = c.concepts.find((n) => facts.facts["us-gaap"]?.[n]);
      if (!concept) continue;
      const rows = conceptFacts(facts, concept, c.unit).filter((f) => f.periodKind === "quarter" || f.periodKind === "annual");
      const recent = rows.filter((f) => f.end <= e.reportDate && f.end >= report.minus({ days: 120 }).toISODate()!).at(-1);
      if (!recent) continue;
      const target = DateTime.fromISO(recent.end).minus({ years: 1 });
      const prior = rows.find((f) => f.periodKind === recent.periodKind && Math.abs(DateTime.fromISO(f.end).diff(target, "days").days) <= 10);
      const url = filingUrlForFact(h.cik, recent);
      const sid = `xbrl-${concept}`;
      sources.push({ id: sid, title: `${h.ticker} ${recent.form} XBRL ${concept} (${recent.fy} ${recent.fp})`, url });
      xbrlLines.push(`${c.label} (${concept}): ${recent.val} for ${recent.start}..${recent.end}; prior-year ${prior ? prior.val : "n/a"} [src:${sid}]`);
      items.push({ earningsId, kind: "financial", title: `${c.label}: ${recent.val.toLocaleString()} (${recent.fp} ${recent.fy}, ${recent.form})`, url, publisher: "SEC EDGAR XBRL", publishedAt: new Date(`${recent.filed}T12:00:00Z`), payload: { concept, value: recent.val, priorYear: prior?.val ?? null, start: recent.start, end: recent.end } });
    }
  } catch {
    xbrlLines = [];
  }
  if (!xbrlLines.length) missing.push("XBRL facts for this quarter are not on file yet (they arrive with the 10-Q/10-K).");

  let actuals: Actuals = { rows: [], sources, extractedAt: new Date().toISOString(), missing };

  if (agentConfigured() && (releaseText || xbrlLines.length)) {
    const instructions = `You extract reported financial results into a table. Use ONLY the press release text and XBRL facts given. Every cell must come from those sources; write null when a value is absent. Never estimate or fill from memory. Prior guidance means guidance the company gave for this period in an earlier quarter, only if the release restates it. Respond with JSON only: {"rows":[{"metric":"Revenue","actual":"$57.0B","priorYear":"$35.1B","priorGuidance":null,"estimate":null,"sourceId":"release","note":null}],"missing":["..."]}. Keep units and periods explicit in the strings. Include at least Revenue, Operating income, Net income, Diluted EPS, and any segment or guidance figures the release highlights (max 12 rows). sourceId must be one of: ${sources.map((s) => s.id).join(", ")}.`;
    const prompt = `Company: ${h.companyName} (${h.ticker}). Report date: ${e.reportDate}. ${e.fiscalPeriod ? `Fiscal period: ${e.fiscalPeriod}.` : ""}\n\nXBRL FACTS:\n${xbrlLines.join("\n") || "(none)"}\n\nPRESS RELEASE TEXT:\n${releaseText || "(none)"}`;
    const modelId = await agentModelId();
    try {
      const { text } = await generateText({ model: agentModelFor(modelId), instructions, prompt, maxRetries: 2 });
      const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      const parsed = JSON.parse(json) as { rows?: Actuals["rows"]; missing?: string[] };
      const valid = new Set(sources.map((s) => s.id));
      actuals = {
        rows: (parsed.rows ?? []).slice(0, 14).map((r) => ({ metric: String(r.metric), actual: r.actual ?? null, priorYear: r.priorYear ?? null, priorGuidance: r.priorGuidance ?? null, estimate: r.estimate ?? null, sourceId: r.sourceId && valid.has(String(r.sourceId)) ? String(r.sourceId) : null, note: r.note ?? undefined })),
        sources,
        extractedAt: new Date().toISOString(),
        model: modelId,
        missing: [...missing, ...(parsed.missing ?? []).map(String)].slice(0, 10),
      };
    } catch (err) {
      actuals.missing.push(`Extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(evidenceItems).where(eq(evidenceItems.earningsId, earningsId));
    if (items.length) await tx.insert(evidenceItems).values(items);
    await tx.update(earnings).set({ actuals, gatheredAt: new Date(), status: e.status === "upcoming" ? "reported" : e.status, preLockedAt: e.preLockedAt ?? new Date() }).where(eq(earnings.id, earningsId));
  });
  return actuals;
}
