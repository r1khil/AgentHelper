import "server-only";
import { generateText } from "ai";
import { agentConfigured, agentModelFor, agentModelId } from "./model";
import type { Feedback } from "@/db/schema";

/**
 * Feedback on a student's reasoning: flags, never a rewrite. Returns structured bullets.
 * The model is told the evidence it may reference; it may not add facts of its own.
 */
export async function reasoningFeedback(input: { kind: "movement" | "earnings"; ticker: string; studentText: string; thesis: string | null; evidence: string; expectations?: string | null }): Promise<Feedback> {
  if (!agentConfigured()) throw new Error("Agent is not configured");
  const instructions = `You review a student analyst's ${input.kind === "movement" ? "major-movement update" : "post-earnings reflection"} for ${input.ticker} at a university investment fund.
Your only job is to flag problems in THEIR reasoning. You never rewrite, redraft, or supply a replacement argument or conclusion. Do not propose what the update should say.
Judge only against the evidence list and thesis below. If the student asserts something the evidence does not support, list it under "unsupported". If evidence in the list is relevant but ignored, list it under "missing". Offer alternative explanations the evidence would also fit under "alternatives" (as questions or possibilities, not conclusions). If the reasoning contradicts the recorded thesis, list it under "contradictions". Add up to three sharpening "questions".
Each bullet: one sentence, specific, quoting the student's words where useful. Empty arrays are fine.
Respond with JSON only, shape: {"unsupported":[],"missing":[],"alternatives":[],"contradictions":[],"questions":[]}.`;

  const prompt = `RECORDED THESIS:\n${input.thesis?.trim() || "(none recorded)"}\n\n${input.expectations ? `STUDENT'S PRE-EARNINGS EXPECTATIONS (locked before the report):\n${input.expectations}\n\n` : ""}EVIDENCE AVAILABLE TO THE STUDENT:\n${input.evidence || "(none gathered)"}\n\nSTUDENT'S TEXT:\n${input.studentText}`;

  const modelId = await agentModelId();
  const { text } = await generateText({ model: agentModelFor(modelId), instructions, prompt, maxRetries: 2 });
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let parsed: Partial<Feedback> = {};
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = { questions: [text.trim().slice(0, 500)] };
  }
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 8) : []);
  return {
    at: new Date().toISOString(),
    model: modelId,
    onText: input.studentText.slice(0, 200),
    unsupported: arr(parsed.unsupported),
    missing: arr(parsed.missing),
    alternatives: arr(parsed.alternatives),
    contradictions: arr(parsed.contradictions),
    questions: arr(parsed.questions),
  };
}
