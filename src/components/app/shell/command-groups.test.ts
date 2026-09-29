import { describe, expect, it } from "vitest";
import { destinations } from "@/lib/nav";
import type { CommandHolding } from "@/lib/nav-data";
import { commandGroups, enterItem, namesPage, typedQuestionTarget, type CommandInput } from "./command-groups";

const holding = (ticker: string, company: string, team = "Technology", teamSlug = "tech"): CommandHolding => ({
  ticker,
  company,
  team,
  teamSlug,
  weightPct: 3,
  nextReport: null,
  nextReportEstimated: false,
  openMovement: false,
});

const base: CommandInput = {
  query: "",
  holdings: [holding("NVDA", "NVIDIA Corp"), holding("AAPL", "Apple Inc"), holding("MO", "Altria Group", "Consumer Staples", "staples")],
  pages: destinations({ scope: { slug: "tech" }, fundWide: true, seesBook: true }),
  scopes: [
    { label: "Whole fund", href: "/t/fund" },
    { label: "Financials", href: "/t/fin" },
  ],
  teamSlug: "tech",
  scopeSlug: "tech",
  dark: false,
};

const run = (query: string, extra: Partial<CommandInput> = {}) => commandGroups({ ...base, query, ...extra });
const enter = (query: string, extra: Partial<CommandInput> = {}) => enterItem(run(query, extra));
const labels = (query: string, extra: Partial<CommandInput> = {}) => run(query, extra).map((g) => g.label);

describe("⌘K Enter rule", () => {
  it("opens the page a word names instead of asking Hoot", () => {
    expect(enter("movement")).toMatchObject({ kind: "page", page: { label: "Movements" } });
    expect(enter("Movements")).toMatchObject({ kind: "page", page: { label: "Movements" } });
    expect(enter("attrib")).toMatchObject({ kind: "page", page: { label: "Performance" } });
    expect(enter("sell side")).toMatchObject({ kind: "page", page: { label: "Sell-side calls" } });
  });

  it("counts Hoot's name for a page and its keywords as names", () => {
    expect(enter("hoot")).toMatchObject({ kind: "page", page: { label: "Research" } });
    expect(enter("earnings")).toMatchObject({ kind: "page", page: { label: "Earnings" } });
    expect(enter("research")).toMatchObject({ kind: "page", page: { label: "Research" } });
    expect(enter("analyzer")).toMatchObject({ kind: "page", page: { label: "Sell-side calls" } });
  });

  it("opens the Portfolio for \"portfolio\", and the team page for \"holdings\"", () => {
    expect(enter("portfolio")).toMatchObject({ kind: "page", page: { label: "Portfolio" } });
    expect(enter("holdings")).toMatchObject({ kind: "page", page: { label: "Team page" } });
    // Without the book, the Portfolio section is Backtesting alone.
    const pages = destinations({ scope: { slug: "tech" }, fundWide: false, seesBook: false });
    expect(enter("portfolio", { pages })).toMatchObject({ kind: "page", page: { label: "Backtesting" } });
    const listed = run("portfolio", { pages }).flatMap((g) => g.items.flatMap((i) => (i.kind === "page" ? [i.page.label] : [])));
    expect(listed).toEqual(["Backtesting"]);
  });

  it("keeps asking Hoot on the list, right after what the query names", () => {
    const groups = run("movement");
    expect(groups.map((g) => g.label)).toEqual(["Go to", "Ask Hoot"]);
    expect(groups[1].items[0]).toMatchObject({ kind: "ask", text: "movement" });
  });

  it("opens a holding for its ticker, or the start of it", () => {
    expect(enter("nvda")).toMatchObject({ kind: "holding", holding: { ticker: "NVDA" } });
    expect(enter("nv")).toMatchObject({ kind: "holding", holding: { ticker: "NVDA" } });
    expect(labels("nvda")[1]).toBe("Ask Hoot");
  });

  it("puts a holding's ticker ahead of a page it also starts", () => {
    // "mo" is Altria's ticker and the start of Movements and Models.
    expect(enter("mo")).toMatchObject({ kind: "holding", holding: { ticker: "MO" } });
    expect(labels("mo")[1]).toBe("Go to");
  });

  it("asks Hoot when the text names nothing", () => {
    expect(enter("what moved our holdings today")).toMatchObject({ kind: "ask", id: "ask:free", ticker: null, teamSlug: "tech" });
    expect(enter("risk of a rate cut")).toMatchObject({ kind: "ask" });
  });

  it("sends Hoot's commands to Hoot, which runs them without a chat", () => {
    expect(enter("take me to holdings")).toMatchObject({ kind: "ask", text: "take me to holdings" });
    expect(enter("turn on light mode")).toMatchObject({ kind: "ask", text: "turn on light mode" });
  });

  it("switches to the theme the query names", () => {
    expect(enter("dark mode")).toMatchObject({ kind: "theme", theme: "dark" });
    expect(enter("light mode")).toMatchObject({ kind: "theme", theme: "light" });
    expect(enter("light mode", { dark: true })).toMatchObject({ kind: "theme", theme: "light" });
    expect(enter("theme", { dark: true })).toMatchObject({ kind: "theme", theme: "light" });
  });

  it("switches scope when the query names one", () => {
    expect(enter("financ")).toMatchObject({ kind: "scope", scope: { label: "Financials" } });
    expect(enter("fund")).toMatchObject({ kind: "scope", scope: { label: "Whole fund" } });
  });

  it("leaves a loose company match ahead of the question, as before", () => {
    expect(enter("apple")).toMatchObject({ kind: "holding", holding: { ticker: "AAPL" } });
  });

  it("ignores single letters as page names", () => {
    expect(namesPage("m", { label: "Movements", href: "/t/tech/movements" })).toBe(false);
  });
});

