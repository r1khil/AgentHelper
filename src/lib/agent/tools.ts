import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { holdingNotes, holdings, movements, profiles } from "@/db/schema";
import { getDailyBars, getEarningsDate, getQuote, getQuotes, SPX_SYMBOL } from "@/lib/providers/yahoo";
import { conceptFacts, extractItem, filingUrlForFact, getCompanyFacts, getFilingText, listFilingDocuments, listFilings, listItemHeadings, tickerToCik, type Fact } from "@/lib/providers/edgar";
import { resolveKeyFinancials, searchConcepts } from "@/lib/agent/financials";
import { finnhubConfigured, getCompanyNews, getEarningsCalendar } from "@/lib/providers/finnhub";
import { NY } from "@/lib/providers/calendar";
import { relativeMovePp } from "@/lib/movement/math";
import { sourceId, type Source } from "@/lib/providers/types";
import { DriveNotConnected, driveConfigured } from "@/lib/drive/auth";
import { driveStatus, getFileText, listHoldingFiles, searchIndex, type DriveFileMeta } from "@/lib/drive/index";
import { searchChunks } from "@/lib/drive/search";
import { embeddingConfigured } from "@/lib/agent/embeddings";
import { listPendingProposals } from "@/lib/holdings";
import { searchFullText } from "@/lib/drive/read";
import { windowText } from "@/lib/drive/text";

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

function driveSource(f: Pick<DriveFileMeta, "id" | "name" | "webViewLink" | "modifiedTime">): Source {
  return src("drive", f.name, f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`, "Analyst Drive", f.modifiedTime?.toISOString());
}

/** Throws a DriveNotConnected with the right explanation unless the Drive index is usable. */
async function assertDriveReady() {
  const status = await driveStatus();
  if (!status.configured) throw new DriveNotConnected("The analyst Drive is not configured on this deployment.");
  if (!status.connected || !status.rootFolderId) throw new DriveNotConnected();
  if (status.needsReconnect) throw new DriveNotConnected("The analyst Drive connection needs to be renewed by an admin.");
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
          const s = src("doc", `SEC document ${url.split("/").pop()}${item ? ` — Item ${item}` : ""}`, url, "SEC EDGAR");
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
          const { cik } = await cikFor(ticker);
          const docs = await listFilingDocuments(cik, accession);
          return { data: { accession, documents: docs }, sources: [] };
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
          const { cik, name } = await cikFor(ticker);
          const facts = await getCompanyFacts(cik);
          const kf = resolveKeyFinancials(facts, periodKind, periods);
          const sources: Source[] = [];
          const byAccession = new Map<string, string>();
          const rows = kf.rows.map((r) => {
            let sourceId = byAccession.get(r.accession);
            if (!sourceId && r.accession) {
              const s = src("xbrl", `${name} ${r.form} filed ${r.filed} (XBRL financial data)`, filingUrlForFact(cik, { accn: r.accession } as Fact), "SEC EDGAR XBRL", r.filed);
              sources.push(s);
              byAccession.set(r.accession, s.id);
              sourceId = s.id;
            }
            return { ...r, sourceId: sourceId ?? null };
          });
          return { data: { company: name, periodKind, metrics: kf.metrics, rows, missing: kf.missing, notes: kf.notes }, sources };
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
          // One source per filing, not per row: several rows usually come from the same accession.
          const sources: Source[] = [];
          const byAccession = new Map<string, string>();
          for (const f of rows) {
            if (byAccession.has(f.accn)) continue;
            const s = src("xbrl", `${name} ${f.form} filed ${f.filed} (XBRL financial data)`, filingUrlForFact(cik, f), "SEC EDGAR XBRL", f.filed);
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
          const sources = items.map((n) => src("news", n.headline, n.url, n.source, n.publishedAt));
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
              return { fileId: f.id, name: f.name, kind: f.kind, path: f.path, modifiedTime: f.modifiedTime, docDate: f.docDate, summary: f.summary, sourceId: s.id };
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
              files: rows.map((r, i) => ({ fileId: r.id, name: r.name, kind: r.kind, ticker: r.ticker, path: r.path, mimeType: r.mimeType, modifiedTime: r.modifiedTime, size: r.size, sourceId: sources[i].id })),
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
          const byFile = new Map<string, Source>();
          const passages = hits.map((h) => {
            let s = byFile.get(h.fileId);
            if (!s) {
              s = driveSource(h.meta);
              byFile.set(h.fileId, s);
              sources.push(s);
            }
            return { fileId: h.fileId, name: h.meta.name, kind: h.meta.kind, ticker: h.meta.ticker, docDate: h.meta.docDate, seq: h.seq, score: h.score, text: h.text, sourceId: s.id };
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
          const s = driveSource(meta);
          return { data: { fileId, name: meta.name, kind: meta.kind, path: meta.path, modifiedTime: meta.modifiedTime, ...w, sourceId: s.id }, sources: [s] };
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
}

export type AgentTools = ReturnType<typeof makeTools>;
