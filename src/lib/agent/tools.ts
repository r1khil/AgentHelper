import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { holdingNotes, holdings, movements, profiles } from "@/db/schema";
import { getDailyBars, getEarningsDate, getQuote, getQuotes, SPX_SYMBOL } from "@/lib/providers/yahoo";
import { conceptFacts, extractItem, filingUrlForFact, getCompanyFacts, getFilingText, listConcepts, listFilingDocuments, listFilings, tickerToCik } from "@/lib/providers/edgar";
import { finnhubConfigured, getCompanyNews, getEarningsCalendar } from "@/lib/providers/finnhub";
import { NY } from "@/lib/providers/calendar";
import { relativeMovePp } from "@/lib/movement/math";
import { sourceId, type Source } from "@/lib/providers/types";

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

export function makeTools(ctx: { teamId: string; userId: string }) {
  const tickerArg = z.string().describe("Ticker symbol, e.g. NVDA");

  return {
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
          return { data: { cik, company: name, filings: filings.map((f, i) => ({ ...f, sourceId: sources[i].id })) }, sources };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    read_filing: tool({
      description:
        "Read the text of an SEC filing document by URL (from get_filings). Optionally extract one Item (e.g. '2.02' for an 8-K earnings item, '7' for 10-K MD&A, '1A' for risk factors). Returns a bounded window of text.",
      inputSchema: z.object({
        url: z.string().url(),
        item: z.string().optional(),
        offset: z.number().int().min(0).default(0).describe("Character offset to start from, for paging"),
        maxChars: z.number().int().min(500).max(30000).default(12000),
      }),
      execute: async ({ url, item, offset, maxChars }): Promise<ToolResult<unknown>> => {
        try {
          if (!/^https:\/\/www\.sec\.gov\/Archives\//.test(url)) throw new Error("Only SEC EDGAR archive URLs can be read");
          const text = await getFilingText(url);
          let body = text;
          let note: string | undefined;
          if (item) {
            const ex = extractItem(text, item, maxChars + offset);
            if (ex) body = ex;
            else note = `Item ${item} heading not found; returning the document start instead.`;
          }
          const window = body.slice(offset, offset + maxChars);
          const s = src("doc", `SEC document ${url.split("/").pop()}`, url, "SEC EDGAR");
          return { data: { url, item: item ?? null, offset, totalChars: body.length, hasMore: offset + maxChars < body.length, note, text: window, sourceId: s.id }, sources: [s] };
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
          const { cik } = await cikFor(ticker);
          const docs = await listFilingDocuments(cik, accession);
          return { data: { accession, documents: docs }, sources: [] };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),

    search_financial_concepts: tool({
      description: "Search the XBRL concepts a company has reported (e.g. 'revenue', 'operating income', 'shares') to find the exact concept name to pass to get_financials.",
      inputSchema: z.object({ ticker: tickerArg, query: z.string().min(2) }),
      execute: async ({ ticker, query }): Promise<ToolResult<unknown>> => {
        try {
          const { cik } = await cikFor(ticker);
          const facts = await getCompanyFacts(cik);
          const q = query.toLowerCase().split(/\s+/);
          const hits = listConcepts(facts)
            .filter((c) => q.every((w) => (c.concept + " " + c.label).toLowerCase().includes(w)))
            .sort((a, b) => b.count - a.count)
            .slice(0, 25)
            .map((c) => ({ concept: c.concept, label: c.label, units: c.units, dataPoints: c.count }));
          return { data: { matches: hits }, sources: [] };
        } catch (e) {
          return fail(e, null);
        }
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
          if (!meta) throw new Error(`Concept ${concept} not reported by ${name}. Try search_financial_concepts.`);
          const taxonomy = facts.facts["us-gaap"]?.[concept] ? "us-gaap" : "ifrs-full";
          const units = Object.keys(meta.units);
          const u = meta.units[unit] ? unit : units[0];
          let rows = conceptFacts(facts, concept, u, taxonomy);
          if (periodKind !== "any") rows = rows.filter((r) => r.periodKind === periodKind);
          rows = rows.slice(-limit);
          const sources = rows.map((f) => src("xbrl", `${name} ${f.form} (${f.fy} ${f.fp}) filed ${f.filed}`, filingUrlForFact(cik, f), "SEC EDGAR XBRL", f.filed));
          return {
            data: {
              company: name,
              concept,
              label: meta.label,
              unit: u,
              availableUnits: units,
              values: rows.map((f, i) => ({ start: f.start ?? null, end: f.end, periodKind: f.periodKind, value: f.val, fy: f.fy, fp: f.fp, form: f.form, filed: f.filed, accession: f.accn, sourceId: sources[i].id })),
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
          const items = (await getCompanyNews(t, from, to)).slice(0, 25);
          const sources = items.map((n) => src("news", n.headline, n.url, n.source, n.publishedAt));
          return { data: { ticker: t, from, to, items: items.map((n, i) => ({ headline: n.headline, source: n.source, publishedAt: n.publishedAt, summary: n.summary?.slice(0, 300), url: n.url, sourceId: sources[i].id })) }, sources };
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
        const out = [];
        for (const r of subset) {
          const notes = await db.select().from(holdingNotes).where(eq(holdingNotes.holdingId, r.h.id)).orderBy(desc(holdingNotes.createdAt)).limit(5);
          const mv = await db.select().from(movements).where(eq(movements.holdingId, r.h.id)).orderBy(desc(movements.sessionDate)).limit(5);
          out.push({
            ticker: r.h.ticker,
            company: r.h.companyName,
            owner: r.ownerName,
            thesis: r.h.thesis,
            thesisUpdatedAt: r.h.thesisUpdatedAt,
            notes: notes.map((n) => ({ at: n.createdAt, body: n.body })),
            movements: mv.map((m) => ({ sessionDate: m.sessionDate, relativePp: m.relativeMovePp, status: m.status, update: m.updateText })),
          });
        }
        return { data: { holdings: out }, sources: [] };
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
}

export type AgentTools = ReturnType<typeof makeTools>;
