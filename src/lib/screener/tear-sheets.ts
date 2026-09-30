import "server-only";
import { generateText } from "ai";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { tearSheets, type ScreenHit, type TearSheet, type TearSheetBody } from "@/db/schema";
import { agentModelWithFallback } from "@/lib/agent/definition";
import { getFilingText, listFilings } from "@/lib/providers/edgar";
import { CITED_RULES, citationsFor, parseAnswer, sentences, sourcesBlock, verifySentences, type CiteSource } from "./cited";
import { extractSection } from "./filing-changes/sections";
import { listFilingChanges } from "./filing-changes/store";

const INSTRUCTIONS = `You write a one-page tear sheet on a company that a value fund's screen found cheap, for the lead analyst deciding whether to look closer. The screen's numbers are shown to them separately; you never restate numbers.

Write JSON: {"business": [...], "mightDeserve": [...], "questions": [...]}
- business: two sentences on what the company does and how it makes money, from its 10-K Item 1.
- mightDeserve: two to four sentences on the obvious reason it might deserve to be cheap, from the risk factors, the latest MD&A and the filing changes. Quote the filing where you can.
- questions: exactly three things a lead should check first, each pointing at a filing section, with "section" naming it (e.g. "10-Q Item 2, Liquidity").
Each item is {"text": "...", "cites": [n], "quote": "optional exact words"}.

${CITED_RULES}`;

export type TearSheetInput = { hit: Pick<ScreenHit, "id" | "ticker" | "cik" | "companyName">; sources: CiteSource[]; accession: string };

/** The latest 10-K's Items 1 and 1A, the latest 10-Q's MD&A, and the company's labeled filing changes, as numbered sources. */
export async function tearSheetSources(hit: Pick<ScreenHit, "id" | "ticker" | "cik" | "companyName">): Promise<TearSheetInput | null> {
  const filings = await listFilings(hit.cik, { forms: ["10-K", "10-Q"], limit: 12 });
  const k = filings.find((f) => f.form === "10-K");
  const q = filings.find((f) => f.form === "10-Q");
  if (!k) return null;
  const kUrl = k.url;
  const kText = await getFilingText(kUrl);
  const sources: CiteSource[] = [];
  const add = (label: string, url: string, text: string | null) => {
    if (text && text.trim().length > 200) sources.push({ n: sources.length + 1, label, url, text: text.trim() });
  };
  add(`10-K (${k.filedAt}), Item 1 Business`, kUrl, extractSection(kText, "10-K", "1"));
  add(`10-K (${k.filedAt}), Item 1A Risk factors`, kUrl, extractSection(kText, "10-K", "1A"));
  let accession = k.accession;
  if (q && q.filedAt > k.filedAt) {
    const qUrl = q.url;
    add(`10-Q (${q.filedAt}), Item 2 MD&A`, qUrl, extractSection(await getFilingText(qUrl), "10-Q", "2"));
    accession = q.accession;
  }
  const changes = await listFilingChanges({ tickers: [hit.ticker], limit: 6 }).catch(() => []);
  for (const c of changes) if (c.quote) add(`Filing change, ${c.form} ${c.item}: ${c.labelText}`, c.filingUrl, `${c.summary ?? ""}\n"${c.quote}"`);
  if (!sources.some((s) => s.label.includes("Item 1 Business"))) return null;
  return { hit, sources, accession };
}

/** Checks a tear sheet's answer: every section present, three questions, every sentence cited and every quote found. */
export function checkTearSheet(raw: string, sources: CiteSource[]): { body: TearSheetBody | null; held: string | null } {
  const json = parseAnswer(raw);
  if (!json) return { body: null, held: "The model's answer wasn't readable." };
  const business = sentences(json.business);
  const mightDeserve = sentences(json.mightDeserve);
  const questions = (Array.isArray(json.questions) ? json.questions : []).flatMap((x) => {
    const [s] = sentences([x]);
    const section = x && typeof x === "object" && typeof (x as { section?: unknown }).section === "string" ? (x as { section: string }).section : "";
    return s && section ? [{ ...s, section }] : [];
  });
  if (!business.length || !mightDeserve.length) return { body: null, held: "A section of the tear sheet is missing." };
  if (questions.length < 3) return { body: null, held: "Fewer than three questions came back." };
  const body: TearSheetBody = { business: business.slice(0, 2), mightDeserve: mightDeserve.slice(0, 4), questions: questions.slice(0, 3) };
  return { body, held: verifySentences([...body.business, ...body.mightDeserve, ...body.questions], sources) };
}

