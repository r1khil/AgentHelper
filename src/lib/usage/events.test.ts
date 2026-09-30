import { describe, expect, it } from "vitest";
import { cleanUsageEvent, usageRoute } from "./events";

describe("usageRoute", () => {
  it("replaces team, ticker and ids", () => {
    expect(usageRoute("/t/tech/h/NVDA")).toEqual({ route: "/t/:team/h/:ticker", team: "tech" });
    expect(usageRoute("/t/fund/risk")).toEqual({ route: "/t/:team/risk", team: "fund" });
    expect(usageRoute("/t/tech/earnings/abc-123")).toEqual({ route: "/t/:team/earnings/:id", team: "tech" });
    expect(usageRoute("/hoot/0f7c")).toEqual({ route: "/hoot/:id", team: null });
    expect(usageRoute("/weekly/2026-09-26")).toEqual({ route: "/weekly/:week", team: null });
  });

  it("leaves plain pages alone", () => {
    expect(usageRoute("/")).toEqual({ route: "/", team: null });
    expect(usageRoute("/admin")).toEqual({ route: "/admin", team: null });
    expect(usageRoute("/t/tech/earnings")).toEqual({ route: "/t/:team/earnings", team: "tech" });
  });
});

describe("cleanUsageEvent", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");

  it("drops unknown names and non-objects", () => {
    expect(cleanUsageEvent({ name: "nope" }, now)).toBeNull();
    expect(cleanUsageEvent("page_view", now)).toBeNull();
  });

  it("keeps a recent client time and replaces a wild one", () => {
    expect(cleanUsageEvent({ name: "page_view", at: "2026-09-29T11:59:00Z" }, now)?.at).toBe("2026-09-29T11:59:00.000Z");
    expect(cleanUsageEvent({ name: "page_view", at: "2020-01-01T00:00:00Z" }, now)?.at).toBe("2026-09-29T12:00:00.000Z");
  });

  it("drops oversized props", () => {
    expect(cleanUsageEvent({ name: "click", props: { label: "x".repeat(3000) } }, now)?.props).toEqual({});
    expect(cleanUsageEvent({ name: "click", props: { label: "hoot-corner" } }, now)?.props).toEqual({ label: "hoot-corner" });
  });

  it("keeps only numbers in a page view", () => {
    expect(cleanUsageEvent({ name: "page_view", props: { ms: "abc", vitals: { LCP: "x", INP: 80, CLS: 0.02 } } }, now)?.props).toEqual({ ms: 0, vitals: { INP: 80, CLS: 0.02 } });
    expect(cleanUsageEvent({ name: "page_view", props: { ms: 1234.6, vitals: "no" } }, now)?.props).toEqual({ ms: 1235 });
  });
});
