import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("./model", () => ({ AGENT_MODELS: [{ id: "a" }], agentModelId: async () => "a", chatModel: (id: string) => ({ id, modelId: id, provider: "mock" }) }));
vi.mock("./mcp", () => ({ loadMcpTools: async () => ({ tools: {}, servers: [], instructions: [] }) }));
vi.mock("./instructions", () => ({ buildInstructions: async () => "SYS" }));
vi.mock("@/lib/pt-sheet/read", () => ({ ptSheetConfigured: () => true, readPtSheet: vi.fn() }));
// Every optional provider on, so every tool Hoot can have is registered.
vi.mock("@/lib/web/tavily", async (original) => ({ ...(await original<object>()), tavilyConfigured: () => true }));
vi.mock("@/lib/providers/fred", async (original) => ({ ...(await original<object>()), fredConfigured: () => true }));
vi.mock("@/lib/sandbox/python", async (original) => ({ ...(await original<object>()), sandboxAvailable: () => true }));

import { buildAgentDefinition } from "./definition";
import { EVAL_CASES } from "./eval/cases";
import { PROPOSAL_TOOLS } from "@/lib/hoot/proposals";
import { activeToolsFor, CORE, FOLLOW_UPS, RETIRED, routingFromMessages, TIERS, toolsNamedOnPage, WRITE } from "./tool-routing";
import type { PageContext } from "./page-context";

const viewer = (role: string) => ({ id: "u1", role, teamId: "t1", team: { id: "t1", slug: "tech", name: "Information Technology" }, fullName: "U", transparencyMode: false }) as never;

/** Every tool a chat turn can register: an exec in a saved chat whose message asks for every kind of change. */
async function allRegisteredTools(): Promise<string[]> {
  const def = await buildAgentDefinition({
    teamId: "t1",
    holdingId: "h1",
    user: { id: "u1", fullName: "U", role: "exec" },
    viewer: viewer("exec"),
    chatId: "c1",
    purpose: "chat",
    memberTexts: ["add a note, pin this chat to the board, dismiss that reminder and record the trades in the ledger"],
  });
  return Object.keys(def.tools);
}

const grouped = () => [...CORE, ...Object.values(TIERS).flat(), ...RETIRED, ...WRITE] as string[];

describe("tool tiers", () => {
  it("put every registered tool in exactly one of CORE, a tier, WRITE or RETIRED", async () => {
    const names = await allRegisteredTools();
    expect(names.length).toBeGreaterThan(40);
    const all = grouped();
    const untiered = names.filter((n) => !all.includes(n));
    expect(untiered, "a new tool needs a tier in tool-routing.ts, or the model never sees it").toEqual([]);
    const twice = all.filter((n, i) => all.indexOf(n) !== i);
    expect(twice).toEqual([]);
    // And nothing listed is a name no tool has.
    expect(all.filter((n) => !names.includes(n))).toEqual([]);
  });

  it("uses PR 6's proposal tools as the write tier", () => {
    expect([...WRITE]).toEqual([...PROPOSAL_TOOLS]);
  });
});