describe("⌘K with nothing typed", () => {
  it("lists pages first, then the page's starting questions for Hoot", () => {
    const groups = run("", { suggestions: ["What moved our holdings today versus the S&P 500, and why?"] });
    expect(groups.map((g) => g.label)).toEqual(["Go to", "Ask Hoot"]);
    expect(enterItem(groups)).toMatchObject({ kind: "page", page: { label: "Home" } });
    expect(groups[1].items[0]).toMatchObject({ kind: "suggest" });
  });
});

describe("⌘J with nothing typed", () => {
  const recent = [{ title: "Why are we behind since Sep 17?", href: "/hoot/c1", at: "2026-09-28T18:39:00Z" }];
  it("asks about the page first, then recent answers, then three pages", () => {
    const groups = run("", { mode: "ask", pageLabel: "Risk", recent, suggestions: ["Which holdings add the most risk for their size?"] });
    expect(groups.map((g) => g.label)).toEqual(["Ask about Risk", "Recent answers", "Go to"]);
    expect(enterItem(groups)).toMatchObject({ kind: "suggest" });
    expect(groups[1].items[0]).toMatchObject({ kind: "recent", chat: { href: "/hoot/c1" } });
    expect(groups[2].items).toHaveLength(3);
  });
  it("says Ask Hoot when the page has no name, and drops empty groups", () => {
    expect(run("", { mode: "ask", suggestions: ["x"] }).map((g) => g.label)).toEqual(["Ask Hoot", "Go to"]);
  });
});

describe("where a typed question goes", () => {
  it("goes to the holding's research on a holding page", () => {
    expect(enter("what changed since earnings", { pageTicker: "NVDA", pageTeamSlug: "fund" })).toMatchObject({ kind: "ask", ticker: "NVDA", teamSlug: "fund" });
    expect(typedQuestionTarget({ teamSlug: "tech", pageTicker: "NVDA", pageTeamSlug: "fund" })).toEqual({ ticker: "NVDA", teamSlug: "fund" });
  });
  it("is a general conversation anywhere else", () => {
    expect(typedQuestionTarget({ teamSlug: "tech" })).toEqual({ ticker: null, teamSlug: "tech" });
  });
});
