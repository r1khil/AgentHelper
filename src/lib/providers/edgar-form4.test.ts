import { describe, expect, it, vi } from "vitest";
vi.mock("./cache", () => ({ cached: async (_k: string, _t: number, fn: () => unknown) => fn() }));
vi.mock("./edgar", () => ({ listFilings: vi.fn(), listFilingDocuments: vi.fn(async () => [{ name: "doc.xml", url: "https://www.sec.gov/Archives/x/doc.xml" }, { name: "index.xml", url: "u" }]) }));
import { form4XmlUrl, parseForm4Xml } from "./edgar-form4";

const xml = `<?xml version="1.0"?><ownershipDocument><reportingOwner><reportingOwnerId><rptOwnerName>Squeri Stephen J</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isDirector>1</isDirector><isOfficer>1</isOfficer><officerTitle>Chairman and CEO</officerTitle></reportingOwnerRelationship></reportingOwner>
<nonDerivativeTable><nonDerivativeTransaction><securityTitle><value>Common Stock</value></securityTitle><transactionDate><value>2026-08-05</value></transactionDate><transactionCoding><transactionCode>S</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>25000</value></transactionShares><transactionPricePerShare><value>312.50</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts><postTransactionAmounts><sharesOwnedFollowingTransaction><value>410000</value></sharesOwnedFollowingTransaction></postTransactionAmounts></nonDerivativeTransaction>
<nonDerivativeTransaction><transactionDate><value>2026-08-05</value></transactionDate><transactionCoding><transactionCode>F</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>100</value></transactionShares><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>`;

describe("parseForm4Xml", () => {
  it("extracts owner, role and each non-derivative transaction", () => {
    const rows = parseForm4Xml(xml);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ owner: "Squeri Stephen J", relationship: "Chairman and CEO, Director", date: "2026-08-05", code: "S", acquiredDisposed: "D", shares: 25000, pricePerShare: 312.5, sharesOwnedAfter: 410000, security: "Common Stock" });
    expect(rows[1].pricePerShare).toBeNull();
  });
  it("returns nothing for a document without transactions", () => {
    expect(parseForm4Xml("<ownershipDocument></ownershipDocument>")).toEqual([]);
  });
});

describe("form4XmlUrl", () => {
  it("strips the XSL rendering segment from the primary document", async () => {
    expect(await form4XmlUrl("4962", { accession: "a", url: "https://www.sec.gov/Archives/edgar/data/4962/000000496226000300/xslF345X05/wk-form4_1.xml", primaryDocument: "xslF345X05/wk-form4_1.xml" })).toBe("https://www.sec.gov/Archives/edgar/data/4962/000000496226000300/wk-form4_1.xml");
  });
  it("falls back to the first non-index xml in the filing index", async () => {
    expect(await form4XmlUrl("4962", { accession: "a", url: "https://www.sec.gov/Archives/x/form4.html", primaryDocument: "form4.html" })).toBe("https://www.sec.gov/Archives/x/doc.xml");
  });
});
