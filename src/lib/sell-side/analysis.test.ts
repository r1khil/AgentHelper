import { describe, expect, it } from "vitest";
import { analysisMarkdown, callAnalysisSchema, savedAnalysis, validateAnalysis, type CallAnalysis } from "./analysis";
import type { Source } from "@/lib/providers/types";
import { newCallSchema } from "./company";
export const exampleAnalysis: CallAnalysis = {
  overview: {
    text: "Revenue outlook is constructive; margins remain uncertain.",
    sourceIds: ["call-1"],
  },
  keyPoints: [
    {
      text: "FY27 revenue is expected to be $3.2 billion.",
      sourceIds: ["call-1"],
    },
  ],
  numbers: [
    {
      metric: "Revenue",
      value: "$3.2 billion",
      period: "FY27",
      context: "Call expectation, not verified guidance.",
      sourceIds: ["call-1"],
    },
  ],
  positives: [{ text: "Revenue growth", sourceIds: ["call-1"] }],
  risks: [{ text: "Uncertain margins", sourceIds: ["call-1"] }],
  themes: [],
  catalysts: [],
  questions: [],
  crossChecks: [
    {
      claim: "Revenue outlook",
      assessment: "Not covered",
      evidence: "The model covers FY26, not FY27.",
      followUp: "Obtain comparable FY27 estimates.",
      callSourceIds: ["call-1"],
      internalSourceIds: ["internal-1"],
    },
  ],
  coverage: "Reviewed one internal model; fiscal periods differ.",
};
const sources = new Map<string, Source>([
  [
    "call-1",
    {
      id: "call-1",
      sourceType: "Call transcript",
      title: "Call",
      publisher: "Call",
      retrievedAt: "2026-09-21",
    },
  ],
  [
    "internal-1",
    {
      id: "internal-1",
      sourceType: "Internal document",
      title: "Model",
      publisher: "Drive",
      retrievedAt: "2026-09-21",
    },
  ],
]);
describe("structured call evidence", () => {
  it("validates and serializes a saved analysis with standard citation tokens", () => {
    const analysis = validateAnalysis(callAnalysisSchema.parse(exampleAnalysis), sources);
    expect(analysisMarkdown(analysis)).toContain("[src:call-1]");
    expect(analysisMarkdown(analysis)).toContain("[src:internal-1]");
    expect(
      savedAnalysis([
        {
          id: "answer",
          role: "assistant",
          parts: [],
          metadata: { sellSideAnalysis: analysis },
        },
      ]),
    ).toEqual(analysis);
    expect(
      savedAnalysis([
        {
          id: "old",
          role: "assistant",
          parts: [{ type: "text", text: "Legacy brief" }],
        },
      ]),
    ).toBeNull();
  });
  it("rejects unknown citations and comparisons without internal evidence", () => {
    const bad = structuredClone(exampleAnalysis);
    bad.keyPoints[0].sourceIds = ["invented"];
    expect(() => validateAnalysis(bad, sources)).toThrow("unavailable evidence");
    bad.keyPoints[0].sourceIds = ["call-1"];
    bad.crossChecks[0].assessment = "Supports";
    bad.crossChecks[0].internalSourceIds = [];
    expect(() => validateAnalysis(bad, sources)).toThrow("internal evidence");
  });
  it("rejects misclassified transcript/internal citations", () => {
    const bad = structuredClone(exampleAnalysis);
    bad.crossChecks[0].internalSourceIds = ["call-1"];
    expect(() => validateAnalysis(bad, sources)).toThrow("types do not match");
  });
});
describe("company selection", () => {
  const base = {
    teamId: "11111111-1111-4111-8111-111111111111",
    title: "Broker call",
  };
  it("accepts companies outside the portfolio and normalizes tickers", () => {
    expect(
      newCallSchema.parse({
        ...base,
        companyType: "other",
        companyName: "Snowflake",
        ticker: " snow ",
      }),
    ).toMatchObject({ ticker: "SNOW", companyName: "Snowflake" });
  });
  it.each([
    { companyName: "", ticker: "SNOW" },
    { companyName: "Snowflake", ticker: "bad ticker" },
  ])("rejects missing or invalid identity", (company) => {
    expect(newCallSchema.safeParse({ ...base, companyType: "other", ...company }).success).toBe(false);
  });
});
