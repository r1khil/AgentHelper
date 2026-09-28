import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {} }));

import { consensusFigures } from "./earnings";

const yahooTsm = { date: "2026-10-15", isEstimate: false, epsEstimate: 4.4614, revenueEstimate: 1454935426950, epsCurrency: "USD", revenueCurrency: "TWD" };
const finnhubTsm = { date: "2026-10-14", isEstimate: true, epsEstimate: 28.9619, revenueEstimate: 1479386868558, epsCurrency: "TWD", revenueCurrency: "TWD" };

describe("consensusFigures", () => {
  it("keeps each figure's own currency (TSM: EPS per ADR in USD, revenue in TWD)", () => {
    expect(consensusFigures(yahooTsm, finnhubTsm)).toEqual({ epsEstimate: "4.4614", epsCurrency: "USD", revenueEstimate: "1454935426950", revenueCurrency: "TWD" });
  });

  it("takes a missing figure and its currency together from Finnhub", () => {
    expect(consensusFigures({ ...yahooTsm, epsEstimate: undefined }, finnhubTsm)).toMatchObject({ epsEstimate: "28.9619", epsCurrency: "TWD", revenueCurrency: "TWD" });
  });

  it("leaves the currency unknown when the provider gave none, and empty when there is no figure", () => {
    expect(consensusFigures({ date: "2026-10-15", isEstimate: true, epsEstimate: 1.2 }, null)).toEqual({ epsEstimate: "1.2", epsCurrency: null, revenueEstimate: null, revenueCurrency: null });
  });
});
