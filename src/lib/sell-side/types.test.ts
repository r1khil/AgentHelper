import { describe, it, expect } from "vitest";
import { normalizeSegments, transcriptText, transcriptSource, assertComplete } from "./types";
import { resolveSource, supportingRange } from "@/lib/agent/source-resolution";
import { collectSources } from "@/lib/agent/citations";
import type { UIMessage } from "ai";

describe("saved transcript evidence", () => {
  it("preserves exact words, timestamps, and part-scoped speaker labels", () => {
    const segments = normalizeSegments({ segments: [{ speaker: "A", start: 1, end: 4, text: "FY27 revenue: $3.2 billion, not $3.5 billion." }] }, 1, 120);
    expect(segments[0]).toMatchObject({ speaker: "Part 2 · Speaker A", start: 121, end: 124 });
    const text = transcriptText(segments);
    expect(text).toContain("[00:02:01–00:02:04] Part 2 · Speaker A: FY27 revenue: $3.2 billion, not $3.5 billion.");
    const source = transcriptSource(
      { id: "11111111-1111-4111-8111-111111111111", title: "Analyst interview", ticker: "ABC", createdAt: "2026-09-20" },
      1,
      text,
    );
    expect(resolveSource(source)).toEqual({ kind: "document", documentId: "call-11111111-1111-4111-8111-111111111111" });
    expect(supportingRange(text, source.location?.text)).toEqual({ start: 0, end: text.length });
    const messages: UIMessage[] = [
      {
        id: "a",
        role: "assistant",
        parts: [{ type: "tool-read_call_transcript", toolCallId: "t", state: "output-available", input: {}, output: { data: {}, sources: [source] } }],
      },
    ];
    expect(collectSources(messages).get(source.id)).toEqual(source);
  });
  it("rejects missing diarization and reversed timestamps", () => {
    expect(() => normalizeSegments({ text: "No speakers" }, 0, 0)).toThrow();
    expect(() => normalizeSegments({ segments: [{ speaker: "A", start: 8, end: 1, text: "Bad" }] }, 0, 0)).toThrow();
  });
  it("never analyzes a partial, gapped, or untranscribed recording", () => {
    const p = { seq: 0, segments: [], summary: "Notes" };
    expect(() => assertComplete([p], 2)).toThrow();
    expect(() => assertComplete([p, { ...p, seq: 2 }], 2)).toThrow();
    expect(() => assertComplete([{ ...p, summary: null }], 1)).toThrow();
    expect(() => assertComplete([p], 1)).not.toThrow();
  });
});
