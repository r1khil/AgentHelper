import { describe, expect, it } from "vitest";
import { cleanCompanyName, isAllCaps, pickCompanyName, titleCaseCompanyName } from "./company-name";

describe("titleCaseCompanyName", () => {
  it.each([
    ["AMAZON COM INC", "Amazon.com Inc"],
    ["MICROSOFT CORP", "Microsoft Corp"],
    ["TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD", "Taiwan Semiconductor Manufacturing Co Ltd"],
    ["AMERICAN EXPRESS CO", "American Express Co"],
    ["REPUBLIC SERVICES, INC.", "Republic Services, Inc."],
    ["MCKESSON CORP", "McKesson Corp"],
    ["NEXTERA ENERGY INC", "Nextera Energy Inc"],
    ["KKR & CO INC", "KKR & Co Inc"],
    ["BANK OF AMERICA CORP /DE/", "Bank of America Corp"],
    ["THE CIGNA GROUP", "The Cigna Group"],
    ["UNILEVER PLC", "Unilever Plc"],
    ["ENTERPRISE PRODUCTS PARTNERS L.P.", "Enterprise Products Partners L.P."],
    ["AT&T INC.", "AT&T Inc."],
    ["COCA-COLA CO", "Coca-Cola Co"],
    ["3M CO", "3M Co"],
    ["MCDONALD'S CORP", "McDonald's Corp"],
    ["PNC FINANCIAL SERVICES GROUP, INC.", "PNC Financial Services Group, Inc."],
    ["ISHARES MSCI GLOBAL GOLD MINERS ETF", "iShares MSCI Global Gold Miners ETF"],
    ["SPDR S&P REGIONAL BANKING ETF", "SPDR S&P Regional Banking ETF"],
    ["FIRST TRUST NASDAQ-100 TECHNOLOGY INDEX FUND", "First Trust NASDAQ-100 Technology Index Fund"],
    ["ISHARES US CONSUMER STAPLES ETF", "iShares US Consumer Staples ETF"],
    ["INVESCO QQQ TRUST, SERIES 1", "Invesco QQQ Trust, Series 1"],
    ["BERKSHIRE HATHAWAY HLDGS INTL", "Berkshire Hathaway Hldgs Intl"],
  ])("%s → %s", (input, expected) => {
    expect(titleCaseCompanyName(input)).toBe(expected);
  });

  it("leaves names that already have lower-case letters alone, apart from whitespace", () => {
    expect(titleCaseCompanyName("Alphabet Inc.")).toBe("Alphabet Inc.");
    expect(titleCaseCompanyName("iShares  Semiconductor ETF ")).toBe("iShares Semiconductor ETF");
    expect(titleCaseCompanyName("KKR & Co. Inc.")).toBe("KKR & Co. Inc.");
  });
});

describe("cleanCompanyName / isAllCaps", () => {
  it("decodes the entities Yahoo leaves in names", () => {
    expect(cleanCompanyName("Procter &amp; Gamble Company (The)")).toBe("Procter & Gamble Company (The)");
  });
  it("only counts names with letters and no lower case", () => {
    expect(isAllCaps("MICROSOFT CORP")).toBe(true);
    expect(isAllCaps("Meta Platforms, Inc.")).toBe(false);
    expect(isAllCaps("123")).toBe(false);
  });
});

describe("pickCompanyName", () => {
  it("prefers the provider's properly cased name over SEC capitals", () => {
    expect(pickCompanyName("AMZN", ["Amazon.com, Inc.", "AMAZON COM INC"])).toBe("Amazon.com, Inc.");
    expect(pickCompanyName("NEE", ["NextEra Energy, Inc.", "NEXTERA ENERGY INC"])).toBe("NextEra Energy, Inc.");
  });
  it("takes the first properly cased candidate, skipping capitals and missing names", () => {
    expect(pickCompanyName("META", [null, "Meta Platforms, Inc."])).toBe("Meta Platforms, Inc.");
    expect(pickCompanyName("MSFT", ["MICROSOFT CORP", "Microsoft Corporation"])).toBe("Microsoft Corporation");
  });
  it("title-cases the first candidate when every one is in capitals", () => {
    expect(pickCompanyName("MSFT", ["MICROSOFT CORP", "MICROSOFT CORPORATION"])).toBe("Microsoft Corp");
    expect(pickCompanyName("TSM", [undefined, "TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD"])).toBe("Taiwan Semiconductor Manufacturing Co Ltd");
  });
  it("ignores a candidate that is only the ticker, and falls back to the ticker", () => {
    expect(pickCompanyName("XYZ", ["XYZ", "XYZ HOLDINGS INC"])).toBe("Xyz Holdings Inc");
    expect(pickCompanyName("xyz", ["XYZ", ""])).toBe("XYZ");
  });
});
