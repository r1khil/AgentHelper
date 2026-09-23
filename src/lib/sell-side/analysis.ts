import { z } from "zod";
import type { UIMessage } from "ai";
import type { Source } from "@/lib/providers/types";

const note = z.string().trim().min(1).max(1500);
export const partNotesSchema = z.object({
  keyPoints: z.array(note).min(1).max(8),
  numbers: z.array(note).max(12),
  positives: z.array(note).max(6),
  risks: z.array(note).max(6),
  themes: z.array(note).max(6),
  questions: z.array(note).max(6),
});
const point = z.object({
  text: note,
  sourceIds: z.array(z.string()).min(1).max(6),
});
export const callAnalysisSchema = z.object({
  overview: point,
  keyPoints: z.array(point).min(1).max(8),
  numbers: z
    .array(
      z.object({
        metric: note,
        value: note,
        period: note,
        context: note,
        sourceIds: z.array(z.string()).min(1).max(6),
      }),
    )
    .max(16),
  positives: z.array(point).max(8),
  risks: z.array(point).max(8),
  themes: z.array(point).max(8),
  catalysts: z.array(point).max(8),
  questions: z.array(point).max(8),
  crossChecks: z
    .array(
      z.object({
        claim: note,
        assessment: z.enum(["Supports", "Contradicts", "Not covered", "Not retrieved"]),
        evidence: note,
        followUp: note,
        callSourceIds: z.array(z.string()).min(1).max(6),
        internalSourceIds: z.array(z.string()).max(6),
      }),
    )
    .min(1)
    .max(10),
  coverage: note,
});
export type CallAnalysis = z.infer<typeof callAnalysisSchema>;
export type AnalysisPoint = z.infer<typeof point>;

/** Reject invented/misclassified citations before a summary can become ready. */
export function validateAnalysis(analysis: CallAnalysis, sources: Map<string, Source>): CallAnalysis {
  const isCall = (id: string) => sources.get(id)?.sourceType === "Call transcript";
  const check = (ids: string[]) => {
    if (ids.some((id) => !sources.has(id))) throw new Error("Analysis referenced unavailable evidence");
  };
  for (const p of [
    analysis.overview,
    ...analysis.keyPoints,
    ...analysis.numbers,
    ...analysis.positives,
    ...analysis.risks,
    ...analysis.themes,
    ...analysis.catalysts,
    ...analysis.questions,
  ]) {
    check(p.sourceIds);
    if (!p.sourceIds.some(isCall)) throw new Error("Call commentary needs transcript evidence");
  }
  for (const row of analysis.crossChecks) {
    check([...row.callSourceIds, ...row.internalSourceIds]);
    if (row.callSourceIds.some((id) => !isCall(id)) || row.internalSourceIds.some(isCall)) throw new Error("Cross-check evidence types do not match");
    if (row.assessment !== "Not retrieved" && !row.internalSourceIds.length) throw new Error("Comparison needs internal evidence");
  }
  return analysis;
}
/** Free-tier providers often return near-miss JSON: missing follow-ups, invented or `[src:…]`-wrapped ids,
 * comparisons that cite no internal file. Repair what can be repaired from the evidence and drop the rest,
 * so one weak field does not fail a brief whose transcript-backed content is sound. Nothing is invented:
 * overview and cross-check rows may only fall back to the call's own transcript sources, and any item
 * that still lacks transcript evidence is removed. The result always passes the strict schema and validator. */
