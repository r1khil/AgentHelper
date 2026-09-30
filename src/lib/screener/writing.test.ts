import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/agent/definition", () => ({ agentModelWithFallback: vi.fn() }));
vi.mock("./filing-changes/sections", () => ({ extractSection: vi.fn() }));
vi.mock("./filing-changes/store", () => ({ listFilingChanges: vi.fn() }));
import type { ChecklistItem } from "@/db/schema";
import type { CiteSource } from "./cited";
import { checkTearSheet } from "./tear-sheets";
import { bearSources, checkMemo } from "./bear-case";
import type { FilingChangeView } from "./filing-changes/store";

const sources: CiteSource[] = [
  { n: 1, label: "10-K Item 1", url: "u1", text: "The company sells industrial pumps to utilities." },
  { n: 2, label: "10-Q Item 2", url: "u2", text: "Backlog declined as two utility customers delayed orders." },
];
const s = (text: string, cites: number[], quote?: string) => ({ text, cites, ...(quote ? { quote } : {}) });

describe("checkTearSheet", () => {
  const good = {
    business: [s("It sells pumps to utilities.", [1])],
    mightDeserve: [s("Orders are slipping.", [2], "two utility customers delayed orders")],
    questions: [
      { ...s("How big is the backlog drop?", [2]), section: "10-Q Item 2" },
      { ...s("Which customers?", [2]), section: "10-Q Item 2" },
      { ...s("Is pricing holding?", [1]), section: "10-K Item 1" },
    ],
  };

  it("shows a sheet whose every sentence is cited and whose quotes are found", () => {
    const { body, held } = checkTearSheet(JSON.stringify(good), sources);
    expect(held).toBeNull();
    expect(body?.questions).toHaveLength(3);
  });

  it("holds a sheet with a failed quote, an uncited claim or missing questions", () => {
    expect(checkTearSheet(JSON.stringify({ ...good, mightDeserve: [s("Orders slip.", [2], "customers cancelled")] }), sources).held).toMatch(/Quote not found/);
    expect(checkTearSheet(JSON.stringify({ ...good, business: [s("Wide moat.", [])] }), sources).held).toMatch(/Uncited/);
    expect(checkTearSheet(JSON.stringify({ ...good, questions: good.questions.slice(0, 2) }), sources).held).toMatch(/three questions/);
    expect(checkTearSheet("", sources).held).toMatch(/readable/);
  });
});

describe("bear case", () => {
  const checklist: ChecklistItem[] = [{ key: "goodwill", label: "Goodwill", status: "fail", detail: "Goodwill is 52% of total assets." }];
  const change = (i: number): FilingChangeView =>
    ({ id: `c${i}`, ticker: "ACME", form: "10-Q", item: "1A", labelText: "New risk factor", filedAt: `2026-0${i}-01`, summary: "A new risk.", quote: "customer concentration increased", filingUrl: `f${i}` }) as FilingChangeView;

  it("never cuts the checklist, keeps the five newest changes when long, and keeps the pitch's opening", () => {
    const pitch = `Thesis: margins recover. ${"detail ".repeat(5000)}`;
    const src = bearSources({ ticker: "ACME", checklist, changes: [1, 2, 3, 4, 5, 6, 7].map(change), pitch }, 8000);
    expect(src[0].text).toContain("Goodwill: fail");
    expect(src.filter((x) => x.label.includes("New risk factor"))).toHaveLength(5);
    expect(src.at(-1)!.text.startsWith("Thesis: margins recover.")).toBe(true);
    expect(src.at(-1)!.text.length).toBeLessThan(pitch.length);
  });

  it("needs three cited points", () => {
    const src = bearSources({ ticker: "ACME", checklist, changes: [change(1)], pitch: "Margins recover." });
    const point = (t: string) => ({ title: t, body: [s("Goodwill is heavy.", [1], "Goodwill is 52% of total assets")] });
    expect(checkMemo(JSON.stringify({ points: [point("A"), point("B"), point("C")] }), src)).toMatchObject({ held: null });
    expect(checkMemo(JSON.stringify({ points: [point("A")] }), src).held).toMatch(/three/);
    expect(checkMemo(JSON.stringify({ points: [point("A"), point("B"), { title: "C", body: [s("Made up.", [9])] }] }), src).held).toMatch(/wasn't given/);
  });
});
