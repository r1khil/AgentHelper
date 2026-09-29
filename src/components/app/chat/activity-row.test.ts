import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Part } from "@/lib/agent/turn";
import { ActivityRow } from "./thread-parts";

const lookup = (id: string, state = "output-available") => ({ type: "tool-read_filing", toolCallId: id, state, input: { url: "u" }, output: { sources: [{ id: `s-${id}` }] } }) as unknown as Part;
const row = (parts: Part[], live: boolean, extra: Partial<Parameters<typeof ActivityRow>[0]> = {}) => renderToStaticMarkup(h(ActivityRow, { parts, live, trace: null, now: 0, ...extra }));

describe("ActivityRow", () => {
  it("keeps spinning while the answer (or its write-up) is still being written", () => {
    const html = row([lookup("1"), lookup("2")], true);
    expect(html).toContain("animate-spin");
    expect(html).toContain("Working…");
  });

  it("names the lookup in flight", () => {
    expect(row([lookup("1"), lookup("2", "input-available")], true)).toContain("Reading filing…");
  });

  it("says what Hoot did once the answer is there", () => {
    const html = row([lookup("1"), lookup("2")], false);
    expect(html).not.toContain("animate-spin");
    expect(html).toContain("2 lookups, read 2 sources");
  });

  it("gives how long the turn took when it is known", () => {
    // The board and the panel keep it a grey line that starts the sentence; the thread puts Hoot's name in front of it.
    expect(row([lookup("1")], false, { elapsedMs: 12_400 })).toContain("Worked for 12s, read 1 source");
    const thread = row([lookup("1")], false, { variant: "thread", elapsedMs: 12_400 });
    expect(thread).toContain("worked for 12s, read 1 source");
    expect(thread).toContain("<b class=\"font-semibold text-foreground\">Hoot</b>");
    expect(row([lookup("1")], false, { variant: "board" })).not.toContain(">Hoot</b>");
  });

  it("opens to the lookups", () => {
    expect(row([lookup("1")], false, { open: true })).toContain("Read filing");
    expect(row([lookup("1")], false)).not.toContain("Read filing");
  });

  it("counts a failed lookup", () => {
    const failed = { type: "tool-read_filing", toolCallId: "9", state: "output-error", input: {}, errorText: "no such filing" } as unknown as Part;
    expect(row([lookup("1"), failed], false)).toContain("1 failed");
  });
});
