import { describe, expect, it, vi } from "vitest";
vi.mock("./cache", () => ({ cached: async (_k: string, _t: number, fn: () => unknown) => fn() }));
vi.mock("./edgar", () => ({ listFilings: vi.fn(), listFilingDocuments: vi.fn(async () => [{ name: "doc.xml", url: "https://www.sec.gov/Archives/x/doc.xml" }, { name: "index.xml", url: "u" }]) }));
import { form4XmlUrl, netOfficerSales, parseForm4Meta, parseForm4Xml } from "./edgar-form4";

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

describe("Form 4 metadata and officer selling", () => {
  const officerSale = `<ownershipDocument><aff10b5One>0</aff10b5One><reportingOwner><reportingOwnerId><rptOwnerName>Doe Jane</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>CFO</officerTitle></reportingOwnerRelationship></reportingOwner>
<nonDerivativeTable><nonDerivativeTransaction><transactionDate><value>2026-08-05</value></transactionDate><transactionCoding><transactionCode>S</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>1000</value></transactionShares><transactionPricePerShare><value>61.20</value><footnoteId id="F1"/></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>`;
  const planSale = officerSale.replace("<aff10b5One>0</aff10b5One>", "<aff10b5One>1</aff10b5One>");
  const footnotePlan = officerSale.replace("</ownershipDocument>", "<footnotes><footnote id=\"F1\">Sold pursuant to a Rule 10b5-1 trading plan adopted May 1, 2025.</footnote></footnotes></ownershipDocument>");
  const notPlan = officerSale.replace("</ownershipDocument>", "<footnotes><footnote id=\"F1\">This sale was not made pursuant to a Rule 10b5-1 plan.</footnote></footnotes></ownershipDocument>");
  const directorBuy = `<ownershipDocument><reportingOwner><reportingOwnerId><rptOwnerName>Roe Rick</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isDirector>true</isDirector></reportingOwnerRelationship></reportingOwner><nonDerivativeTable><nonDerivativeTransaction><transactionDate><value>2026-08-06</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>500</value></transactionShares><transactionPricePerShare><value>60</value></transactionPricePerShare></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>`;

  it("reads a price followed by a footnote reference", () => {
    expect(parseForm4Xml(officerSale)[0]).toMatchObject({ code: "S", shares: 1000, pricePerShare: 61.2, relationship: "CFO" });
  });
  it("reads roles and the 10b5-1 box, with the footnote as a fallback", () => {
    expect(parseForm4Meta(officerSale)).toEqual({ isOfficer: true, isDirector: false, officerTitle: "CFO", aff10b5One: false });
    expect(parseForm4Meta(planSale).aff10b5One).toBe(true);
    expect(parseForm4Meta(footnotePlan).aff10b5One).toBe(true);
    expect(parseForm4Meta(notPlan).aff10b5One).toBe(false);
    expect(parseForm4Meta(directorBuy)).toMatchObject({ isOfficer: false, isDirector: true });
  });
  it("nets officers' open-market sales, leaving out plan sales, directors and old trades", () => {
    const filing = (xml: string, accession: string) => ({ accession, filedAt: "2026-08-07", url: "u", transactions: parseForm4Xml(xml), ...parseForm4Meta(xml) });
    const out = netOfficerSales([filing(officerSale, "a"), filing(planSale, "b"), filing(directorBuy, "c"), { accession: "d", filedAt: "2026-08-07", url: "u", transactions: [], parseError: "bad" }], "2026-04-01");
    expect(out).toEqual({ soldUsd: 61200, boughtUsd: 0, netUsd: 61200, netShares: 1000, planSalesExcluded: 1, officers: ["Doe Jane"], unparsed: 1 });
    expect(netOfficerSales([filing(officerSale, "a")], "2026-09-01").netUsd).toBe(0);
  });
});
