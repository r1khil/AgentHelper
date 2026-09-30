import { describe, expect, it } from "vitest";
import { destinations } from "@/lib/nav";
import type { CommandHolding } from "@/lib/nav-data";
import { commandGroups, enterItem, formerPages, namesPage, typedQuestionTarget, type CommandInput } from "./command-groups";

const holding = (ticker: string, company: string, team = "Technology", teamSlug = "tech"): CommandHolding => ({
  ticker,
  company,
  team,
  teamSlug,
  weightPct: 3,
  nextReport: null,
  nextReportEstimated: false,
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
    expect(enter("risk")).toMatchObject({ kind: "page", page: { label: "Risk", href: "/t/tech/risk" } });
    expect(enter("What if")).toMatchObject({ kind: "page", page: { label: "What if" } });
    expect(enter("mark")).toMatchObject({ kind: "page", page: { label: "Markets", href: "/markets" } });
  });

  it("opens where a page from before the five screens went, and says so", () => {
    expect(enter("sell side")).toMatchObject({ kind: "page", page: { label: "Sell-side calls", href: "/t/tech/sell-side" } });
    expect(enter("models")).toMatchObject({ kind: "page", page: { label: "Models", href: "/t/tech/models" } });
    expect(enter("attrib")).toMatchObject({ kind: "page", page: { label: "Performance", href: "/t/tech/performance" } });
    expect(enter("backtest")).toMatchObject({ kind: "page", page: { label: "What if", href: "/t/tech/what-if" } });
    expect(enter("economic calendar")).toMatchObject({ kind: "page", page: { label: "Markets" } });
    expect(enter("daily")).toMatchObject({ kind: "page", page: { label: "Performance today", href: "/t/tech/performance?period=today" } });
    // Nothing to open for a page the member can't see: Performance needs the book.
    const pages = destinations({ scope: { slug: "tech" }, fundWide: false, seesBook: false });
    expect(enter("attribution", { pages })).toMatchObject({ kind: "ask" });
  });

  it("counts Hoot's name for a page, its keywords and its old names as names", () => {
    expect(enter("hoot")).toMatchObject({ kind: "page", page: { label: "Home" } });
    expect(enter("earnings")).toMatchObject({ kind: "page", page: { label: "Markets" } });
    expect(enter("research")).toMatchObject({ kind: "page", page: { label: "All threads", href: "/hoot" } });
    expect(enter("chats")).toMatchObject({ kind: "page", page: { label: "All threads" } });
    expect(enter("threads")).toMatchObject({ kind: "page", page: { label: "All threads" } });
    expect(formerPages("backt", base.pages)).toMatchObject([{ label: "What if", hint: expect.stringMatching(/What if view/) }]);
    expect(enter("analyzer")).toMatchObject({ kind: "page", page: { label: "Sell-side calls" } });
    expect(enter("changelog")).toMatchObject({ kind: "page", page: { label: "What's new" } });
    const fund = destinations({ scope: "fund", fundWide: true, seesBook: true });
    expect(enter("ledger", { pages: fund })).toMatchObject({ kind: "page", page: { label: "Activity", href: "/t/fund/activity" } });
  });

  it("opens the Portfolio for \"portfolio\", \"holdings\" and \"team page\"", () => {
    expect(enter("portfolio")).toMatchObject({ kind: "page", page: { label: "Portfolio" } });
    expect(enter("holdings")).toMatchObject({ kind: "page", page: { label: "Portfolio" } });
    expect(enter("team page")).toMatchObject({ kind: "page", page: { label: "Portfolio" } });
    // Without the book, the Portfolio has Positions and What if.
    const pages = destinations({ scope: { slug: "tech" }, fundWide: false, seesBook: false });
    expect(enter("portfolio", { pages })).toMatchObject({ kind: "page", page: { label: "Portfolio" } });
    const listed = run("portfolio", { pages }).flatMap((g) => g.items.flatMap((i) => (i.kind === "page" ? [i.page.label] : [])));
    expect(listed).toEqual(["Portfolio"]);
    expect(run("performance", { pages }).flatMap((g) => g.items.map((i) => i.kind))).toEqual(["ask"]);
  });

  it("keeps asking Hoot on the list, right after what the query names", () => {
    const groups = run("backtest");
    expect(groups.map((g) => g.label)).toEqual(["Go to", "Ask Hoot"]);
    expect(groups[1].items[0]).toMatchObject({ kind: "ask", text: "backtest" });
  });

  it("opens a holding for its ticker, or the start of it", () => {
    expect(enter("nvda")).toMatchObject({ kind: "holding", holding: { ticker: "NVDA" } });
    expect(enter("nv")).toMatchObject({ kind: "holding", holding: { ticker: "NVDA" } });
    expect(labels("nvda")[1]).toBe("Ask Hoot");
  });

  it("puts a holding's ticker ahead of a page it also starts", () => {
    // "mo" is Altria's ticker and the start of Models.
    expect(enter("mo")).toMatchObject({ kind: "holding", holding: { ticker: "MO" } });
    expect(labels("mo")[1]).toBe("Go to");
  });

  it("lists a holding's tabs, the one the query names first", () => {
    // "nvda model" names NVDA, lists the tab and keeps the typed question for Hoot, about NVDA.
    expect(enter("nvda model")).toMatchObject({ kind: "holding", holding: { ticker: "NVDA" } });
    expect(run("nvda model").find((g) => g.label === "Ask Hoot")?.items[0]).toMatchObject({ kind: "ask", text: "nvda model", ticker: "NVDA" });
    const tabs = (query: string) => run(query).flatMap((g) => g.items.flatMap((i) => (i.kind === "page" && i.id.startsWith("go:") ? [`${i.page.label} ${i.page.href}`] : [])));
    expect(tabs("nvda")).toEqual(["NVDA threads /t/tech/h/NVDA?tab=threads", "NVDA earnings /t/tech/h/NVDA?tab=earnings"]);
    expect(tabs("nvda model")).toEqual(["NVDA model /t/tech/h/NVDA?tab=model"]);
    expect(tabs("nvda filings")).toEqual(["NVDA filings & notes /t/tech/h/NVDA?tab=filings"]);
    // In the scope in view: the fund shows every team's holdings.
    expect(tabs("mo").map((t) => t.split(" ").pop())).toEqual(["/t/staples/h/MO?tab=threads", "/t/staples/h/MO?tab=earnings"]);
    expect(run("mo", { scopeSlug: "fund" }).flatMap((g) => g.items).find((i) => i.id === "go:threads:MO")).toMatchObject({ page: { href: "/t/fund/h/MO?tab=threads" } });
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
    expect(namesPage("m", { label: "Markets", href: "/markets" })).toBe(false);
    expect(formerPages("m", base.pages)).toEqual([]);
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
  it("asks a typed question on Enter, with the pages it names after", () => {
    expect(enter("what moved risk today", { mode: "ask" })).toMatchObject({ kind: "ask" });
    expect(run("risk today", { mode: "ask" })[0].label).toBe("Ask Hoot");
  });
  it("says Ask Hoot when the page has no name, and drops empty groups", () => {
    expect(run("", { mode: "ask", suggestions: ["x"] }).map((g) => g.label)).toEqual(["Ask Hoot", "Go to"]);
  });
});

describe("where a typed question goes", () => {
  it("goes to the holding's threads on a holding page", () => {
    expect(enter("what changed since earnings", { pageTicker: "NVDA", pageTeamSlug: "fund" })).toMatchObject({ kind: "ask", ticker: "NVDA", teamSlug: "fund" });
    expect(typedQuestionTarget({ teamSlug: "tech", pageTicker: "NVDA", pageTeamSlug: "fund" })).toEqual({ ticker: "NVDA", teamSlug: "fund" });
  });
  it("is a general conversation anywhere else", () => {
    expect(typedQuestionTarget({ teamSlug: "tech" })).toEqual({ ticker: null, teamSlug: "tech" });
  });
});
