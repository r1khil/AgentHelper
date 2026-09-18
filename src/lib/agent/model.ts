import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export function agentConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function agentModelId() {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

/** The OpenRouter provider shared by chat, summarization, and embeddings. */
export function openrouterProvider() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  return createOpenRouter({ apiKey, headers: { "HTTP-Referer": process.env.APP_URL ?? "", "X-Title": "Owl Fund Workspace" } });
}

export function chatModel(id: string) {
  return openrouterProvider().chat(id);
}

export function agentModel() {
  return chatModel(agentModelId());
}
