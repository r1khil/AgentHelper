import { describe, expect, it } from "vitest";
import { pageContextBlock, pageContextFromMessages, pageContextLabel, parsePageContext } from "./page-context";

const attribution = { kind: "attribution", path: "/t/fund/performance", title: "Fund attribution", scope: "fund", period: "1d", start: "2026-09-21", end: "2026-09-22" } as const;

describe("page context", () => {
  it("keeps a valid attribution context and drops a malformed URL date instead of the whole context", () => {
    expect(parsePageContext({ ...attribution, from: "yesterday" })).toEqual(attribution);
  });
  it("rejects unknown kinds and bad paths", () => {
    expect(parsePageContext({ ...attribution, kind: "admin" })).toBeNull();
    expect(parsePageContext({ ...attribution, path: "https://evil.example" })).toBeNull();
    expect(parsePageContext(undefined)).toBeNull();
  });
  it("uses the newest user message that carries a page", () => {
    const older = { kind: "page", path: "/", title: "Today" };
    const messages = [
      { role: "user", metadata: { page: older } },
      { role: "assistant", metadata: { page: attribution } },
      { role: "user", metadata: { page: attribution } },
      { role: "user" },
    ];
    expect(pageContextFromMessages(messages)).toEqual(attribution);
    expect(pageContextFromMessages([{ role: "user", metadata: { page: older } }])).toEqual(older);
    expect(pageContextFromMessages([{ role: "user", metadata: {} }])).toBeNull();
  });
  it("tells the agent the exact attribution call that reproduces the page", () => {
    const block = pageContextBlock(attribution);
    expect(block).toContain('get_attribution with { scope: "fund", period: "1d" }');
    expect(block).toContain("2026-09-21 close through the 2026-09-22 close");
    expect(pageContextLabel(attribution)).toBe("Fund attribution, 1D");
  });
  it("hands a backtest scenario over as run_backtest arguments", () => {
    const ctx = parsePageContext({ kind: "backtesting", path: "/t/fund/what-if", title: "Backtesting", from: "2026-06-22", to: "2026-09-21", benchmark: "SPY", changed: [{ ticker: "NVDA", savedPct: 4.1, scenarioPct: 10 }], ran: true })!;
    expect(pageContextBlock(ctx)).toContain('run_backtest with { from: "2026-06-22", to: "2026-09-21", benchmark: "SPY", weights: { "NVDA": 10 } }');
    expect(pageContextLabel(ctx)).toBe("What if, 2026-06-22 to 2026-09-21, 1 weight changed");
  });
  it("hands the Exposure page over as a get_portfolio_risk call citing the Exposure page", () => {
    const ctx = parsePageContext({ kind: "exposure", path: "/t/fig/exposure", title: "FIG exposure", scope: "team", team: "fig", lookback: "1y", asOf: "2026-09-24" })!;
    expect(ctx.kind).toBe("exposure");
    expect(pageContextBlock(ctx)).toContain('get_portfolio_risk with { scope: "team", team: "fig", lookback: "1y", page: "exposure" }');
    expect(pageContextBlock(ctx)).toContain("etfLookThrough");
    expect(pageContextLabel(ctx)).toBe("FIG exposure, 2026-09-24 close");
    expect(parsePageContext({ ...ctx, lookback: "5y" })).toBeNull();
  });
  it("includes added historical company tickers when handing a scenario to Hoot", () => {
    const ctx = parsePageContext({ kind: "backtesting", path: "/t/fund/what-if", title: "Backtesting", from: "2026-06-22", to: "2026-09-21", benchmark: "SPY", addedTickers: ["IBM"], changed: [{ ticker: "IBM", savedPct: 0, scenarioPct: 5 }, { ticker: "CASH", savedPct: 10, scenarioPct: 5 }], ran: false })!;
    expect(pageContextBlock(ctx)).toContain('addedTickers: ["IBM"], weights: { "IBM": 5, "CASH": 5 }');
  });
  it("hands the Daily page over as a get_daily_performance call and says whether it was live", () => {
    const ctx = parsePageContext({ kind: "daily", path: "/t/fig/performance", title: "FIG daily performance", scope: "team", team: "fig", session: "2026-09-28", status: "live" })!;
    expect(ctx.kind).toBe("daily");
    expect(pageContextBlock(ctx)).toContain('get_daily_performance with { scope: "team", team: "fig" }');
    expect(pageContextLabel(ctx)).toBe("FIG daily performance, live");
    expect(parsePageContext({ ...ctx, status: "maybe" })).toBeNull();
  });
});