/**
 * Writes (or rewrites) a screen hit's tear sheet. Only when the latest 10-K or 10-Q is newer than the one the last
 * sheet was written from; a sheet that fails a check is stored as held, with the reason, and not shown.
 */
export async function writeTearSheet(hit: Pick<ScreenHit, "id" | "ticker" | "cik" | "companyName">, opts: { force?: boolean; generate?: (prompt: string) => Promise<{ text: string; model: string }> } = {}): Promise<TearSheet | null> {
  const input = await tearSheetSources(hit);
  if (!input) return null;
  const [existing] = await db.select().from(tearSheets).where(and(eq(tearSheets.ticker, hit.ticker), eq(tearSheets.sourceAccession, input.accession)));
  if (existing && !opts.force) return existing;
  const prompt = `COMPANY: ${hit.companyName} (${hit.ticker})\n\nSOURCES:\n${sourcesBlock(input.sources)}`;
  let checked: { body: TearSheetBody | null; held: string | null };
  let model: string | null = null;
  try {
    const out = await (opts.generate ?? defaultGenerate)(prompt);
    model = out.model;
    checked = checkTearSheet(out.text, input.sources);
  } catch (e) {
    // Stored as held, so the monthly pass doesn't retry it every ten minutes; "Try again" rewrites it.
    checked = { body: null, held: `Hoot couldn't write it: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) };
  }
  const { body, held } = checked;
  const values = {
    screenHitId: hit.id,
    ticker: hit.ticker,
    sourceAccession: input.accession,
    body,
    citations: body ? citationsFor([...body.business, ...body.mightDeserve, ...body.questions], input.sources) : [],
    status: held ? "held" : "shown",
    heldReason: held,
    model,
    rating: null,
    ratedBy: null,
  };
  const [row] = await db
    .insert(tearSheets)
    .values(values)
    .onConflictDoUpdate({ target: [tearSheets.ticker, tearSheets.sourceAccession], set: { ...values, createdAt: new Date() } })
    .returning();
  return row;
}

async function defaultGenerate(prompt: string) {
  const { model, modelId } = await agentModelWithFallback();
  // Reasoning spends output tokens before the JSON; a generous budget keeps the answer from being cut off.
  const { text } = await generateText({ model, instructions: INSTRUCTIONS, prompt, reasoning: "low", maxOutputTokens: 4000, maxRetries: 1 });
  return { text, model: modelId };
}

/**
 * The monthly pass (Module 2): each team's top-five hits of the latest run without a tear sheet yet get one, a few per
 * call until the budget is spent. The screen's cron calls it once a run is done; a sheet that fails is stored as held.
 */
export async function writePendingTearSheets(hits: ScreenHit[], budgetMs: number): Promise<{ written: number; remaining: number }> {
  const started = Date.now();
  const top = hits.filter((h) => h.teamId && h.teamRank !== null && h.teamRank <= 5);
  if (!top.length) return { written: 0, remaining: 0 };
  const done = new Set((await db.select({ id: tearSheets.screenHitId }).from(tearSheets).where(inArray(tearSheets.screenHitId, top.map((h) => h.id)))).map((r) => r.id));
  const pending = top.filter((h) => !done.has(h.id));
  let written = 0;
  // A sheet takes a minute or so (two filings fetched, one model call); don't start one without that left.
  for (const h of pending) {
    if (Date.now() - started > budgetMs - 90_000) break;
    try {
      if (await writeTearSheet(h)) written++;
    } catch (e) {
      console.error(`[tear-sheets] ${h.ticker}:`, e);
    }
  }
  return { written, remaining: pending.length - written };
}

/** The newest tear sheet per ticker. */
export async function latestTearSheets(tickers: string[]): Promise<Map<string, TearSheet>> {
  if (!tickers.length) return new Map();
  const rows = await db.select().from(tearSheets).where(inArray(tearSheets.ticker, tickers)).orderBy(desc(tearSheets.createdAt));
  const out = new Map<string, TearSheet>();
  for (const r of rows) if (!out.has(r.ticker)) out.set(r.ticker, r);
  return out;
}
