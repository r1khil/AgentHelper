import { describe, expect, it } from "vitest";
import type { Filing } from "@/lib/providers/types";
import { filingDocumentRows, isEarningsExhibit, listingSince, sinceFor } from "./filings-plan";

const now = new Date("2026-09-21T12:00:00Z");
const h = { id: "h1", ticker: "AXP", companyName: "AMERICAN EXPRESS CO" };

const filing = (over: Partial<Filing>): Filing => ({
  accession: "0000004962-26-000010",
  form: "10-Q",
  filedAt: "2026-07-20",
  reportDate: "2026-06-30",
  primaryDocument: "axp-20260630.htm",
  url: "https://www.sec.gov/Archives/edgar/data/4962/000000496226000010/axp-20260630.htm",
  indexUrl: "https://www.sec.gov/Archives/edgar/data/4962/000000496226000010/",
  ...over,
});

describe("sinceFor / listingSince", () => {
  it("uses the backfill windows when asked or when never synced", () => {
    expect(sinceFor("10-K", { backfill: true, lastSync: "2026-09-01", now })).toBe("2024-09-21");
    expect(sinceFor("8-K", { backfill: true, lastSync: null, now })).toBe("2026-06-23");
    expect(sinceFor("10-Q", { backfill: false, lastSync: null, now })).toBe("2024-09-21");
  });
  it("narrows an incremental run to the day before the last sync, never earlier than the window floor", () => {
    expect(sinceFor("10-K", { backfill: false, lastSync: "2026-09-01", now })).toBe("2026-08-31");
    expect(sinceFor("8-K", { backfill: false, lastSync: "2026-01-01", now })).toBe("2026-06-23");
    expect(listingSince({ backfill: false, lastSync: "2026-09-01", now })).toBe("2026-08-31");
    expect(listingSince({ backfill: true, lastSync: null, now })).toBe("2024-09-21");
  });
});

describe("filingDocumentRows", () => {
  it("maps primary documents onto corpus rows with the accession as version", () => {
    const rows = filingDocumentRows(h, [filing({})], {}, { backfill: true, lastSync: null, now });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "filing",
      externalId: "0000004962-26-000010/axp-20260630.htm",
      holdingId: "h1",
      ticker: "AXP",
      title: "AMERICAN EXPRESS CO 10-Q filed Jul 20, 2026",
      url: filing({}).url,
      publisher: "SEC EDGAR",
      docDate: "2026-06-30",
      form: "10-Q",
      version: "0000004962-26-000010",
    });
    expect(rows[0].publishedAt?.toISOString().slice(0, 10)).toBe("2026-07-20");
    expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("adds EX-99 exhibits for 8-Ks only and skips other exhibits", () => {
    const k8 = filing({ accession: "0000004962-26-000020", form: "8-K", filedAt: "2026-07-18", primaryDocument: "axp-8k.htm", reportDate: "2026-07-18" });
    const exhibits = {
      "0000004962-26-000020": [
        { name: "axp-8k.htm", url: "https://www.sec.gov/x/axp-8k.htm", type: "8-K", description: "8-K" },
        { name: "ex991.htm", url: "https://www.sec.gov/x/ex991.htm", type: "EX-99.1", description: "Press release" },
        { name: "ex101.htm", url: "https://www.sec.gov/x/ex101.htm", type: "EX-10.1", description: "Agreement" },
      ],
    };
    const rows = filingDocumentRows(h, [k8, filing({})], exhibits, { backfill: true, lastSync: null, now });
    expect(rows.map((r) => r.form)).toEqual(["8-K", "EX-99.1", "10-Q"]);
    expect(rows[1]).toMatchObject({ externalId: "0000004962-26-000020/ex991.htm", title: "AMERICAN EXPRESS CO EX-99.1 (Press release) filed Jul 18, 2026", url: "https://www.sec.gov/x/ex991.htm", version: "0000004962-26-000020" });
  });

  it("drops forms outside the set and filings older than their form's window", () => {
    const old8k = filing({ accession: "0000004962-25-000001", form: "8-K", filedAt: "2026-01-05" });
    const proxy = filing({ accession: "0000004962-26-000030", form: "DEF 14A" });
    const oldK = filing({ accession: "0000004962-24-000002", form: "10-K", filedAt: "2024-02-01" });
    const amended = filing({ accession: "0000004962-26-000031", form: "10-Q/A", filedAt: "2026-08-01" });
    const rows = filingDocumentRows(h, [old8k, proxy, oldK, amended], {}, { backfill: true, lastSync: null, now });
    expect(rows.map((r) => r.form)).toEqual(["10-Q/A"]);
  });

  it("recognizes earnings exhibits by type or file name", () => {
    expect(isEarningsExhibit({ name: "a.htm", url: "u", type: "EX-99.1" })).toBe(true);
    expect(isEarningsExhibit({ name: "axp-ex99_1.htm", url: "u" })).toBe(true);
    expect(isEarningsExhibit({ name: "a.htm", url: "u", type: "EX-10.1" })).toBe(false);
  });

  it("skips exhibit images and other non-text files even when their names carry ex99", () => {
    // EDGAR's index lists every image embedded in a press release as its own GRAPHIC row.
    expect(isEarningsExhibit({ name: "tm2625368d1_ex99-2img003.jpg", url: "u", type: "GRAPHIC" })).toBe(false);
    expect(isEarningsExhibit({ name: "ex99-1.jpg", url: "u", type: "EX-99.1" })).toBe(false);
    expect(isEarningsExhibit({ name: "ex991.pdf", url: "u", type: "EX-99.1" })).toBe(false);
    expect(isEarningsExhibit({ name: "ex991.htm", url: "u", type: "GRAPHIC" })).toBe(false);
    expect(isEarningsExhibit({ name: "nee-ex99_1.HTM", url: "u", type: "EX-99.1" })).toBe(true);
  });
});
