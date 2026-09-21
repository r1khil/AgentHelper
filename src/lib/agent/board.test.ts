import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { collectSources } from "./citations";
import { citedIds, marketFigure, pairTurns, traceLine, turnSources } from "./board";

const src = (id: string, title = id) => ({ id, title, url: `https://example.com/${id}`, publisher: "Example", retrievedAt: "2026-09-21" });
const tool = (name: string, callId: string, sources: ReturnType<typeof src>[], data?: unknown) => ({
  type: `tool-${name}`,
  toolCallId: callId,
  state: "output-available",
  input: {},
  output: { data, sources },
});

const messages = [
  { id: "u1", role: "user", parts: [{ type: "text", text: "What moved AVGO?" }] },
  {
    id: "a1",
    role: "assistant",
    parts: [
      tool("get_quote", "c1", [src("yq-1", "AVGO quote")], { price: 362.14, changePct: -4.81, currency: "USD", marketState: "CLOSED", sourceId: "yq-1" }),
      tool("get_filings", "c2", [src("sec-1", "8-K"), src("sec-2", "10-Q")]),
      { type: "text", text: "AVGO fell 4.81% [src:yq-1]. An 8-K was filed [src:sec-1][src: sec-1, sec-2]." },
    ],
  },
  { id: "u2", role: "user", parts: [{ type: "text", text: "And the segments?" }] },
  {
    id: "a2",
    role: "assistant",
    parts: [tool("read_filing", "c3", [src("sec-3", "10-K")]), { type: "text", text: "Two segments [src:sec-3]. Same 8-K as before [src:sec-1]." }],
  },
] as UIMessage[];

describe("pairTurns", () => {
  it("pairs each question with its answer and separates activity from prose", () => {
    const turns = pairTurns(messages);
    expect(turns.map((t) => t.id)).toEqual(["u1", "u2"]);
    expect(turns[0].question).toBe("What moved AVGO?");
    expect(turns[0].activity).toHaveLength(2);
    expect(turns[0].answerText).toContain("fell 4.81%");
    expect(turns[1].assistant?.id).toBe("a2");
  });
  it("leaves an unanswered question without an assistant message", () => {
    const turns = pairTurns([messages[0]]);
    expect(turns[0].assistant).toBeUndefined();
    expect(turns[0].answerText).toBe("");
  });
});

describe("citedIds", () => {
  it("reads every token form, keeping repeats", () => {
    expect(citedIds("a [src:x] b [src: y, z] c [src:x, src:w]")).toEqual(["x", "y", "z", "x", "w"]);
  });
});

describe("turnSources", () => {
  const all = collectSources(messages);
  it("numbers a turn's own sources in retrieval order and counts citations", () => {
    const rows = turnSources(pairTurns(messages)[0], all);
    expect(rows.map((r) => [r.source.id, r.n, r.cited])).toEqual([
      ["yq-1", 1, 1],
      ["sec-1", 2, 2],
      ["sec-2", 3, 1],
    ]);
    expect(rows[0].data?.price).toBe(362.14);
  });
  it("appends earlier-turn sources the answer cites after the turn's own", () => {
    const rows = turnSources(pairTurns(messages)[1], all);
    expect(rows.map((r) => [r.source.id, r.n, r.cited])).toEqual([
      ["sec-3", 1, 1],
      ["sec-1", 2, 1],
    ]);
  });
});

describe("marketFigure", () => {
  it("renders a quote as a price with its day move", () => {
    const rows = turnSources(pairTurns(messages)[0], collectSources(messages));
    expect(marketFigure(rows[0])).toEqual({ big: "362.14", tone: "down", sub: "-4.81% · USD · closed" });
    expect(marketFigure(rows[1])).toBeNull();
  });
  it("renders the latest relative move", () => {
    const row = { n: 1, cited: 0, source: src("yr-1"), data: { sessions: [{ date: "2026-09-18", holdingReturnPct: -4.81, spxReturnPct: -0.62, relativePp: -4.19, qualifies: true }] } };
    expect(marketFigure(row)).toEqual({ big: "-4.19 pp", tone: "down", sub: "-4.81% vs -0.62% · 4 pp rule met · 2026-09-18" });
  });
});

describe("traceLine", () => {
  it("summarises a finished turn", () => {
    expect(traceLine(pairTurns(messages)[0], false)).toEqual({ text: "Searched 2 lookups · 3 sources", working: false });
  });
  it("names the running lookup while live", () => {
    const live = pairTurns([messages[0], { id: "a", role: "assistant", parts: [{ ...tool("get_news", "c9", []), state: "input-available" }] } as UIMessage])[0];
    expect(traceLine(live, true)).toEqual({ text: "Scanning news… · 0 sources", working: true });
  });
});
