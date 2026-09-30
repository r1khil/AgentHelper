import { describe, expect, it } from "vitest";
import {
  boardHref,
  canViewScope,
  earningsHref,
  holdingHref,
  isFundBookPath,
  modelHref,
  pathScope,
  resolveScope,
  scopedHref,
  scopeFor,
  scopeSlug,
  scopeSlugFromPath,
  sellSideHref,
  switchesScope,
} from "./scope";

const consumer = { id: "t-cc", slug: "consumer", name: "Consumer & Communication Services" };
const tech = { id: "t-it", slug: "tech", name: "Information Technology" };
const teams = [consumer, tech];

describe("scopeFor", () => {
  it("keeps the fund scope for any team's item", () => {
    expect(scopeFor("fund", "tech")).toBe("fund");
    expect(scopeFor("fund", "consumer")).toBe("fund");
  });
  it("keeps a team scope for its own items", () => {
    expect(scopeFor("consumer", "consumer")).toBe("consumer");
  });
  it("opens another team's item in that team", () => {
    expect(scopeFor("consumer", "tech")).toBe("tech");
  });
  it("uses the item's team when there is no scope in view", () => {
    expect(scopeFor(null, "tech")).toBe("tech");
    expect(scopeFor(undefined, "tech")).toBe("tech");
  });
  it("says when that changes the scope", () => {
    expect(switchesScope("fund", "tech")).toBe(false);
    expect(switchesScope("tech", "tech")).toBe(false);
    expect(switchesScope("consumer", "tech")).toBe(true);
    expect(switchesScope(null, "tech")).toBe(false);
  });
});

describe("scoped hrefs", () => {
  it("opens TSM earnings from the fund without switching to IT", () => {
    expect(earningsHref("fund", "tech", "e1")).toBe("/t/fund/earnings/e1");
    expect(earningsHref("tech", "tech", "e1")).toBe("/t/tech/earnings/e1");
    expect(earningsHref("consumer", "tech", "e1")).toBe("/t/tech/earnings/e1");
  });
  it("builds holding, board, model and call links the same way", () => {
    expect(holdingHref("fund", "tech", "TSM")).toBe("/t/fund/h/TSM");
    expect(holdingHref("fund", "tech", "TSM", "?tab=earnings")).toBe("/t/fund/h/TSM?tab=earnings");
    expect(holdingHref("consumer", "consumer", "BRK.B")).toBe("/t/consumer/h/BRK.B");
    expect(boardHref("fund", "tech", "TSM")).toBe("/t/fund/h/TSM?tab=threads");
    expect(boardHref("consumer", "tech", "TSM")).toBe("/t/tech/h/TSM?tab=threads");
    expect(boardHref("tech", "tech", "TSM", "c1")).toBe("/hoot/c1");
    expect(modelHref("consumer", "tech", "x1")).toBe("/t/tech/models/x1");
    expect(sellSideHref(null, "consumer", "s1")).toBe("/t/consumer/sell-side/s1");
  });
  it("encodes tickers", () => {
    expect(holdingHref("fund", "tech", "A/B")).toBe("/t/fund/h/A%2FB");
  });
  it("accepts paths with or without a leading slash, and none at all", () => {
    expect(scopedHref("fund", "tech", "earnings")).toBe("/t/fund/earnings");
    expect(scopedHref("fund", "tech", "/earnings")).toBe("/t/fund/earnings");
    expect(scopedHref("consumer", "tech")).toBe("/t/tech");
    expect(scopedHref("fund", "tech", "?filter=attention")).toBe("/t/fund?filter=attention");
  });
});

describe("pathScope", () => {
  it("reads the scope from /t/<slug>", () => {
    expect(scopeSlugFromPath("/t/tech/earnings/e1")).toBe("tech");
    expect(scopeSlugFromPath("/t/fund")).toBe("fund");
    expect(scopeSlugFromPath("/hoot/c1")).toBeNull();
    expect(pathScope("/t/tech/h/TSM", teams, true)).toBe("tech");
    expect(pathScope("/t/fund/agent", teams, true)).toBe("fund");
  });
  it("treats the fund's book pages as the fund, for execs and admins", () => {
    expect(isFundBookPath("/attribution/ledger")).toBe(true);
    expect(isFundBookPath("/daily")).toBe(true);
    expect(isFundBookPath("/riskier")).toBe(false);
    expect(pathScope("/risk", teams, true)).toBe("fund");
    expect(pathScope("/risk", teams, false)).toBeNull();
  });
  it("gives no scope to pages outside /t/ or to scopes the member can't view", () => {
    expect(pathScope("/", teams, true)).toBeNull();
    expect(pathScope("/hoot/c1", teams, true)).toBeNull();
    expect(pathScope("/t/fund", [consumer], false)).toBeNull();
    expect(pathScope("/t/healthcare", teams, true)).toBeNull();
  });
  it("knows who can view which scope", () => {
    expect(canViewScope("fund", teams, true)).toBe(true);
    expect(canViewScope("fund", [consumer], false)).toBe(false);
    expect(canViewScope("tech", [consumer], false)).toBe(false);
    expect(canViewScope("consumer", [consumer], false)).toBe(true);
    expect(canViewScope(null, teams, true)).toBe(false);
  });
});

describe("resolveScope", () => {
  const exec = { teams, fundWide: true, userTeamId: null };
  const analyst = { teams: [consumer], fundWide: false, userTeamId: consumer.id };

  it("follows the URL on /t/ pages", () => {
    expect(resolveScope({ ...exec, pathname: "/t/tech/h/TSM", remembered: "consumer" })).toBe(tech);
    expect(resolveScope({ ...exec, pathname: "/t/fund/earnings", remembered: "consumer" })).toBe("fund");
  });
  it("keeps the remembered scope on a general Hoot chat instead of falling back to the fund", () => {
    expect(resolveScope({ ...exec, pathname: "/hoot/c1", remembered: "consumer" })).toBe(consumer);
    expect(resolveScope({ ...exec, pathname: "/", remembered: "consumer" })).toBe(consumer);
    expect(resolveScope({ ...exec, pathname: "/backtesting", remembered: "fund" })).toBe("fund");
  });
  it("shows the fund on the fund's book pages whatever was remembered", () => {
    expect(resolveScope({ ...exec, pathname: "/attribution", remembered: "consumer" })).toBe("fund");
  });
  it("falls back to the fund for execs and the member's team otherwise", () => {
    expect(resolveScope({ ...exec, pathname: "/hoot/c1", remembered: null })).toBe("fund");
    expect(resolveScope({ ...exec, pathname: "/hoot/c1", remembered: "gone" })).toBe("fund");
    expect(resolveScope({ ...analyst, pathname: "/hoot/c1", remembered: "tech" })).toBe(consumer);
    expect(resolveScope({ ...analyst, pathname: "/t/fund", remembered: null })).toBe(consumer);
  });
  it("has no scope for a member with no team", () => {
    expect(resolveScope({ teams: [], fundWide: false, userTeamId: null, pathname: "/", remembered: null })).toBeNull();
  });
  it("turns a resolved scope back into its slug", () => {
    expect(scopeSlug("fund")).toBe("fund");
    expect(scopeSlug(tech)).toBe("tech");
    expect(scopeSlug(null)).toBeNull();
  });
});
