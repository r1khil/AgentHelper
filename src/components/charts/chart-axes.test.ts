import { describe, expect, it } from "vitest";
import { fmtPct } from "@/lib/format";
import { seriesAmount } from "./performance-chart";
import { valueAxis } from "./primitives";

describe("valueAxis on a rebased return chart", () => {
  it("labels returns in accounting style, with the 0% start as a tick", () => {
    // META and the S&P 500 over a year, both rebased to 0% at the first close.
    const axis = valueAxis([0, -29.8, 3.1, 17.2, 0.4, -3.6], fmtPct);
    expect(axis.ticks).toContain(0);
    expect(axis.ticks!.map(axis.tickFormatter)).toEqual(["(20%)", "(10%)", "0%", "10%"]);
    expect(axis.domain).toEqual([-29.8, 17.2]);
  });

  it("gives small moves the decimals they need", () => {
    const axis = valueAxis([0, 0.21, -0.44, 0.08], fmtPct);
    expect(axis.ticks!.map(axis.tickFormatter)).toEqual(["(0.4%)", "(0.2%)", "0.0%", "0.2%"]);
  });

  it("falls back to an automatic axis with no values", () => {
    expect(valueAxis([null, undefined], fmtPct).domain).toEqual(["auto", "auto"]);
  });
});

describe("seriesAmount", () => {
  it("prints a price in its currency, and an index level in points", () => {
    expect(seriesAmount(594.97, { currency: "USD" })).toBe("$594.97");
    expect(seriesAmount(-12.4, { currency: "USD" })).toBe("($12.40)");
    expect(seriesAmount(12.5, { currency: "eur" })).toBe("EUR 12.50");
    expect(seriesAmount(7798.99, { unit: "pts" })).toBe("7,798.99 pts");
    expect(seriesAmount(101.2, undefined)).toBe("101.20");
    expect(seriesAmount(null, { currency: "USD" })).toBe("Unavailable");
  });
});
