import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getSetting } from "@/lib/settings";

/**
 * Models an admin can pick on the Admin page, all with tool support. The list order is also the fallback order after
 * the chosen model. GPT-6 Luna and Muse Spark 1.3 Contributor are paid (about half a cent to a cent a Hoot turn,
 * compared on 2026-09-28); Rikhil chose them over the free tier after Ling's free variant was withdrawn.
 */
// DeepSeek V4 Flash and Ling 3.0 Flash Fin were dropped on 2026-09-28: OpenRouter withdrew both free variants.
// (The PT sheet guard still names Ling on purpose; see pt-sheet-guard.ts.)
export const AGENT_MODELS = [
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna" },
  { id: "meta/muse-spark-1.3-contributor", label: "Muse Spark 1.3 Contributor" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra (free)" },
  { id: "qwen/qwen3.8-27b:free", label: "Qwen 3.8 27B (free)" },
] as const;

export type AgentModelId = (typeof AGENT_MODELS)[number]["id"];

export const DEFAULT_MODEL: AgentModelId = "openai/gpt-6-luna";

/** Key in app_settings holding the admin's choice. */
export const AGENT_MODEL_SETTING = "agent_model";

export function agentConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function isAgentModelId(id: string): id is AgentModelId {
  return AGENT_MODELS.some((m) => m.id === id);
}

/** The admin's choice from the Admin page, else OPENROUTER_MODEL, else the default. */
export async function agentModelId(): Promise<string> {
  const chosen = await getSetting(AGENT_MODEL_SETTING);
  return chosen || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

/** The OpenRouter provider shared by chat, summarization, and embeddings. */
export function openrouterProvider() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  return createOpenRouter({ apiKey, headers: { "HTTP-Referer": process.env.APP_URL ?? "", "X-Title": "The Owl's Nest" } });
}

export function chatModel(id: string) {
  return openrouterProvider().chat(id);
}

export async function agentModel() {
  return chatModel(await agentModelId());
}
