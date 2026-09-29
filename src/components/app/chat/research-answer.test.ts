import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { collectSources } from "@/lib/agent/citations";
import { compactHistory } from "@/lib/agent/turn";
import { ResearchAnswer, ResearchSources } from "./research-answer";

const sources = [
  { id: "sec-1", title: "Quarterly filing", url: "https://www.sec.gov/Archives/filing.htm", publisher: "SEC EDGAR", retrievedAt: "2026-09-19" },
  { id: "doc-1", title: "Earnings release", url: "https://investors.example.com/earnings", publisher: "Investor relations", retrievedAt: "2026-09-19" },
  { id: "xbrl-1", title: "Financial data", url: "https://www.sec.gov/Archives/report.htm", publisher: "SEC EDGAR XBRL", retrievedAt: "2026-09-19" },
  { id: "drive-1", title: "Internal transcript", documentId: "file_123", publisher: "Analyst Drive", retrievedAt: "2026-09-19" },
  { id: "missing-url", title: "Missing URL", publisher: "Unknown", retrievedAt: "2026-09-19" },
  { id: "web-1jo7h58", title: "AMZN coverage", url: "https://news.example.com/amzn", publisher: "Example News", retrievedAt: "2026-09-23" },
];
const messages = [
  {
    id: "a",
    role: "assistant",
    parts: [{ type: "tool-read_filing", toolCallId: "1", state: "output-available", input: {}, output: { sources, data: { text: "Revenue grew 8%", sourceId: "sec-1" } } }],
  },
] as UIMessage[];
const render = (text: string) =>
  renderToStaticMarkup(h(ResearchSources, { sources: collectSources(JSON.parse(JSON.stringify(messages))), chatId: "chat", children: h(ResearchAnswer, { text }) }));

describe("research answer rendering (actual react-markdown pipeline)", () => {
  it("reproduces the original custom-scheme sanitization bug", () => {
    expect(defaultUrlTransform("src:sec-1")).toBe("");
    expect(renderToStaticMarkup(h(ReactMarkdown, { children: "[sec-1](src:sec-1)" }))).toContain('href=""');
  });
  it.each(["[src:sec-1][src:doc-1][src:xbrl-1]", "[src: sec-1, doc-1, xbrl-1]", "[src:sec-1, src:doc-1, src:xbrl-1]", "[sec-1](src:sec-1)[doc-1](src:doc-1)[xbrl-1](src:xbrl-1)"])(
    "renders real source links and readable numbers for %s",
    (text) => {
      const html = render(text);
      expect(html).toContain('href="https://www.sec.gov/Archives/filing.htm#:~:text=Revenue%20grew%208%25"');
      expect(html).toContain('href="https://investors.example.com/earnings"');
      expect(html).toContain('href="https://www.sec.gov/Archives/report.htm"');
      expect(html.match(/target="_blank"/g)).toHaveLength(3);
      expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(3);
      expect(html).toContain(">1</a>");
      expect(html).toContain(">2</a>");
      expect(html).not.toMatch(/href="(?:src:|#|$)|href=""/);
      expect(html).not.toContain(">sec-1<");
    },
  );
  it("handles tables and repeated references with stable numbering", () => {
    const html = render("| Metric | Citation |\n| --- | --- |\n| Revenue | [src:sec-1] |\n\nAgain [src:sec-1]");
    expect(html).toContain("<table");
    expect(html.match(/>1<\/a>/g)).toHaveLength(2);
  });
  it("draws a table with hairlines, its figures right-aligned and coloured up and down", () => {
    const html = render("| Sector | Weights | Total |\n| --- | --- | --- |\n| Health Care | (6.4) [src:sec-1] | +14.1 |\n| Utilities | +1.7 | (2.2) |");
    // Text columns stay left; a column of figures aligns right whether or not the answer said so.
    expect(html).toMatch(/<td[^>]*>Health Care<\/td>/);
    expect(html.match(/text-align:\s?right/g)?.length).toBe(6);
    expect(html).toContain("text-down");
    expect(html).toContain("text-up");
    expect(html).not.toMatch(/<td[^>]*text-(?:up|down)[^>]*>Health Care/);
  });
  it("writes each citation as the page's superscript, amber when the source is unavailable", () => {
    const html = render("Found [src:sec-1] and not [src:invented].");
    expect(html.match(/class="cite /g)).toHaveLength(2);
    expect(html).toContain("text-caution-foreground");
    expect(html).not.toContain("bg-hoot");
  });
  it("renders internal and unavailable citations as buttons, never navigable anchors", () => {
    const html = render("[src:drive-1] [src:missing-url] [src:invented]");
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).not.toContain("href=");
    expect(html).toContain("Source unavailable");
  });
  it("links an already-saved citation with a mistyped id to the one source it meant", () => {
    const html = render("AWS grew [src:web-1jo7h8]. Again [src:web-1jo7h8].");
    expect(html.match(/href="https:\/\/news\.example\.com\/amzn"/g)).toHaveLength(2);
    expect(html).toContain(">6</a>");
    expect(html).not.toContain(">?<");
  });
  it("does not transform code examples or loosen Markdown URL protection", () => {
    const html = render("`[src:sec-1]`\n\n```\n[src:doc-1]\n```\n\n[Unsafe](javascript:alert%281%29)");
    expect(html).toContain("<code>[src:sec-1]</code>");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("javascript:");
  });
  it("keeps citation metadata through saved history and model-input compaction", () => {
    const history = [...messages, { id: "b", role: "user", parts: [{ type: "text", text: "Next question" }] }] as UIMessage[];
    expect(collectSources(compactHistory(history))).toEqual(collectSources(history));
  });
});
