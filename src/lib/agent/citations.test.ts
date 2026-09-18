import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { collectSources, uncitedFactCount } from "./citations";

const msg = (text: string): UIMessage => ({ id: "a", role: "assistant", parts: [{ type: "text", text }] });

describe("uncitedFactCount", () => {
  it("counts a line once even when it has several sentences, and accepts a trailing citation", () => {
    const m = msg(
      [
        "## Headline figures",
        "| Metric | Value |",
        "| Revenue | $19,637M |",
        "**Revenue drivers (Q2 2026):**",
        "- Discount revenue: $10,163M, +9%. Billed business grew 9%. [src:doc-1]",
        "- Net card fees: $2,862M, +15%.",
        "Net margin 15.84%, calculated from the reported lines [src:xbrl-1].",
        "Here is the summary of the Q2 FY2026 10-Q, filed 2026-07-24.",
      ].join("\n"),
    );
    expect(uncitedFactCount(m)).toBe(2);
  });
});

describe("collectSources", () => {
  it("keys sources by id across completed tool parts only", () => {
    const m: UIMessage = {
      id: "a",
      role: "assistant",
      parts: [
        { type: "tool-get_filings", toolCallId: "1", state: "output-available", input: {}, output: { sources: [{ id: "s1", title: "t", url: "u", publisher: "p", retrievedAt: "r" }] } } as never,
        { type: "tool-read_filing", toolCallId: "2", state: "input-available", input: {} } as never,
      ],
    };
    expect([...collectSources([m]).keys()]).toEqual(["s1"]);
  });
});
