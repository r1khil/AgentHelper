import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const generateText = vi.fn();
vi.mock("ai", () => ({ generateText: (...args: unknown[]) => generateText(...args) }));
const agentConfigured = vi.fn(() => true);
vi.mock("@/lib/agent/model", () => ({
  agentConfigured: () => agentConfigured(),
  agentModelId: async () => "test/model:free",
  chatModel: (id: string) => ({ id }),
}));

import { DEFAULT_CHANGELOG_MODEL, FALLBACK_MODEL, summarizePull } from "./summarize";

const pr = { number: 28, title: "Attribution headline comparison against the S&P 500 index", body: "## Summary\n- Tiles use ^GSPC.", author: "r1khil", mergedAt: "2026-09-18T20:00:00Z", url: "https://github.com/x/y/pull/28" };
const files = [{ path: "src/app/(app)/attribution/page.tsx", additions: 40, deletions: 10 }];

describe("summarizePull", () => {
  beforeEach(() => {
    generateText.mockReset();
    agentConfigured.mockReturnValue(true);
  });

  it("returns the model's headline and summary with the model id", async () => {
    generateText.mockResolvedValue({ text: '{"headline":"Fund attribution now compares against the S&P 500","summary":"The headline tiles use the S&P 500."}' });
    const out = await summarizePull(pr, files);
    expect(out).toEqual({ headline: "Fund attribution now compares against the S&P 500", summary: "The headline tiles use the S&P 500.", model: DEFAULT_CHANGELOG_MODEL, failed: false });
    const call = generateText.mock.calls[0][0] as { prompt: string; model: { id: string } };
    expect(call.model.id).toBe(DEFAULT_CHANGELOG_MODEL);
    expect(call.prompt).toContain("TITLE: Attribution headline");
    expect(call.prompt).toContain("src/app/(app)/attribution/page.tsx (+40/-10)");
  });

  it("falls back to the title when the model is unconfigured", async () => {
    agentConfigured.mockReturnValue(false);
    expect(await summarizePull(pr, files)).toEqual({ headline: pr.title, summary: "Details not available.", model: FALLBACK_MODEL, failed: false });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("falls back when the model throws or replies without JSON", async () => {
    generateText.mockRejectedValueOnce(new Error("rate limited"));
    expect(await summarizePull(pr, files)).toMatchObject({ model: FALLBACK_MODEL, failed: true });
    generateText.mockResolvedValueOnce({ text: "Sorry, no." });
    expect(await summarizePull(pr, files)).toMatchObject({ model: FALLBACK_MODEL, failed: true });
  });
});