describe("activeToolsFor", () => {
  let available: string[] = [];
  const route = (question: string, extra: Partial<Parameters<typeof activeToolsFor>[0]> = {}) => activeToolsFor({ question, availableTools: available, stepNumber: 0, seesBook: true, ...extra });

  it("offers every tool each eval case expects, on step 0", async () => {
    available = await allRegisteredTools();
    const misses: string[] = [];
    for (const c of EVAL_CASES) {
      const active = new Set(activeToolsFor({ question: c.question, page: c.page ?? null, seesBook: c.as === "exec", pinnedHolding: Boolean(c.ticker), availableTools: available, stepNumber: 0 }));
      for (const need of c.expect.calls ?? []) if (!need.split("|").some((n) => active.has(n))) misses.push(`${c.id}: ${need}`);
    }
    expect(misses).toEqual([]);
  });

  it("offers far fewer tools than are registered for a plain research question", async () => {
    available = await allRegisteredTools();
    const active = route("Summarize the last 10-Q for AXP: revenue, margins, and guidance, with sources.", { seesBook: false, pinnedHolding: true });
    expect(active.length).toBeLessThan(available.length / 2);
    expect(active).toEqual(expect.arrayContaining([...CORE]));
    expect(active).not.toContain("run_backtest");
    expect(active).not.toContain("read_pt_sheet");
  });

  it("keeps retired tools registered but never offers them", async () => {
    available = await allRegisteredTools();
    for (const r of RETIRED) {
      expect(available).toContain(r);
      expect(route("list the exhibits and search financial concepts for AXP segment revenue", { priorTools: [r] })).not.toContain(r);
    }
  });

  it("unlocks tiers by words", async () => {
    available = await allRegisteredTools();
    expect(route("Have AVGO insiders been buying or selling lately?")).toContain("get_insider_transactions");
    expect(route("what is the probability of a rate hike according to kalshi")).toContain("get_market_odds");
    expect(route("Compute the 60-day correlation between our two largest holdings.")).toContain("run_python");
    expect(route("what does the PT sheet say AVGO's price target is?")).toContain("read_pt_sheet");
    expect(route("what did management say on the last call?")).toContain("find_call_transcripts");
    expect(route("who founded Broadcom and who is the CEO?")).toContain("get_company_background");
    expect(route("Read this: https://example.com/story")).toContain("read_url");
    expect(route("how much did AVGO spend on buybacks last year?")).toContain("get_financials");
  });

  it("reads a benchmark comparison as the benchmark, not peers", async () => {
    available = await allRegisteredTools();
    expect(route("How did META do versus the S&P 500 in its last filing?", { seesBook: false })).not.toContain("compare_peers");
    expect(route("How does META compare with GOOGL on margins?", { seesBook: false })).toContain("compare_peers");
  });

  it("unlocks the book for a lead, exec or admin asking how we did, not for an associate", async () => {
    available = await allRegisteredTools();
    expect(route("why are we down today?")).toContain("get_daily_performance");
    expect(route("did we make money?", { seesBook: false })).not.toContain("get_attribution");
  });

  it("offers every tool the page-context block names", async () => {
    available = await allRegisteredTools();
    const pages: PageContext[] = [
      { kind: "attribution", path: "/attribution", title: "Performance", scope: "fund", period: "1m", start: "2026-08-28", end: "2026-09-28" },
      { kind: "daily", path: "/daily", title: "Today", scope: "fund", session: "2026-09-28", status: "live" },
      { kind: "backtesting", path: "/backtesting", title: "Backtesting", from: "2026-06-28", to: "2026-09-28", benchmark: "SPY", changed: [], addedTickers: [], ran: false },
      { kind: "risk", path: "/risk", title: "Risk", scope: "fund", lookback: "1y", asOf: "2026-09-28" },
      { kind: "exposure", path: "/exposure", title: "Exposure", scope: "fund", lookback: "1y", asOf: "2026-09-28" },
      { kind: "page", path: "/", title: "Home" },
      { kind: "page", path: "/t/tech", title: "Information Technology" },
      { kind: "page", path: "/t/tech/sell-side", title: "Sell-side" },
      { kind: "page", path: "/economic-calendar", title: "Economic releases" },
    ];
    for (const page of pages) {
      const named = toolsNamedOnPage(page, available);
      const active = route("hi", { page, seesBook: false });
      expect(active, page.path).toEqual(expect.arrayContaining(named));
    }
    expect(toolsNamedOnPage(pages[0], available)).toEqual(expect.arrayContaining(["get_attribution", "get_news", "get_peer_moves"]));
  });

  it("offers a change tool only when the latest message asks for that change", async () => {
    available = await allRegisteredTools();
    expect(route("add a note to AXP that management guided to 8% growth")).toContain("add_note");
    expect(route("add a note to AXP that management guided to 8% growth")).not.toContain("record_trades_from_ticket");
    expect(route("what did AXP guide to?").filter((t) => (WRITE as readonly string[]).includes(t))).toEqual([]);
    // Nor carried over from the previous answer.
    expect(route("thanks, and what about MSFT?", { priorTools: ["add_note", "get_attribution"] })).not.toContain("add_note");
    expect(route("thanks, and what about MSFT?", { priorTools: ["add_note", "get_attribution"] })).toContain("get_attribution");
  });

  it("only widens after step 0: what the turn used, and its follow-ups", async () => {
    available = await allRegisteredTools();
    const q = "Summarize the last 10-Q for AXP";
    const first = route(q, { seesBook: false });
    const later = route(q, { seesBook: false, stepNumber: 1, usedTools: ["get_key_financials", "get_macro_series"] });
    expect(later).toEqual(expect.arrayContaining(first));
    expect(later).toContain("get_financials");
    // A call to a registered tool the step didn't offer makes it active next step.
    expect(later).toContain("get_macro_series");
    expect(route(q, { seesBook: false, stepNumber: 1, usedTools: ["search_web"] })).toContain("read_url");
  });

  it("has follow-ups only between real tools", async () => {
    available = await allRegisteredTools();
    for (const [from, to] of Object.entries(FOLLOW_UPS)) for (const t of [from, ...to]) expect(available, t).toContain(t);
  });

  it("offers an MCP server's tools only when the question names it", () => {
    const tools = [...CORE, "av_time_series_daily", "av_news_sentiment"];
    const servers = [{ name: "Alpha Vantage", prefix: "av" }];
    expect(activeToolsFor({ question: "what's AAPL's quote?", availableTools: tools, stepNumber: 0, mcpServers: servers })).not.toContain("av_time_series_daily");
    expect(activeToolsFor({ question: "use Alpha Vantage for AAPL's daily prices", availableTools: tools, stepNumber: 0, mcpServers: servers })).toEqual(expect.arrayContaining(["av_time_series_daily", "av_news_sentiment"]));
    expect(activeToolsFor({ question: "call av_news_sentiment for AAPL", availableTools: tools, stepNumber: 0, mcpServers: [] })).toContain("av_news_sentiment");
  });

  it("keeps the registered order and never offers an unregistered tool", () => {
    const tools = ["get_news", "get_quote", "get_attribution"];
    expect(activeToolsFor({ question: "how did we perform?", availableTools: tools, stepNumber: 0, seesBook: true })).toEqual(tools);
    expect(activeToolsFor({ question: "news", availableTools: ["get_news"], stepNumber: 0 })).toEqual(["get_news"]);
  });
});

describe("routingFromMessages", () => {
  it("takes the latest question and the previous answer's tools", () => {
    const r = routingFromMessages([
      { role: "user", parts: [{ type: "text", text: "how did we do this month?" }] },
      { role: "assistant", parts: [{ type: "tool-get_attribution" }, { type: "dynamic-tool", toolName: "av_quote" }, { type: "text", text: "..." }] },
      { role: "user", parts: [{ type: "text", text: "and for tech?" }] },
    ]);
    expect(r).toEqual({ question: "and for tech?", priorTools: ["get_attribution", "av_quote"] });
  });

  it("has no prior tools on a first question", () => {
    expect(routingFromMessages([{ role: "user", parts: [{ type: "text", text: "hi" }] }])).toEqual({ question: "hi", priorTools: [] });
  });
});
