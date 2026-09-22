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
