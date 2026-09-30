import { describe, expect, it } from "vitest";
import { parseCnbcDailyBars } from "./cnbc";

describe("parseCnbcDailyBars", () => {
  it("reads the trade date and close, skipping bars without a close", () => {
    const json = {
      barData: {
        priceBars: [
          { close: "2302.5282", tradeTime: "20260921000000" },
          { close: "", tradeTime: "20260922000000" },
          { close: "2287.8110", tradeTime: "20260923000000" },
        ],
      },
    };
    expect(parseCnbcDailyBars(json)).toEqual([
      { date: "2026-09-21", close: 2302.5282 },
      { date: "2026-09-23", close: 2287.811 },
    ]);
  });

  it("fails loudly when the feed changes shape", () => {
    expect(() => parseCnbcDailyBars({ error: "nope" })).toThrow("no price bars");
  });
});
