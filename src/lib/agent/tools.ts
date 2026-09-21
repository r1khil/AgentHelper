import "server-only";
import { readTranscript, searchTranscripts } from "@/lib/sell-side/store";
import { tool } from "ai";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { holdingNotes, holdings, movements, profiles } from "@/db/schema";
import { getDailyBars, getEarningsDate, getEstimates, getHolders, getQuote, getQuotes, SPX_SYMBOL } from "@/lib/providers/yahoo";
import { getInsiderTransactions, TRANSACTION_CODES } from "@/lib/providers/edgar-form4";
import { fetchWebPage, safeWebUrl } from "@/lib/agent/web";
import { conceptFacts, extractItem, filingUrlForFact, getCompanyFacts, getFilingText, listFilingDocuments, listFilings, listItemHeadings, tickerToCik, type Fact } from "@/lib/providers/edgar";
import { resolveKeyFinancials, searchConcepts, type KeyFinancials } from "@/lib/agent/financials";
import { finnhubConfigured, getCompanyNews, getEarningsCalendar } from "@/lib/providers/finnhub";
import { NY } from "@/lib/providers/calendar";
import { relativeMovePp } from "@/lib/movement/math";
import { sourceId, type Source } from "@/lib/providers/types";
import { DriveNotConnected, driveConfigured } from "@/lib/drive/auth";
import { documentLabel } from "@/lib/drive/labels";
import { driveStatus, getFileText, listHoldingFiles, searchIndex, type DriveFileMeta } from "@/lib/drive/index";
import { searchChunks } from "@/lib/drive/search";
import { embeddingConfigured } from "@/lib/agent/embeddings";
import { listPendingProposals } from "@/lib/holdings";
import { searchFullText } from "@/lib/drive/read";
import { windowText } from "@/lib/drive/text";
import { MARKET_FACT_TTL_DAYS, rememberMemory, searchMemories } from "@/lib/agent/memory/store";
import { newestEvidenceDate } from "@/lib/agent/memory/distill";

export type ToolResult<T> = { data: T; sources: Source[]; error?: string };

const now = () => new Date().toISOString();

function src(prefix: string, title: string, url: string, publisher: string, publishedAt?: string): Source {
  return { id: sourceId(prefix, url + (publishedAt ?? "")), title, url, publisher, publishedAt, retrievedAt: now() };
}

async function cikFor(ticker: string) {
  const r = await tickerToCik(ticker);
  if (!r) throw new Error(`No SEC registrant found for ${ticker}`);
  return r;
}

function fail<T>(e: unknown, data: T): ToolResult<T> {
  return { data, sources: [], error: e instanceof Error ? e.message : String(e) };
}

