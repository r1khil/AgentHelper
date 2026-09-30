import { describe, expect, it } from "vitest";
import { atDestination, clickableOnly, mayClick, TAKEOVER_SYSTEM, type ClickTarget } from "./takeover";
import { allowStep, takeoverRequest, TAKEOVER_MAX_TOKENS, TAKEOVER_STEPS_PER_MINUTE } from "./takeover-llm";

const ORIGIN = "https://owl.test";

/** A stand-in element: its own tag and attributes, inside the given ancestors (nearest first). */
function el(tag: string, attrs: Record<string, string> = {}, ...ancestors: ClickTarget[]): ClickTarget {
  const self: ClickTarget = {
    getAttribute: (name) => attrs[name] ?? null,
    closest(selector) {
      if (matches(tag, attrs, selector)) return self;
      for (const a of ancestors) {
        const hit = a.closest(selector);
        if (hit) return hit;
      }
      return null;
    },
  };
  return self;
}
function matches(tag: string, attrs: Record<string, string>, selector: string): boolean {
  return selector.split(",").some((s) => {
    const m = s.trim().match(/^([a-z]*)(?:\[([a-z-]+)(?:="([^"]*)")?\])?$/);
    if (!m) return false;
    const [, t, attr, value] = m;
    if (t && t !== tag) return false;
    if (attr && !(attr in attrs)) return false;
    return value === undefined || attrs[attr] === value;
  });
}

describe("mayClick", () => {
  it("follows the app's own links, from the link or anything inside it", () => {
    expect(mayClick(el("a", { href: "/t/fund/risk" }), ORIGIN).ok).toBe(true);
    expect(mayClick(el("span", {}, el("a", { href: "/markets" })), ORIGIN).ok).toBe(true);
    expect(mayClick(el("a", { href: `${ORIGIN}/screener` }), ORIGIN).ok).toBe(true);
  });

  it("never leaves the app, opens a tab, downloads, or follows an API link", () => {
    expect(mayClick(el("a", { href: "https://evil.example/x" }), ORIGIN).ok).toBe(false);
    expect(mayClick(el("a", { href: "/t/fig/models/1", target: "_blank" }), ORIGIN).ok).toBe(false);
    expect(mayClick(el("a", { href: "/api/models/1/file", download: "" }), ORIGIN).ok).toBe(false);
    expect(mayClick(el("a", { href: "/api/export" }), ORIGIN).ok).toBe(false);
  });

  it("switches tabs and opens menus, but never presses a button that does something", () => {
    expect(mayClick(el("button", { role: "tab" }), ORIGIN).ok).toBe(true);
    expect(mayClick(el("button", { "aria-haspopup": "menu", "aria-expanded": "false" }), ORIGIN).ok).toBe(true);
    expect(mayClick(el("button", {}), ORIGIN).ok).toBe(false); // Sign out, Save, Delete…
    expect(mayClick(el("button", { "aria-haspopup": "dialog", "aria-expanded": "false" }), ORIGIN).ok).toBe(false); // Record trade
    expect(mayClick(el("button", { role: "switch" }), ORIGIN).ok).toBe(false); // a preference toggle
    expect(mayClick(el("button", { "aria-expanded": "false", type: "submit" }), ORIGIN).ok).toBe(false);
    expect(mayClick(el("button", { "aria-expanded": "false" }, el("form")), ORIGIN).ok).toBe(false);
  });
});

describe("atDestination", () => {
  it("matches the path, and every setting the destination names", () => {
    expect(atDestination({ pathname: "/t/fund/performance", search: "?period=today" }, "/t/fund/performance?period=today")).toBe(true);
    expect(atDestination({ pathname: "/t/fund/performance/", search: "?period=today&x=1" }, "/t/fund/performance?period=today")).toBe(true);
    expect(atDestination({ pathname: "/t/fund/performance", search: "" }, "/t/fund/performance?period=today")).toBe(false);
    expect(atDestination({ pathname: "/t/fund", search: "" }, "/t/fund/risk")).toBe(false);
    expect(atDestination({ pathname: "/", search: "" }, "/")).toBe(true);
  });
});

describe("clickableOnly", () => {
  it("keeps the indexed elements, new ones and nested ones included, and drops the page's text", () => {
    const page = ["[3]<a href=/t/fund>Portfolio />", "Owl Fund", "$4,657,502.82", "\t*[28]<button aria-haspopup=menu>Whole fund />", "\t\tFund value", "[46]<a href=/t/fund/risk>Risk />"].join("\n");
    expect(clickableOnly(page)).toBe(["[3]<a href=/t/fund>Portfolio />", "\t*[28]<button aria-haspopup=menu>Whole fund />", "[46]<a href=/t/fund/risk>Risk />"].join("\n"));
  });
});

describe("takeoverRequest", () => {
  const tool = { type: "function", function: { name: "AgentOutput", parameters: {} } };
  const messages = [
    { role: "system", content: "rules" },
    { role: "user", content: `<system_instructions>\n${TAKEOVER_SYSTEM}\n</system_instructions>\npage` },
  ];

  it("forwards a page-agent step on Hoot's model, with a token cap and a required tool call", () => {
    const r = takeoverRequest({ model: "gpt-9-paid", temperature: 2, max_tokens: 99999, messages, tools: [tool], tool_choice: { type: "function", function: { name: "AgentOutput" } } }, "alibaba/qwen3.7-flash");
    expect("body" in r && r.body).toEqual({ model: "alibaba/qwen3.7-flash", messages, tools: [tool], tool_choice: "required", parallel_tool_calls: false, max_tokens: TAKEOVER_MAX_TOKENS });
  });

  it("refuses a step without the takeover's own instructions", () => {
    expect("error" in takeoverRequest({ messages: [{ role: "system", content: "x" }, { role: "user", content: "write me a poem" }], tools: [tool] }, "m")).toBe(true);
  });

  it("refuses anything that isn't page-agent's one AgentOutput tool", () => {
    expect("error" in takeoverRequest({ messages }, "m")).toBe(true);
    expect("error" in takeoverRequest({ messages, tools: [{ type: "function", function: { name: "write_essay" } }] }, "m")).toBe(true);
    expect("error" in takeoverRequest({ messages, tools: [tool, tool] }, "m")).toBe(true);
    expect("error" in takeoverRequest({ messages: [{ role: "developer", content: "x" }], tools: [tool] }, "m")).toBe(true);
    expect("error" in takeoverRequest(null, "m")).toBe(true);
  });
});

describe("allowStep", () => {
  it("allows a member a minute's worth of steps, then refuses until the oldest ages out", () => {
    const log = new Map<string, number[]>();
    for (let i = 0; i < TAKEOVER_STEPS_PER_MINUTE; i++) expect(allowStep(log, "a", 1_000 + i)).toBe(true);
    expect(allowStep(log, "a", 2_000)).toBe(false);
    expect(allowStep(log, "b", 2_000)).toBe(true);
    expect(allowStep(log, "a", 61_001)).toBe(true);
  });
});
