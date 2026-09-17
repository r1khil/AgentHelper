import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export function agentConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function agentModelId() {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

export function agentModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  const openrouter = createOpenRouter({ apiKey, headers: { "HTTP-Referer": process.env.APP_URL ?? "", "X-Title": "Owl Fund Workspace" } });
  return openrouter.chat(agentModelId());
}
