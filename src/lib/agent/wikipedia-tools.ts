import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getCompanyBackground, type BackgroundResult, type CompanyBackground, type Fetcher } from "@/lib/providers/wikipedia";
import { sourceId, type Source } from "@/lib/providers/types";
import type { ToolResult } from "./tools";

const day = (iso: string | null | undefined) => iso?.slice(0, 10);

/** One line of the structured facts, for the Wikidata source's excerpt. */
function factLine(c: CompanyBackground) {
  return [
    c.description,
    c.founded && `founded ${c.founded}`,
    c.founders.length && `founders ${c.founders.join(", ")}`,
    c.headquarters.length && `headquarters ${c.headquarters.join(", ")}`,
    c.ceo && `CEO ${c.ceo.name}${c.ceo.since ? ` since ${c.ceo.since}` : ""}${c.ceo.current ? "" : " (no current CEO recorded)"}`,
    c.industries.length && `industry ${c.industries.join(", ")}`,
  ]
    .filter(Boolean)
    .join("; ")
    .slice(0, 360);
}

/** The Wikipedia article and the Wikidata entity, each carrying the date it was retrieved. */
export function backgroundSources(c: CompanyBackground, retrievedAt: string): { wikipedia: Source | null; wikidata: Source } {
  const wikidata: Source = {
    id: sourceId("wikidata", `${c.wikidataId}:${c.wikidataModified ?? ""}`),
    title: `${c.label} (Wikidata ${c.wikidataId})`,
    url: c.wikidataUrl,
    publisher: "Wikidata",
    publishedAt: day(c.wikidataModified),
    retrievedAt,
    sourceType: "Wikidata entity",
    excerpt: factLine(c),
  };
  const wikipedia: Source | null = c.wikipedia
    ? {
        id: sourceId("wiki", `${c.wikipedia.url}:${c.wikipedia.lastEdited ?? ""}`),
        title: `${c.wikipedia.title} — Wikipedia`,
        url: c.wikipedia.url,
        publisher: "Wikipedia",
        publishedAt: day(c.wikipedia.lastEdited),
        retrievedAt,
        sourceType: "Wikipedia article",
        excerpt: c.wikipedia.summary.slice(0, 360),
      }
    : null;
  return { wikipedia, wikidata };
}

export function backgroundToolResult(r: BackgroundResult): ToolResult<unknown> {
  const retrieved = day(r.retrievedAt);
  if (r.status !== "found") {
    return {
      data: {
        status: r.status,
        matchedBy: r.matchedBy,
        candidates: r.candidates,
        note: r.candidates.length
          ? "Not sure which company is meant. Pick the right candidate (ask the member if unclear) and call again with its wikidataId."
          : "No company found on Wikidata or Wikipedia. Try the full company name.",
      },
      sources: [],
    };
  }
  const c = r.company;
  const { wikipedia, wikidata } = backgroundSources(c, r.retrievedAt);
  return {
    data: {
      status: r.status,
      matchedBy: r.matchedBy,
      retrievedOn: retrieved,
      company: c.label,
      description: c.description,
      founded: c.founded,
      headquarters: c.headquarters,
      ceo: c.ceo,
      industries: c.industries,
      founders: c.founders,
      parents: c.parents,
      subsidiaries: c.subsidiaries.total > c.subsidiaries.names.length ? { ...c.subsidiaries, note: `first ${c.subsidiaries.names.length} of ${c.subsidiaries.total} listed` } : c.subsidiaries,
      listings: c.listings,
      website: c.website,
      wikipedia: c.wikipedia ? { title: c.wikipedia.title, url: c.wikipedia.url, lastEdited: day(c.wikipedia.lastEdited), summary: c.wikipedia.summary, sourceId: wikipedia!.id } : null,
      wikidataId: c.wikidataId,
      wikidataSourceId: wikidata.id,
      note: `Community-edited background retrieved ${retrieved}. Leadership and structure can lag; when a filing (proxy, 10-K, 8-K) disagrees, the filing wins. Never cite this for financial figures.`,
    },
    sources: wikipedia ? [wikipedia, wikidata] : [wikidata],
  };
}

/** Company background from Wikipedia and Wikidata: history, leadership and structure, never numbers. */
export function makeWikipediaTools(opts: { fetcher?: Fetcher } = {}): ToolSet {
  return {
    get_company_background: tool({
      description:
        "Background on a company from Wikipedia and Wikidata: what it does, when and by whom it was founded, headquarters, CEO, industry, parent and subsidiaries, stock listings, website, and the Wikipedia article's summary. Use it for history, leadership and corporate structure, e.g. who runs a company, who owns it, or what a company unfamiliar to the member is. Pass a ticker (resolved through the SEC CIK) or a company name; if the result lists candidates, call again with the right wikidataId. Never use it for financial figures (revenue, employees, market value): filings and XBRL win. Wikipedia is community-edited and facts such as the CEO can be stale, so state the retrieval date when citing it and prefer a filing (proxy statement, 10-K, 8-K) when they disagree.",
      inputSchema: z.object({
        ticker: z.string().optional().describe("Ticker symbol, e.g. NVDA"),
        name: z.string().optional().describe("Company name, when there is no ticker (private companies, subsidiaries, foreign firms)"),
        wikidataId: z.string().regex(/^Q\d+$/i).optional().describe("A candidate's wikidataId from an earlier ambiguous result"),
      }),
      execute: async ({ ticker, name, wikidataId }): Promise<ToolResult<unknown>> => {
        try {
          if (!ticker?.trim() && !name?.trim() && !wikidataId) throw new Error("Pass a ticker, a company name or a wikidataId.");
          return backgroundToolResult(await getCompanyBackground({ ticker: ticker?.trim() || undefined, name: name?.trim() || undefined, wikidataId }, opts.fetcher));
        } catch (e) {
          return { data: null, sources: [], error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
  };
}
