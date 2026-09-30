import "server-only";
import { createGateway } from "ai";
import { getSetting } from "@/lib/settings";

/**
 * Chat models an admin can pick on the Admin page, all tool-capable on the Vercel AI Gateway (checked against
 * ai-gateway.vercel.sh/v1/models on 2026-09-29). Prices are per million input / output tokens on that date; the
 * discounted ones can change. Embeddings, reranking and call transcription stay on OpenRouter.
 */
export const AGENT_MODELS = [
  { id: "alibaba/qwen3.7-flash", label: "Qwen 3.7 Flash", price: "$0.03 / $0.13" },
  { id: "inclusionai/ling-3.1-flash-free", label: "Ling 3.1 Flash (free)", price: "free" },
  { id: "inclusionai/ling-3.0-flash", label: "Ling 3.0 Flash", price: "$0.02 / $0.06" },
  { id: "inception/mercury-2.5", label: "Mercury 2.5", price: "$0.04 / $0.15" },
  { id: "inclusionai/ling-3.0-flash-fin", label: "Ling 3.0 Flash Fin", price: "$0.075 / $0.22" },
  { id: "inclusionai/ling-3.0-flash-vl", label: "Ling 3.0 Flash VL", price: "$0.075 / $0.22" },
  { id: "meta/muse-spark-1.3-contributor", label: "Muse Spark 1.3 Contributor", price: "$0.10 / $0.20" },
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna", price: "$0.10 / $0.50" },
  { id: "xiaomi/mimo-v2.6-flash", label: "MiMo v2.6 Flash", price: "$0.14 / $0.28" },
  { id: "alibaba/qwen3.8-omni-flash", label: "Qwen 3.8 Omni Flash", price: "$0.15 / $0.47" },
  { id: "mixedbread/toast-1", label: "Mixedbread Toast 1", price: "$0.30 / $0.72" },
] as const;

export type AgentModelId = (typeof AGENT_MODELS)[number]["id"];

/**
 * Rikhil's choice on 2026-09-29: Qwen 3.7 Flash first, the free Ling 3.1 Flash when it fails. Ling was the primary
 * until live tests showed it stalling ~105 s on a simple tool call, and the fallback only moves on errors.
 */
export const DEFAULT_MODEL: AgentModelId = "alibaba/qwen3.7-flash";
export const DEFAULT_BACKUP_MODEL: AgentModelId = "inclusionai/ling-3.1-flash-free";

/** Keys in app_settings holding the admin's choices. New keys, so the OpenRouter-era `agent_model` choice is ignored. */
export const AGENT_MODEL_SETTING = "gateway_agent_model";
export const AGENT_BACKUP_MODEL_SETTING = "gateway_agent_backup_model";

/** An AI Gateway API key locally; on Vercel the deployment's OIDC token authenticates instead. */
export function agentConfigured() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL === "1");
}

export function isAgentModelId(id: string): id is AgentModelId {
  return AGENT_MODELS.some((m) => m.id === id);
}

export function agentModelLabel(id: string): string {
  return AGENT_MODELS.find((m) => m.id === id)?.label ?? id;
}

async function chosenModel(key: string, fallback: AgentModelId): Promise<AgentModelId> {
  const chosen = await getSetting(key);
  return chosen && isAgentModelId(chosen) ? chosen : fallback;
}

/** The admin's primary model from the Admin page, else the default. */
export async function agentModelId(): Promise<string> {
  return chosenModel(AGENT_MODEL_SETTING, DEFAULT_MODEL);
}

/** The model a request moves to when the primary is rate-limited or unavailable. */
export async function agentBackupModelId(): Promise<string> {
  return chosenModel(AGENT_BACKUP_MODEL_SETTING, DEFAULT_BACKUP_MODEL);
}

let provider: ReturnType<typeof createGateway> | undefined;

/** The Vercel AI Gateway provider shared by chat, summaries and jobs. */
export function gatewayProvider() {
  if (!agentConfigured()) throw new Error("The AI Gateway is not configured (AI_GATEWAY_API_KEY)");
  provider ??= createGateway();
  return provider;
}

export function chatModel(id: string) {
  return gatewayProvider().languageModel(id);
}

export async function agentModel() {
  return chatModel(await agentModelId());
}
