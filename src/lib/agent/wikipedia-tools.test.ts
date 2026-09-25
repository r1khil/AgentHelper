import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getCompanyBackground = vi.fn();
vi.mock("@/lib/providers/wikipedia", () => ({ getCompanyBackground: (...a: unknown[]) => getCompanyBackground(...a) }));

import type { BackgroundResult, CompanyBackground } from "@/lib/providers/wikipedia";
import type { ToolResult } from "./tools";
import { backgroundToolResult, makeWikipediaTools } from "./wikipedia-tools";

const company: CompanyBackground = {
  wikidataId: "Q312",
  wikidataUrl: "https://www.wikidata.org/wiki/Q312",
  wikidataModified: "2026-09-22T09:50:30Z",
  label: "Apple Inc.",
  description: "American multinational technology company",
  founded: "1976-04-01",
  headquarters: ["Cupertino"],
  ceo: { name: "John Ternus", since: "2026-09-01", current: true },
  industries: ["software industry"],
  founders: ["Steve Jobs", "Steve Wozniak"],
  parents: [],
  subsidiaries: { names: ["Beats Electronics", "Anobit"], total: 17 },
  listings: [{ exchange: "Nasdaq", ticker: "AAPL" }],
  website: "https://apple.com/",
  wikipedia: { title: "Apple Inc.", url: "https://en.wikipedia.org/wiki/Apple_Inc.", summary: "Apple Inc. is an American multinational technology company.", lastEdited: "2026-09-19T03:07:36Z" },
};
const found: BackgroundResult = { status: "found", matchedBy: "SEC CIK 0000320193 (AAPL)", retrievedAt: "2026-09-25T08:00:00.000Z", company };

const execute = (input: object) => makeWikipediaTools().get_company_background.execute!(input, { toolCallId: "t", messages: [] } as never) as Promise<ToolResult<Record<string, unknown> | null>>;

describe("get_company_background", () => {
  it("cites the Wikipedia article and the Wikidata entity, each with the retrieval date", () => {
    const r = backgroundToolResult(found);
    expect(r.sources.map((s) => [s.publisher, s.url, s.retrievedAt, s.publishedAt])).toEqual([
      ["Wikipedia", "https://en.wikipedia.org/wiki/Apple_Inc.", found.retrievedAt, "2026-09-19"],
      ["Wikidata", "https://www.wikidata.org/wiki/Q312", found.retrievedAt, "2026-09-22"],
    ]);
    expect(r.sources[1].excerpt).toContain("CEO John Ternus since 2026-09-01");
    const d = r.data as Record<string, unknown>;
    expect(d.retrievedOn).toBe("2026-09-25");
    expect((d.wikipedia as { sourceId: string }).sourceId).toBe(r.sources[0].id);
    expect(d.wikidataSourceId).toBe(r.sources[1].id);
    expect(d.subsidiaries).toMatchObject({ note: "first 2 of 17 listed" });
    expect(d.note).toMatch(/retrieved 2026-09-25.*filing wins.*financial figures/);
  });

  it("cites only Wikidata when there is no English article", () => {
    const r = backgroundToolResult({ ...found, company: { ...company, wikipedia: null } });
    expect(r.sources.map((s) => s.publisher)).toEqual(["Wikidata"]);
    expect((r.data as Record<string, unknown>).wikipedia).toBeNull();
  });

  it("hands back candidates and no sources when the company is ambiguous", () => {
    const r = backgroundToolResult({ status: "ambiguous", matchedBy: 'name search "Delta"', retrievedAt: found.retrievedAt, candidates: [{ wikidataId: "Q188920", label: "Delta Air Lines", description: null, wikipediaTitle: "Delta Air Lines" }] });
    expect(r.sources).toEqual([]);
    expect(r.data).toMatchObject({ status: "ambiguous", candidates: [{ wikidataId: "Q188920" }] });
    expect((r.data as { note: string }).note).toContain("wikidataId");
  });

  it("passes trimmed input through and reports failures as errors", async () => {
    getCompanyBackground.mockResolvedValueOnce(found);
    const ok = await execute({ ticker: " AAPL " });
    expect(getCompanyBackground).toHaveBeenLastCalledWith({ ticker: "AAPL", name: undefined, wikidataId: undefined }, undefined);
    expect(ok.sources).toHaveLength(2);

    getCompanyBackground.mockRejectedValueOnce(new Error("Wikimedia 503 for www.wikidata.org"));
    expect(await execute({ name: "Apple" })).toEqual({ data: null, sources: [], error: "Wikimedia 503 for www.wikidata.org" });

    const empty = await execute({});
    expect(empty.error).toMatch(/ticker, a company name or a wikidataId/);
  });
});