function driveSource(f: Pick<DriveFileMeta, "id" | "name" | "webViewLink" | "modifiedTime"> & { docDate?: string | null; kind?: string | null }): Source {
  return { ...src("drive", f.name, f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`, "Analyst Drive", f.docDate ?? undefined), documentId: f.id, sourceType: f.kind?.replaceAll("_", " ") ?? "Internal document" };
}

/** Throws a DriveNotConnected with the right explanation unless the Drive index is usable. */
async function assertDriveReady() {
  const status = await driveStatus();
  if (!status.configured) throw new DriveNotConnected("The analyst Drive is not configured on this deployment.");
  if (!status.connected || !status.rootFolderId) throw new DriveNotConnected();
  if (status.needsReconnect) throw new DriveNotConnected("The analyst Drive connection needs to be renewed by an admin.");
}

/** Standard income-statement lines for one company with one source per filing; shared by get_key_financials and compare_peers. */
async function keyFinancialsFor(ticker: string, periodKind: "quarter" | "annual", periods: number) {
  const { cik, name } = await cikFor(ticker);
  const facts = await getCompanyFacts(cik);
  const kf: KeyFinancials = resolveKeyFinancials(facts, periodKind, periods);
  const filingUrls = new Map((await listFilings(cik).catch(() => [])).map((f) => [f.accession, f.url]));
  const sources: Source[] = [];
  const byAccession = new Map<string, string>();
  const rows = kf.rows.map((r) => {
    let sourceId = byAccession.get(r.accession);
    if (!sourceId && r.accession) {
      const s = src("xbrl", `${name} ${r.form} filed ${r.filed} (XBRL financial data)`, filingUrls.get(r.accession) ?? filingUrlForFact(cik, { accn: r.accession } as Fact), "SEC EDGAR XBRL", r.filed);
      sources.push(s);
      byAccession.set(r.accession, s.id);
      sourceId = s.id;
    }
    return { ...r, sourceId: sourceId ?? null };
  });
  for (const s of sources) {
    s.excerpt = rows
      .filter((r) => r.sourceId === s.id)
      .map((r) => {
        const values = Object.entries(r.values).map(([key, value]) => {
          const metric = kf.metrics.find((m) => m.key === key);
          return `${metric?.label ?? key}: ${value.value} ${metric?.unit ?? ""}`;
        });
        return `XBRL facts for period ended ${r.end}: ${values.join("; ")}`;
      })
      .join(". ")
      .slice(0, 360);
  }
  return { cik, company: name, kf, rows, sources };
}

export function makeTools(ctx: { teamId: string; holdingId?: string | null; userId: string; sources?: Source[] }) {
  const filingSources = new Map<string, Source>((ctx.sources ?? []).filter((s) => s.id.startsWith("sec-") && s.url?.startsWith("https://www.sec.gov/Archives/")).map((s) => [s.url!, s]));
  /** Every source any tool returned in this conversation, so `remember` can attach real Source objects to a fact. */
  const seen = new Map<string, Source>((ctx.sources ?? []).map((s) => [s.id, s]));
  const tickerArg = z.string().describe("Ticker symbol, e.g. NVDA");

  const tools = {
    remember: tool({
      description:
        "Save something durable for future chats about this holding, team, or the whole fund: a tool-usage lesson (which XBRL concept a company uses, which filing item holds what, which search came back empty), a company fact with the ids of the sources that support it, or a fund-wide fact (a rates decision, an index event) with an expiry. Never save the student's interpretation, thesis, or conclusions, and never save a fact you cannot source.",
      inputSchema: z.object({
        kind: z.enum(["fact", "lesson"]),
        scope: z.enum(["holding", "team", "fund"]).default("holding").describe("holding: this pinned company; team: the sector team; fund: everyone"),
        body: z.string().min(10).max(600),
        sourceIds: z.array(z.string()).max(6).default([]).describe("Source ids from this conversation that support a fact"),
        expiresInDays: z.number().int().min(1).max(730).optional().describe("Facts about a period or price should expire; structural facts and lessons need not"),
      }),
      execute: async ({ kind, scope, body, sourceIds, expiresInDays }): Promise<ToolResult<unknown>> => {
        try {
          const cited = sourceIds.map((id) => seen.get(id)).filter((s): s is Source => !!s);
          if (kind === "fact" && cited.length === 0) throw new Error("A fact needs at least one source id returned by a tool in this conversation. Save it as a lesson if it is about how to use the tools.");
          const effScope = scope === "holding" && !ctx.holdingId ? "team" : scope;
          const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : kind === "fact" ? new Date(Date.now() + MARKET_FACT_TTL_DAYS * 86_400_000) : null;
          const r = await rememberMemory({ scope: effScope, teamId: ctx.teamId, holdingId: effScope === "holding" ? (ctx.holdingId ?? null) : null, kind, body, sources: cited, evidenceAt: kind === "fact" ? (newestEvidenceDate(cited) ?? new Date()) : null, expiresAt, createdBy: `agent:${ctx.userId}` });
          return { data: { saved: true, id: r.id, merged: r.merged, scope: effScope, note: r.merged ? "An equivalent note already existed; it was marked as verified today." : undefined }, sources: [] };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    recall: tool({
      description:
        "Search what the agent learned in earlier chats: research-log entries (what was asked and found), facts with their citations, and tool lessons, across this holding, the team, and the fund. Use it before re-researching something the team has probably asked before. Every fact carries an evidence date; re-verify one whose evidence predates the latest filing before using its number.",
      inputSchema: z.object({ query: z.string().min(3), limit: z.number().int().min(1).max(12).default(6) }),
      execute: async ({ query, limit }): Promise<ToolResult<unknown>> => {
        try {
          const hits = await searchMemories({ query, teamId: ctx.teamId, holdingId: ctx.holdingId ?? null, limit });
          const sources = new Map<string, Source>();
          for (const h of hits) for (const s of h.sources) sources.set(s.id, s);
          return {
            data: {
              memories: hits.map((h) => ({ id: h.id, kind: h.kind, scope: h.scope, noted: h.createdAt.slice(0, 10), evidenceAt: h.evidenceAt?.slice(0, 10) ?? null, verifiedAt: h.verifiedAt?.slice(0, 10) ?? null, body: h.body, sourceIds: h.sources.map((s) => s.id), question: h.meta?.question, score: h.score })),
              note: hits.length ? "Cite a remembered fact with the source ids listed for it; say 'per the research log (date)' for log entries." : "Nothing remembered matches; research it with the other tools.",
            },
            sources: [...sources.values()],
          };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    find_call_transcripts: tool({
      description: "Search saved sell-side call transcripts in this team. Filter by company ticker; optional full-text query. Returns source passages. Use read_call_transcript to page the complete call.",
      inputSchema: z.object({ ticker: z.string().optional(), query: z.string().min(2).optional() }),
      execute: async ({ ticker, query }) => { try { return await searchTranscripts(ctx.teamId, ticker, query); } catch (e) { return fail(e, null); } },
    }),
    read_call_transcript: tool({
      description: "Read saved sell-side call transcript parts with timestamps (no speaker labels). Page with offset until nextOffset is null. Never attribute statements to specific speakers.",
      inputSchema: z.object({ callId: z.string().uuid(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(6).default(3) }),
      execute: async ({ callId, offset, limit }) => { try { return await readTranscript(ctx.teamId, callId, offset, limit); } catch (e) { return fail(e, null); } },
    }),
    get_quote: tool({
      description: "Latest price, day change, and market state for a ticker.",
      inputSchema: z.object({ ticker: tickerArg }),
      execute: async ({ ticker }): Promise<ToolResult<unknown>> => {
        try {
          const q = await getQuote(ticker.toUpperCase());
          const s = src("yq", `${q.symbol} quote (Yahoo Finance)`, `https://finance.yahoo.com/quote/${encodeURIComponent(q.symbol)}/`, "Yahoo Finance", q.asOf);
          return { data: { ...q, sourceId: s.id }, sources: [s] };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    get_price_history: tool({
      description: "Daily closing prices for a ticker over the last N sessions (max 250).",
      inputSchema: z.object({ ticker: tickerArg, days: z.number().int().min(2).max(250).default(30) }),
      execute: async ({ ticker, days }): Promise<ToolResult<unknown>> => {
        try {
          const t = ticker.toUpperCase();
          const bars = await getDailyBars(t, days);
          const s = src("yh", `${t} price history (Yahoo Finance)`, `https://finance.yahoo.com/quote/${encodeURIComponent(t)}/history/`, "Yahoo Finance");
          return { data: { ticker: t, bars, sourceId: s.id }, sources: [s] };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    get_relative_moves: tool({
      description: "Daily return of a ticker minus the S&P 500 daily return, in percentage points, for recent sessions. Flags sessions that meet the Fund's 4 pp rule.",
      inputSchema: z.object({ ticker: tickerArg, days: z.number().int().min(1).max(60).default(10) }),
      execute: async ({ ticker, days }): Promise<ToolResult<unknown>> => {
        try {
          const t = ticker.toUpperCase();
          const [h, s] = await Promise.all([getDailyBars(t, days + 1), getDailyBars(SPX_SYMBOL, days + 1)]);
          const spxBy = new Map(s.map((b) => [b.date, b.close]));
          const spxPrev = new Map<string, number>();
          for (let i = 1; i < s.length; i++) spxPrev.set(s[i].date, s[i - 1].close);
          const rows = [];
          for (let i = 1; i < h.length; i++) {
            const d = h[i].date;
            const sc = spxBy.get(d);
            const sp = spxPrev.get(d);
            if (sc === undefined || sp === undefined) continue;
            const rel = relativeMovePp({ close: h[i].close, prevClose: h[i - 1].close }, { close: sc, prevClose: sp });
            rows.push({
              date: d,
              holdingReturnPct: +((h[i].close / h[i - 1].close - 1) * 100).toFixed(2),
              spxReturnPct: +((sc / sp - 1) * 100).toFixed(2),
              relativePp: +rel.toFixed(2),
              qualifies: Math.abs(+rel.toFixed(4)) >= 4,
            });
          }
          const source = src("yr", `${t} vs S&P 500 daily returns (Yahoo Finance)`, `https://finance.yahoo.com/quote/${encodeURIComponent(t)}/history/`, "Yahoo Finance");
          return { data: { ticker: t, sessions: rows.slice(-days), sourceId: source.id }, sources: [source] };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    get_filings: tool({
      description: "List recent SEC filings for a ticker from EDGAR. Filter by form (10-K, 10-Q, 8-K, DEF 14A, etc.).",
      inputSchema: z.object({
        ticker: tickerArg,
        forms: z.array(z.string()).optional().describe("Form types to include, e.g. ['8-K','10-Q']. Omit for all."),
        limit: z.number().int().min(1).max(40).default(10),
        since: z.string().optional().describe("ISO date; only filings on or after this date"),
      }),
      execute: async ({ ticker, forms, limit, since }): Promise<ToolResult<unknown>> => {
        try {
          const { cik, name } = await cikFor(ticker);
          const filings = await listFilings(cik, { forms, limit, since });
          const sources = filings.map((f) => src("sec", `${name} ${f.form} filed ${f.filedAt}${f.description ? ` — ${f.description}` : ""}`, f.url, "SEC EDGAR", f.filedAt));
          sources.forEach((s) => filingSources.set(s.url!, s));
          return { data: { cik, company: name, filings: filings.map((f, i) => ({ ...f, sourceId: sources[i].id })) }, sources };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    read_filing: tool({
      description:
        "Read the text of an SEC filing document by URL (from get_filings). Pass `item` to jump to one section. Item numbers differ by form: 10-Q — Item 1 financial statements, Item 2 MD&A (results, margins, outlook), Item 3 market risk; 10-K — Item 1 business, Item 1A risk factors, Item 7 MD&A, Item 8 financial statements; 8-K — Item 2.02 results of operations (the earnings press release is usually exhibit EX-99.1, see list_filing_documents). Returns a window of `maxChars` starting at `offset`; use `offset` to page when `hasMore` is true.",
      inputSchema: z.object({
        url: z.string().url(),
        item: z.string().optional().describe("Section to extract, e.g. '2' for 10-Q MD&A, '7' for 10-K MD&A, '1A' for risk factors"),
        offset: z.number().int().min(0).default(0).describe("Character offset to start from, for paging"),
        maxChars: z.number().int().min(500).max(30000).default(12000),
      }),
      execute: async ({ url, item, offset, maxChars }): Promise<ToolResult<unknown>> => {
        try {
          if (!/^https:\/\/www\.sec\.gov\/Archives\//.test(url)) throw new Error("Only SEC EDGAR archive URLs (https://www.sec.gov/Archives/...) can be read. Use get_filings to find the document URL; news links cannot be read.");
          const text = await getFilingText(url);
          let body = text;
          if (item) {
            const ex = extractItem(text, item);
            if (!ex) {
              const headings = listItemHeadings(text);
              throw new Error(`Item ${item} was not found in this document. Headings present: ${headings.length ? headings.map((h) => `Item ${h}`).join(", ") : "none (this may be an exhibit or a plain-text document)"}. Reminder: 10-Q MD&A is Item 2, 10-K MD&A is Item 7.`);
            }
            body = ex;
          }
          const window = body.slice(offset, offset + maxChars);
          const filing = filingSources.get(url);
          const s: Source = {
            ...src("doc", `${filing?.title ?? `SEC document ${url.split("/").pop()}`}${item ? ` — Item ${item}` : ""}`, url, "SEC EDGAR", filing?.publishedAt),
            id: sourceId("doc", `${url}:${item ?? ""}:${offset}`),
            sourceType: filing?.sourceType ?? (/ex-?99|exhibit.?99|xex99/i.test(url) ? "Earnings release" : "SEC filing"),
            excerpt: window.trim().slice(0, 360),
            location: { section: item ? `Item ${item}` : undefined, text: window.trim().slice(0, 180), offset },
          };
          return { data: { url, item: item ?? null, offset, totalChars: body.length, hasMore: offset + maxChars < body.length, text: window, sourceId: s.id }, sources: [s] };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    list_filing_documents: tool({
      description: "List all documents inside one SEC filing (to find exhibits such as EX-99.1 press releases). Needs the accession number from get_filings.",
      inputSchema: z.object({ ticker: tickerArg, accession: z.string() }),
      execute: async ({ ticker, accession }): Promise<ToolResult<unknown>> => {
        try {
          const { cik, name } = await cikFor(ticker);
          const docs = await listFilingDocuments(cik, accession);
          const filing = [...filingSources.values()].find((s) => s.url?.includes(accession.replaceAll("-", "")));
          const sources = docs.map((d) => ({ ...src("sec", `${name} — ${d.description || d.type || d.name}`, d.url, "SEC EDGAR", filing?.publishedAt), sourceType: /EX-99/i.test(d.type ?? "") ? "Earnings release" : "SEC filing" }));
          sources.forEach((s) => filingSources.set(s.url!, s));
          return { data: { accession, documents: docs.map((d, i) => ({ ...d, sourceId: sources[i].id })) }, sources };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    search_financial_concepts: tool({
      description: "Search the XBRL concepts a company has reported (e.g. 'revenue', 'operating income', 'shares') to find the exact concept name to pass to get_financials. For the standard income statement lines prefer get_key_financials, which resolves the names for you.",
      inputSchema: z.object({ ticker: tickerArg, query: z.string().min(2) }),
      execute: async ({ ticker, query }): Promise<ToolResult<unknown>> => {
        try {
          const { cik } = await cikFor(ticker);
          const facts = await getCompanyFacts(cik);
          return { data: { matches: searchConcepts(facts, query, 15) }, sources: [] };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    get_key_financials: tool({
      description:
        "One call for the standard income statement: revenue, gross profit, operating income, pretax income, net income, diluted EPS and operating cash flow for the last N quarters or fiscal years, from SEC XBRL company facts. Resolves each company's concept names automatically and computes margins (flagged as calculations). Use this first for any question about revenue, margins, earnings or profitability.",
      inputSchema: z.object({
        ticker: tickerArg,
        periodKind: z.enum(["quarter", "annual"]).default("quarter"),
        periods: z.number().int().min(1).max(12).default(4).describe("How many most-recent periods to return"),
      }),
      execute: async ({ ticker, periodKind, periods }): Promise<ToolResult<unknown>> => {
        try {
          const { company, kf, rows, sources } = await keyFinancialsFor(ticker, periodKind, periods);
          return { data: { company, periodKind, metrics: kf.metrics, rows, missing: kf.missing, notes: kf.notes }, sources };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    compare_peers: tool({
      description: "The latest reported income-statement lines for two to five tickers side by side (revenue, operating income, net income, diluted EPS, margins as calculations), from SEC XBRL. Use for 'how does X compare with Y' questions; each company gets its own source.",
      inputSchema: z.object({ tickers: z.array(tickerArg).min(2).max(5), periodKind: z.enum(["quarter", "annual"]).default("quarter") }),
      execute: async ({ tickers, periodKind }): Promise<ToolResult<unknown>> => {
        const sources: Source[] = [];
        const companies = await Promise.all(
          [...new Set(tickers.map((t) => t.toUpperCase()))].map(async (t) => {
            try {
              const { company, kf, rows, sources: srcs } = await keyFinancialsFor(t, periodKind, 1);
              const latest = rows[0];
              if (!latest) return { ticker: t, company, error: "No reported period found" };
              sources.push(...srcs.filter((x) => x.id === latest.sourceId));
              return { ticker: t, company, periodEnd: latest.end, form: latest.form, filed: latest.filed, values: latest.values, metrics: kf.metrics.map((m) => ({ key: m.key, label: m.label, unit: m.unit })), missing: kf.missing, sourceId: latest.sourceId };
            } catch (e) {
              return { ticker: t, error: e instanceof Error ? e.message : String(e) };
            }
          }),
        );
        return { data: { periodKind, companies, note: "Periods may not line up across companies (different fiscal calendars); compare the periodEnd dates. Margins must be computed by you and labeled as calculations." }, sources };
      },
    }),

    get_financials: tool({
      description: "Reported values for one XBRL concept (e.g. 'Revenues', 'NetIncomeLoss', 'EarningsPerShareDiluted') from SEC company facts, with period, form, and filing link. Use search_financial_concepts first if unsure of the name.",
      inputSchema: z.object({
        ticker: tickerArg,
        concept: z.string(),
        unit: z.string().default("USD").describe("USD, USD/shares, shares, pure"),
        limit: z.number().int().min(1).max(40).default(12),
        periodKind: z.enum(["any", "quarter", "annual", "ytd", "instant"]).default("any"),
      }),
      execute: async ({ ticker, concept, unit, limit, periodKind }): Promise<ToolResult<unknown>> => {
        try {
          const { cik, name } = await cikFor(ticker);
          const facts = await getCompanyFacts(cik);
          const meta = facts.facts["us-gaap"]?.[concept] ?? facts.facts["ifrs-full"]?.[concept];
          if (!meta) {
            const close = searchConcepts(facts, concept.replace(/([a-z])([A-Z])/g, "$1 $2"), 5);
            throw new Error(
              `Concept ${concept} is not reported by ${name}. ${close.length ? `Closest reported concepts: ${close.map((c) => `${c.concept} ("${c.label}", latest ${c.latestEnd})`).join("; ")}. Call get_financials again with one of these exact names.` : "Use get_key_financials for standard lines or search_financial_concepts to find the name."}`,
            );
          }
          const taxonomy = facts.facts["us-gaap"]?.[concept] ? "us-gaap" : "ifrs-full";
          const units = Object.keys(meta.units);
          const u = meta.units[unit] ? unit : units[0];
          let rows = conceptFacts(facts, concept, u, taxonomy);
          if (periodKind !== "any") rows = rows.filter((r) => r.periodKind === periodKind);
          rows = rows.slice(-limit).reverse(); // latest period first
          const filingUrls = new Map((await listFilings(cik).catch(() => [])).map((f) => [f.accession, f.url]));
          // One source per filing, not per row: several rows usually come from the same accession.
          const sources: Source[] = [];
          const byAccession = new Map<string, string>();
          for (const f of rows) {
            if (byAccession.has(f.accn)) continue;
            const s = src("xbrl", `${name} ${f.form} filed ${f.filed} (XBRL financial data)`, filingUrls.get(f.accn) ?? filingUrlForFact(cik, f), "SEC EDGAR XBRL", f.filed);
            s.excerpt = rows.filter((r) => r.accn === f.accn).map((r) => `XBRL ${meta.label}, period ended ${r.end}: ${r.val} ${u}`).join("; ").slice(0, 360);
            sources.push(s);
            byAccession.set(f.accn, s.id);
          }
          return {
            data: {
              company: name,
              concept,
              label: meta.label,
              unit: u,
              availableUnits: units,
              values: rows.map((f) => ({ start: f.start ?? null, end: f.end, periodKind: f.periodKind, value: f.val, form: f.form, filed: f.filed, accession: f.accn, sourceId: byAccession.get(f.accn) })),
            },
            sources,
          };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    get_news: tool({
      description: "Company news headlines for a ticker over the last N days (Finnhub).",
      inputSchema: z.object({ ticker: tickerArg, days: z.number().int().min(1).max(60).default(7) }),
      execute: async ({ ticker, days }): Promise<ToolResult<unknown>> => {
        if (!finnhubConfigured()) return { data: null, sources: [], error: "News provider not configured (FINNHUB_API_KEY)" };
        try {
          const t = ticker.toUpperCase();
          const to = DateTime.now().setZone(NY).toISODate()!;
          const from = DateTime.now().setZone(NY).minus({ days }).toISODate()!;
          const items = (await getCompanyNews(t, from, to)).slice(0, 15);
          const sources = items.map((n) => ({ ...src("news", n.headline, n.url, n.source, n.publishedAt), excerpt: n.summary?.slice(0, 360), sourceType: "News" }));
          return { data: { ticker: t, from, to, items: items.map((n, i) => ({ headline: n.headline, source: n.source, publishedAt: n.publishedAt, summary: n.summary?.slice(0, 200), url: n.url, sourceId: sources[i].id })) }, sources };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    get_earnings_calendar: tool({
      description: "Next earnings date for a ticker, whether it is confirmed or estimated, and consensus estimates if available.",
      inputSchema: z.object({ ticker: tickerArg }),
      execute: async ({ ticker }): Promise<ToolResult<unknown>> => {
        try {
          const t = ticker.toUpperCase();
          const [y, f] = await Promise.all([getEarningsDate(t).catch(() => null), getEarningsCalendar(t).catch(() => [])]);
          const sources: Source[] = [];
          if (y) sources.push(src("yearn", `${t} earnings date (Yahoo Finance)`, y.sourceUrl ?? `https://finance.yahoo.com/quote/${t}/`, "Yahoo Finance"));
          return { data: { ticker: t, yahoo: y ? { ...y, sourceId: sources[0]?.id } : null, finnhub: f }, sources };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    get_team_context: tool({
      description: "The team's current holdings, owners, theses, recent notes, and open movement investigations from the workspace database.",
      inputSchema: z.object({ ticker: tickerArg.optional().describe("Limit to one holding") }),
      execute: async ({ ticker }): Promise<ToolResult<unknown>> => {
        const rows = await db
          .select({ h: holdings, ownerName: profiles.fullName })
          .from(holdings)
          .leftJoin(profiles, eq(profiles.id, holdings.ownerId))
          .where(and(eq(holdings.teamId, ctx.teamId), eq(holdings.status, "active")));
        const subset = ticker ? rows.filter((r) => r.h.ticker === ticker.toUpperCase()) : rows;
        const driveOn = driveConfigured();
        const sources: Source[] = [];
        const out = [];
        for (const r of subset) {
          const notes = await db.select().from(holdingNotes).where(eq(holdingNotes.holdingId, r.h.id)).orderBy(desc(holdingNotes.createdAt)).limit(5);
          const mv = await db.select().from(movements).where(eq(movements.holdingId, r.h.id)).orderBy(desc(movements.sessionDate)).limit(5);
          const files = driveOn ? await listHoldingFiles(r.h.id, 10).catch(() => []) : [];
          const pendingThesis = (await listPendingProposals(r.h.id).catch(() => [])).find((p) => p.field === "thesis");
          out.push({
            ticker: r.h.ticker,
            company: r.h.companyName,
            owner: r.ownerName,
            thesis: r.h.thesis,
            thesisUpdatedAt: r.h.thesisUpdatedAt,
            pendingThesisProposal: pendingThesis ? { fileName: pendingThesis.sourceFileName, note: "Extracted by the app from the initiating report; awaiting analyst review. Not the recorded thesis." } : null,
            notes: notes.map((n) => ({ at: n.createdAt, body: n.body })),
            movements: mv.map((m) => ({ sessionDate: m.sessionDate, relativePp: m.relativeMovePp, status: m.status, update: m.updateText })),
            driveFiles: files.map((f) => {
              const s = driveSource(f);
              sources.push(s);
              return { fileId: f.id, name: f.name, kind: f.kind, documentType: documentLabel(f), path: f.path, modifiedTime: f.modifiedTime, docDate: f.docDate, summary: f.summary, sourceId: s.id };
            }),
          });
        }
        return { data: { holdings: out, analystDrive: driveOn ? "Use find_drive_files / read_drive_file for the documents" : "not configured" }, sources };
      },
    }),

    find_drive_files: tool({
      description:
        "Locate the team's own documents in the Owl Fund analyst Google Drive by name, ticker, or kind: initiating coverage reports (where the recorded thesis lives), earnings updates, the Excel model, and other notes. Returns file ids for read_drive_file. For questions about what a document says, use search_drive_text.",
      inputSchema: z.object({
        ticker: tickerArg.optional(),
        query: z.string().min(2).optional().describe("Words in the file name or folder path; also searched inside file contents"),
        kind: z.enum(["initiating_coverage", "earnings_update", "model", "other"]).optional(),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      execute: async ({ ticker, query, kind, limit }): Promise<ToolResult<unknown>> => {
        try {
          await assertDriveReady();
          let rows = await searchIndex({ ticker, query, kind, limit });
          if (query && rows.length < limit) {
            const ids = await searchFullText(query).catch(() => [] as string[]);
            const seen = new Set(rows.map((r) => r.id));
            const fresh = ids.filter((i) => !seen.has(i));
            if (fresh.length) rows = [...rows, ...(await searchIndex({ ticker, kind, ids: fresh, limit: limit - rows.length }))];
          }
          const sources = rows.map(driveSource);
          return {
            data: {
              files: rows.map((r, i) => ({ fileId: r.id, name: r.name, kind: r.kind, documentType: documentLabel(r), ticker: r.ticker, path: r.path, mimeType: r.mimeType, modifiedTime: r.modifiedTime, size: r.size, sourceId: sources[i].id })),
              note: rows.length ? undefined : "No matching files in the analyst Drive index.",
            },
            sources,
          };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    search_drive_text: tool({
      description:
        "Search inside the text of the team's own documents in the analyst Drive by meaning (a question or phrase), across initiating coverage reports, earnings updates, models, and notes. Returns the best-matching passages with file ids; open a file with read_drive_file for more context.",
      inputSchema: z.object({
        query: z.string().min(3).describe("A question or phrase, e.g. 'what did we say about pricing pressure'"),
        ticker: tickerArg.optional(),
        kind: z.enum(["initiating_coverage", "earnings_update", "model", "other"]).optional(),
        limit: z.number().int().min(1).max(12).default(6),
      }),
      execute: async ({ query, ticker, kind, limit }): Promise<ToolResult<unknown>> => {
        try {
          await assertDriveReady();
          if (!embeddingConfigured()) throw new Error("Semantic search over Drive documents is not configured (OPENROUTER_EMBEDDING_MODEL). Use find_drive_files and read_drive_file instead.");
          const hits = await searchChunks({ query, ticker, kind, limit });
          const sources: Source[] = [];
          const passages = hits.map((h) => {
            const s: Source = { ...driveSource(h.meta), id: sourceId("drive", `${h.fileId}:chunk:${h.seq}:${h.text}`), excerpt: h.text.trim().slice(0, 360), location: { text: h.text.trim().slice(0, 180) } };
            sources.push(s);
            return { fileId: h.fileId, name: h.meta.name, kind: h.meta.kind, documentType: documentLabel(h.meta), ticker: h.meta.ticker, docDate: h.meta.docDate, seq: h.seq, score: h.score, text: h.text, sourceId: s.id };
          });
          return { data: { passages, note: passages.length ? undefined : "No passages matched in the indexed documents. Newly added files are embedded within a few minutes of sync." }, sources };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    read_drive_file: tool({
      description:
        "Read the extracted text of a file in the analyst Drive by id (from find_drive_files or the pinned holding's document list). Handles PDF, Word, PowerPoint, Excel, and Google Docs/Sheets/Slides. Returns a bounded window of text; page with offset.",
      inputSchema: z.object({
        fileId: z.string().min(5),
        offset: z.number().int().min(0).default(0).describe("Character offset to start from, for paging"),
        maxChars: z.number().int().min(500).max(20000).default(10000),
      }),
      execute: async ({ fileId, offset, maxChars }): Promise<ToolResult<unknown>> => {
        try {
          const { meta, text } = await getFileText(fileId);
          const w = windowText(text, offset, maxChars);
          const s: Source = { ...driveSource(meta), id: sourceId("drive", `${fileId}:${meta.modifiedTime?.toISOString()}:${w.offset}`), excerpt: w.text.trim().slice(0, 360), location: { offset: w.offset, text: w.text.trim().slice(0, 180) } };
          return { data: { fileId, name: meta.name, kind: meta.kind, documentType: documentLabel(meta), path: meta.path, modifiedTime: meta.modifiedTime, ...w, sourceId: s.id }, sources: [s] };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    read_web_page: tool({
      description:
        "Read a public web page (a news article from get_news, a company press-release page, an exchange or regulator page) as plain text. Use it when a headline is not enough. It cannot read SEC archive URLs (use read_filing), Google Drive (use read_drive_file), or pages that need a login. Returns a window of maxChars starting at offset; page when hasMore is true. Quote sparingly; filings and releases outrank articles.",
      inputSchema: z.object({ url: z.string().min(8), offset: z.number().int().min(0).default(0), maxChars: z.number().int().min(500).max(20000).default(8000) }),
      execute: async ({ url, offset, maxChars }): Promise<ToolResult<unknown>> => {
        try {
          const appHost = process.env.APP_URL ? new URL(process.env.APP_URL).hostname : null;
          const check = safeWebUrl(url, appHost);
          if (!check.ok) throw new Error(check.reason);
          const page = await fetchWebPage(check.url);
          const w = windowText(page.text, offset, maxChars);
          const host = new URL(page.finalUrl).hostname.replace(/^www\./, "");
          const s: Source = { ...src("web", page.title ?? host, page.finalUrl, host), id: sourceId("web", `${page.finalUrl}:${w.offset}`), sourceType: "Web page", excerpt: w.text.trim().slice(0, 360), location: { offset: w.offset, text: w.text.trim().slice(0, 180) } };
          return { data: { url: page.finalUrl, title: page.title, ...w, truncatedDownload: page.truncated, sourceId: s.id }, sources: [s] };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    get_insider_transactions: tool({
      description: "Recent insider trades for a ticker from SEC Form 4 filings: who (officer or director), date, transaction code (P purchase, S sale, A award, M option exercise, F tax withholding), shares, price, and shares owned after. Newest filings first.",
      inputSchema: z.object({ ticker: tickerArg, limit: z.number().int().min(1).max(20).default(8).describe("How many Form 4 filings to read") }),
      execute: async ({ ticker, limit }): Promise<ToolResult<unknown>> => {
        try {
          const { cik, name } = await cikFor(ticker);
          const filings = await getInsiderTransactions(cik, limit);
          const sources = filings.map((f) => {
            const owners = [...new Set(f.transactions.map((t) => t.owner))].join(", ");
            return { ...src("sec", `${name} Form 4 filed ${f.filedAt}${owners ? ` — ${owners}` : ""}`, f.url, "SEC EDGAR", f.filedAt), sourceType: "Insider filing", excerpt: f.transactions.map((t) => `${t.owner}: ${TRANSACTION_CODES[t.code] ?? t.code} ${t.shares ?? "?"} shares${t.pricePerShare ? ` at $${t.pricePerShare}` : ""} on ${t.date}`).join("; ").slice(0, 360) || undefined };
          });
          return {
            data: {
              company: name,
              filings: filings.map((f, i) => ({ filedAt: f.filedAt, accession: f.accession, sourceId: sources[i].id, parseError: f.parseError, transactions: f.transactions.map((t) => ({ ...t, codeLabel: TRANSACTION_CODES[t.code] ?? "Other" })) })),
              codes: TRANSACTION_CODES,
              note: filings.length ? "Sales coded S under a 10b5-1 plan are routine; look for open-market purchases (P) and clusters." : "No Form 4 filings found.",
            },
            sources,
          };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    get_institutional_holders: tool({
      description: "Ownership breakdown for a ticker (insider and institutional percent held, number of institutions) and the ten largest institutional holders with their latest reported positions, from Yahoo Finance (13F-derived, usually a quarter old).",
      inputSchema: z.object({ ticker: tickerArg }),
      execute: async ({ ticker }): Promise<ToolResult<unknown>> => {
        try {
          const t = ticker.toUpperCase();
          const h = await getHolders(t);
          const s = src("yhold", `${t} holders (Yahoo Finance)`, `https://finance.yahoo.com/quote/${encodeURIComponent(t)}/holders/`, "Yahoo Finance", h.top[0]?.reportDate ?? undefined);
          return { data: { ticker: t, ...h, sourceId: s.id, note: "13F positions are reported with a lag of up to 45 days after quarter end." }, sources: [s] };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    get_analyst_estimates: tool({
      description: "Sell-side consensus for a ticker: EPS and revenue estimates (average, range, analyst count, year-ago, growth) for the current and next quarter and fiscal year, the recommendation mix, and the mean price target, from Yahoo Finance. This is consensus, not company guidance; guidance lives in the earnings release and MD&A.",
      inputSchema: z.object({ ticker: tickerArg }),
      execute: async ({ ticker }): Promise<ToolResult<unknown>> => {
        try {
          const t = ticker.toUpperCase();
          const e = await getEstimates(t);
          const s = src("yest", `${t} analyst estimates (Yahoo Finance)`, `https://finance.yahoo.com/quote/${encodeURIComponent(t)}/analysis/`, "Yahoo Finance");
          return { data: { ticker: t, ...e, sourceId: s.id, note: "Consensus figures; label them as such and never present them as guidance or as a forecast of your own." }, sources: [s] };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    get_peer_moves: tool({
      description: "Today's price moves for the team's other holdings (peers), each relative to the S&P 500.",
      inputSchema: z.object({}),
      execute: async (): Promise<ToolResult<unknown>> => {
        try {
          const rows = await db.select({ ticker: holdings.ticker }).from(holdings).where(and(eq(holdings.teamId, ctx.teamId), eq(holdings.status, "active")));
          const tickers = rows.map((r) => r.ticker);
          const quotes = await getQuotes([...tickers, SPX_SYMBOL]);
          const spx = quotes[SPX_SYMBOL]?.changePct ?? 0;
          const s = src("ypeers", "Team holdings quotes (Yahoo Finance)", "https://finance.yahoo.com/", "Yahoo Finance");
          return {
            data: {
              spxChangePct: spx,
              peers: tickers.map((t) => ({ ticker: t, changePct: quotes[t]?.changePct ?? null, relativePp: quotes[t]?.changePct !== undefined ? +(quotes[t].changePct! - spx).toFixed(2) : null })),
              sourceId: s.id,
            },
            sources: [s],
          };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),
  };
  return trackSources(tools, seen);
}

/** Wrap every tool so the Source objects it returns are remembered for `remember` and later turns. */
function trackSources<T extends Record<string, { execute?: unknown }>>(tools: T, seen: Map<string, Source>): T {
  const out: Record<string, unknown> = {};
  for (const [name, t] of Object.entries(tools)) {
    const exec = t.execute as ((input: unknown, opts: unknown) => Promise<ToolResult<unknown>>) | undefined;
    if (!exec) {
      out[name] = t;
      continue;
    }
    out[name] = {
      ...t,
      execute: async (input: unknown, opts: unknown) => {
        const r = await exec(input, opts);
        if (r && typeof r === "object" && Array.isArray(r.sources)) for (const s of r.sources) if (s && typeof s.id === "string") seen.set(s.id, s);
        return r;
      },
    };
  }
  return out as T;
}

export type AgentTools = ReturnType<typeof makeTools>;
