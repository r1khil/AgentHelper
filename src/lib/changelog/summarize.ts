import "server-only";
import { generateText } from "ai";
import { agentConfigured, agentModelId, chatModel } from "@/lib/agent/model";
import { cleanBody, parseSummaryReply } from "./clean";
import type { MergedPull, PullFile } from "./github";

export const FALLBACK_MODEL = "none";
/** Model used for release notes (GPT-6 Luna since 2026-09-28, like every chat model); CHANGELOG_MODEL overrides it, "agent" uses the Admin page choice. */
export const DEFAULT_CHANGELOG_MODEL = "openai/gpt-6-luna";

export async function changelogModelId(): Promise<string> {
  const chosen = process.env.CHANGELOG_MODEL;
  if (chosen === "agent") return agentModelId();
  return chosen || DEFAULT_CHANGELOG_MODEL;
}

const INSTRUCTIONS = `You write release notes for the executives of a university investment fund who use an internal web app. They are not engineers.
Describe what changed for the people using the app: which page or feature, what they can now do, or what was fixed. Write in plain English.
No file names, no code, no technical jargon (never say refactor, endpoint, schema, component, API, migration, dependency). Do not mention pull requests, branches, or tools.
If the change is purely internal with no visible effect, say so in one sentence.
Keep it short: the headline under 12 words, the summary one to three sentences and under 70 words.
Respond with JSON only, shape: {"headline":"...","summary":"..."}.`;

function describeFiles(files: PullFile[]): string {
  if (!files.length) return "(no file list available)";
  return files
    .slice(0, 60)
    .map((f) => `${f.path} (+${f.additions}/-${f.deletions})`)
    .join("\n");
}

/** One model call per pull request. Falls back to the title when the model is off or misbehaves. */
export type PullSummary = { headline: string; summary: string; model: string; failed: boolean };

export async function summarizePull(pr: MergedPull, files: PullFile[]): Promise<PullSummary> {
  const fallback = { headline: pr.title, summary: "Details not available.", model: FALLBACK_MODEL, failed: true };
  if (!agentConfigured()) return { ...fallback, failed: false };
  const body = cleanBody(pr.body);
  const prompt = `TITLE: ${pr.title}\n\nDESCRIPTION FROM THE AUTHOR:\n${body ?? "(none)"}\n\nFILES CHANGED (path, lines added/removed):\n${describeFiles(files)}`;
  try {
    const model = await changelogModelId();
    const { text } = await generateText({ model: chatModel(model), instructions: INSTRUCTIONS, prompt, maxRetries: 2, maxOutputTokens: 1500 });
    const parsed = parseSummaryReply(text);
    if (!parsed) {
      console.error(`changelog: no JSON in reply for #${pr.number}: ${text.slice(0, 300)}`);
      return fallback;
    }
    return { ...parsed, model, failed: false };
  } catch (e) {
    console.error(`changelog: summary failed for #${pr.number}`, e);
    return fallback;
  }
}
