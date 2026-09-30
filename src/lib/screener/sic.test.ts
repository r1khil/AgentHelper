import { describe, expect, it } from "vitest";
import { exclusionReason, isMlpName, notScreenedReason, sicToGics } from "./sic";

describe("sicToGics", () => {
  it.each([
    ["3571", "information_technology"], // Apple
    ["3674", "information_technology"], // NVIDIA
    ["7372", "information_technology"], // Microsoft
    ["7370", "communication_services"], // Alphabet, Meta
    ["2834", "health_care"], // Pfizer
    ["3841", "health_care"], // medical instruments
    ["2080", "consumer_staples"], // beverages
    ["5411", "consumer_staples"], // Kroger
    ["5331", "consumer_staples"], // Walmart, Costco
    ["5961", "consumer_discretionary"], // Amazon
    ["3711", "consumer_discretionary"], // automakers
    ["1531", "consumer_discretionary"], // homebuilders
    ["2911", "energy"], // refiners
    ["1311", "energy"],
    ["4922", "energy"], // gas pipelines
    ["4911", "utilities"],
    ["4953", "industrials"], // waste
    ["3531", "industrials"], // Caterpillar
    ["3721", "industrials"], // aircraft
    ["2821", "materials"],
    ["1040", "materials"],
    ["4813", "communication_services"],
    ["7841", "communication_services"], // Netflix
    ["6798", "real_estate"],
    ["6022", "financials"],
    ["5122", "health_care"], // drug wholesale
    ["5140", "consumer_staples"], // Sysco
  ])("SIC %s → %s", (sic, sector) => {
    expect(sicToGics(sic)).toBe(sector);
  });
  it("returns null for missing or unmapped codes", () => {
    expect(sicToGics(null)).toBeNull();
    expect(sicToGics("")).toBeNull();
    expect(sicToGics("9995")).toBeNull();
  });
});

describe("exclusionReason", () => {
  it.each([
    ["6022", "Acme Bancorp", "Bank or lender"],
    ["6199", "Card Co", "Bank or lender"],
    ["6211", "Broker Inc", "Broker-dealer"],
    ["6311", "Life Co", "Insurer"],
    ["6411", "Agency Co", "Insurer"],
    ["6770", "Acquisition Corp I", "SPAC or shell company"],
    ["6798", "Realty Income Corp", "REIT"],
    ["6726", "Closed-End Fund", "Trust, fund or holding vehicle"],
    ["4922", "Enterprise Products Partners L.P.", "MLP"],
    [null, "No Code Inc", "No SIC code on file"],
  ])("SIC %s %s → %s", (sic, name, reason) => {
    expect(exclusionReason({ sic, name })).toBe(reason);
  });
  it("keeps operating companies, exchanges and asset managers", () => {
    expect(exclusionReason({ sic: "3571", name: "Apple Inc." })).toBeNull();
    expect(exclusionReason({ sic: "6200", name: "CME Group Inc." })).toBeNull();
    expect(exclusionReason({ sic: "6282", name: "T. Rowe Price Group" })).toBeNull();
  });
  it("recognizes MLP names", () => {
    expect(isMlpName("Energy Transfer LP")).toBe(true);
    expect(isMlpName("MPLX LP")).toBe(true);
    expect(isMlpName("Western Midstream Partners, LP")).toBe(true);
    expect(isMlpName("Alphabet Inc.")).toBe(false);
    expect(isMlpName("LPL Financial Holdings")).toBe(false);
  });
});

describe("notScreenedReason", () => {
  it("lists 20-F and 40-F filers as not screened", () => {
    expect(notScreenedReason("20-F")).toMatch(/not screened/);
    expect(notScreenedReason("40-F")).toMatch(/40-F/);
    expect(notScreenedReason("10-K")).toBeNull();
    expect(notScreenedReason(null)).toBe("No annual report on file");
  });
});
