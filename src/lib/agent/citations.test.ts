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
  it("supports dynamic tools, malformed metadata, and legacy read excerpts without losing the original destination", () => {
    const original = { id: "drive-1", title: "Transcript", url: "https://drive.google.com/file/d/file_123/view", publisher: "Analyst Drive", retrievedAt: "2026-09-19" };
    const parts = [
      { type: "dynamic-tool", toolName: "find_drive_files", state: "output-available", output: { sources: [null, {}, original] } },
      { type: "tool-read_drive_file", state: "output-available", output: { sources: [original], data: { sourceId: original.id, text: "Revenue grew 8%." } } },
      { type: "tool-read_drive_file", state: "output-available", output: { sources: [{ ...original, url: "https://example.com/other" }] } },
      { type: "tool-read_drive_file", state: "output-available", output: { sources: "invalid" } },
    ];
    const sources = collectSources([{ id: "a", role: "assistant", parts }] as UIMessage[]);
    expect(sources.size).toBe(1);
    expect(sources.get(original.id)).toMatchObject({ url: original.url, excerpt: "Revenue grew 8%." });
  });

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
