import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Part } from "@/lib/agent/turn";
import { ActivityRow } from "./chat-panel";

const lookup = (id: string, state = "output-available") => ({ type: "tool-read_filing", toolCallId: id, state, input: { url: "u" }, output: { sources: [{ id: `s-${id}` }] } }) as unknown as Part;
const row = (parts: Part[], live: boolean) => renderToStaticMarkup(h(ActivityRow, { parts, live, trace: null, now: 0 }));

describe("ActivityRow", () => {
  it("keeps spinning while the answer (or its write-up) is still being written", () => {
    const html = row([lookup("1"), lookup("2")], true);
    expect(html).toContain("animate-spin");
    expect(html).toContain("Working…");
  });

  it("names the lookup in flight", () => {
    expect(row([lookup("1"), lookup("2", "input-available")], true)).toContain("Reading filing…");
  });

  it("summarises the research once the answer is there", () => {
    const html = row([lookup("1"), lookup("2")], false);
    expect(html).not.toContain("animate-spin");
    expect(html).toContain("Researched · 2 lookups · 2 sources");
  });
});