const looseText = z.string().catch("").transform((s) => s.trim().slice(0, 1500));
const looseIds = z.array(z.string().catch("")).catch([]);
const loosePoint = z.object({ text: looseText, sourceIds: looseIds }).catch({ text: "", sourceIds: [] });
const looseList = <T extends z.ZodTypeAny>(item: T) => z.array(item).catch([]);
const looseAnalysis = z.object({
  overview: loosePoint.optional(),
  keyPoints: looseList(loosePoint),
  numbers: looseList(
    z.object({ metric: looseText, value: looseText, period: looseText, context: looseText, sourceIds: looseIds }).catch({
      metric: "",
      value: "",
      period: "",
      context: "",
      sourceIds: [],
    }),
  ),
  positives: looseList(loosePoint),
  risks: looseList(loosePoint),
  themes: looseList(loosePoint),
  catalysts: looseList(loosePoint),
  questions: looseList(loosePoint),
  crossChecks: looseList(
    z
      .object({
        claim: looseText,
        assessment: z.enum(["Supports", "Contradicts", "Not covered", "Not retrieved"]).catch("Not covered"),
        evidence: looseText,
        followUp: looseText,
        callSourceIds: looseIds,
        internalSourceIds: looseIds,
      })
      .catch({ claim: "", assessment: "Not covered", evidence: "", followUp: "", callSourceIds: [], internalSourceIds: [] }),
  ),
  coverage: looseText,
});
export function repairAnalysis(raw: unknown, sources: Map<string, Source>): CallAnalysis {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Analysis output is not an object");
  const loose = looseAnalysis.parse(raw);
  const isCall = (id: string) => sources.get(id)?.sourceType === "Call transcript";
  const callIds = [...sources.keys()].filter(isCall).slice(0, 6);
  if (!callIds.length) throw new Error("No transcript evidence available");
  // Accept `[src:id]` / `src:id` tokens the model may have copied from prompt examples; drop unknown ids.
  const known = (ids: string[]) =>
    [...new Set(ids.map((id) => id.trim().replace(/^\[?src:(.+?)\]?$/, "$1")).filter((id) => sources.has(id)))].slice(0, 6);
  const point = (p: { text: string; sourceIds: string[] }): AnalysisPoint | null => {
    const ids = known(p.sourceIds);
    return p.text && ids.some(isCall) ? { text: p.text, sourceIds: ids } : null;
  };
  const list = (items: { text: string; sourceIds: string[] }[]) => items.map(point).filter((p): p is AnalysisPoint => p !== null).slice(0, 8);
  const keyPoints = list(loose.keyPoints);
  if (!keyPoints.length) throw new Error("Analysis has no transcript-backed key points");
  const overviewText = loose.overview?.text || keyPoints[0].text;
  const overviewIds = known(loose.overview?.sourceIds ?? []);
  const overview: AnalysisPoint = { text: overviewText, sourceIds: overviewIds.some(isCall) ? overviewIds : callIds };
  const numbers = loose.numbers
    .map((n) => {
      const ids = known(n.sourceIds);
      if (!n.metric || !n.value || !ids.some(isCall)) return null;
      return { metric: n.metric, value: n.value, period: n.period || "Period not stated", context: n.context || "Stated on the call.", sourceIds: ids };
    })
    .filter((n): n is CallAnalysis["numbers"][number] => n !== null)
    .slice(0, 16);
  let crossChecks: CallAnalysis["crossChecks"] = loose.crossChecks
    .map((row) => {
      if (!row.claim) return null;
      const call = known(row.callSourceIds).filter(isCall);
      const internal = known(row.internalSourceIds).filter((id) => !isCall(id));
      const needsInternal = row.assessment === "Supports" || row.assessment === "Contradicts";
      return {
        claim: row.claim,
        assessment: needsInternal && !internal.length ? ("Not retrieved" as const) : row.assessment,
        evidence: row.evidence || "No internal evidence was cited.",
        followUp: row.followUp || "Check internal files for this claim.",
        callSourceIds: call.length ? call : callIds,
        internalSourceIds: internal,
      };
    })
    .filter((row): row is CallAnalysis["crossChecks"][number] => row !== null)
    .slice(0, 10);
  if (!crossChecks.length)
    crossChecks = [
      {
        claim: overview.text,
        assessment: "Not retrieved",
        evidence: "The model returned no internal-file comparison.",
        followUp: "Compare the call's claims against internal files manually.",
        callSourceIds: callIds,
        internalSourceIds: [],
      },
    ];
  return validateAnalysis(
    callAnalysisSchema.parse({
      overview,
      keyPoints,
      numbers,
      positives: list(loose.positives),
      risks: list(loose.risks),
      themes: list(loose.themes),
      catalysts: list(loose.catalysts),
      questions: list(loose.questions),
      crossChecks,
      coverage: loose.coverage || "The model did not describe its evidence coverage.",
    }),
    sources,
  );
}
const cite = (ids: string[]) => ids.map((id) => `[src:${id}]`).join(" ");
export function analysisMarkdown(a: CallAnalysis) {
  const list = (title: string, points: AnalysisPoint[]) =>
    `## ${title}\n${points.length ? points.map((p) => `- ${p.text} ${cite(p.sourceIds)}`).join("\n") : "Not discussed in this call."}`;
  return [
    `## Call brief\n${a.overview.text} ${cite(a.overview.sourceIds)}`,
    list("Key points", a.keyPoints),
    `## Important numbers\n${a.numbers.length ? a.numbers.map((n) => `- **${n.metric}: ${n.value}** (${n.period}). ${n.context} ${cite(n.sourceIds)}`).join("\n") : "No reliable numbers identified."}`,
    list("Positive commentary", a.positives),
    list("Risks & watch points", a.risks),
    list("Themes", a.themes),
    list("Catalysts", a.catalysts),
    list("Follow-up questions", a.questions),
    `## Internal-file cross-check\n${a.crossChecks.map((r) => `- **${r.assessment} — ${r.claim}** ${cite(r.callSourceIds)}\n  ${r.evidence} ${cite(r.internalSourceIds)}\n  Follow-up: ${r.followUp}`).join("\n")}\n\n${a.coverage}`,
  ].join("\n\n");
}
export function savedAnalysis(messages: UIMessage[]): CallAnalysis | null {
  for (const message of messages) {
    const parsed = callAnalysisSchema.safeParse((message.metadata as { sellSideAnalysis?: unknown } | undefined)?.sellSideAnalysis);
    if (parsed.success) return parsed.data;
  }
  return null;
}
