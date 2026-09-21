import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getSetting } from "@/lib/settings";

/** Models an admin can pick on the Admin page. All are free OpenRouter variants with tool support. */
export const AGENT_MODELS = [
  { id: "deepseek/deepseek-v4-flash-0731:free", label: "DeepSeek V4 Flash" },
  { id: "inclusionai/ling-3.0-flash-fin:free", label: "Ling 3.0 Flash Fin" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra" },
] as const;

export type AgentModelId = (typeof AGENT_MODELS)[number]["id"];

export const DEFAULT_MODEL: AgentModelId = "deepseek/deepseek-v4-flash-0731:free";

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
