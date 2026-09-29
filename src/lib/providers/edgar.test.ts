import { describe, expect, it } from "vitest";
import { extractItem, htmlToText, listItemHeadings } from "./edgar";

const filler = (n: number) => Array.from({ length: n }, (_, i) => `Sentence ${i} about results of operations and liquidity.`).join(" ");

describe("htmlToText", () => {
  it("drops inline-XBRL header metadata and hidden blocks", () => {
    const html = `<html><body>
<div style="display:none"><ix:header><ix:hidden><ix:nonNumeric name="dei:DocumentType" contextRef="c-1">10-Q</ix:nonNumeric></ix:hidden><ix:references>iso4217:USD xbrli:shares c-1 2026-06-30</ix:references></ix:header></div>
<p>UNITED STATES SECURITIES AND EXCHANGE COMMISSION</p>
<table><tr><td>Item 2.</td><td>Management's Discussion and Analysis</td></tr></table>
</body></html>`;
    const text = htmlToText(html);
    expect(text).not.toContain("iso4217");
    expect(text).not.toContain("contextRef");
    expect(text).toContain("SECURITIES AND EXCHANGE COMMISSION");
    expect(text).toContain("Item 2.\tManagement's Discussion");
  });
});

describe("extractItem", () => {
  const doc = [
    "TABLE OF CONTENTS",
    "Item 1.\tFinancial Statements\t3",
    "Item 2.\tManagement's Discussion and Analysis\t20",
    "Item 3.\tQuantitative and Qualitative Disclosures\t40",
    "PART I",
    "Item 1.\tFinancial Statements",
    filler(30),
    "Item 2.\tManagement's Discussion and Analysis of Financial Condition and Results of Operations",
    filler(40),
    "Item 3.\tQuantitative and Qualitative Disclosures About Market Risk",
    filler(20),
  ].join("\n");

  it("finds a 10-Q Item 2 heading inside a table cell and returns the whole section", () => {
    const section = extractItem(doc, "2");
    expect(section).not.toBeNull();
    expect(section!.startsWith("\nItem 2.\tManagement's Discussion and Analysis of Financial Condition")).toBe(true);
    expect(section).toContain("Sentence 39");
    expect(section).not.toContain("Quantitative and Qualitative Disclosures About Market Risk");
    // Paging must be honest: no cap unless asked for.
    expect(section!.length).toBeGreaterThan(2000);
    expect(extractItem(doc, "2", 300)!.length).toBe(300);
  });

  it("does not match Item 1 when asked for Item 1A, nor Item 2.02 for Item 2", () => {
    const eightK = ["Item 2.02\tResults of Operations and Financial Condition", filler(20), "Item 9.01\tFinancial Statements and Exhibits", filler(20)].join("\n");
    expect(extractItem(eightK, "2")).toBeNull();
    expect(extractItem(eightK, "2.02")).not.toBeNull();
    expect(extractItem(doc, "1A")).toBeNull();
  });

  it("returns a short real section (a 10-K's Item 2 Properties) but never a contents line alone", () => {
    const tenK = [
      "Item 1.\tBusiness\t4",
      "Item 2.\tProperties\t25",
      "Item 3.\tLegal Proceedings\t26",
      "Item 1.\tBusiness",
      filler(30),
      "Item 2.\tProperties",
      "Our corporate headquarters are located in New York, New York, where we lease approximately 1.1 million square feet. We believe our facilities are adequate.",
      "Item 3.\tLegal Proceedings",
      filler(10),
    ].join("\n");
    const section = extractItem(tenK, "2");
    expect(section).toContain("1.1 million square feet");
    expect(section).not.toContain("Legal Proceedings\n");
    const tocOnly = ["Item 1.\tBusiness\t4", "Item 4.\tMine Safety Disclosures\t30", "Item 5.\tMarket\t31", "Item 1.\tBusiness", filler(30)].join("\n");
    expect(extractItem(tocOnly, "4")).toBeNull();
  });

  it("returns null and lets the caller list the headings when the item is absent", () => {
    expect(extractItem(doc, "7")).toBeNull();
    expect(listItemHeadings(doc)).toEqual(["1", "2", "3"]);
  });
});
