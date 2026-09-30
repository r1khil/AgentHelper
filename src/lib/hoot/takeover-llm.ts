// The one model call page-agent makes per step when Hoot takes over the screen to open a page. The browser sends an
// OpenAI-style chat completion; the server forwards it to the AI Gateway with Hoot's own model and key. Pure, so the
// shape it accepts is testable: only page-agent's single AgentOutput tool call, never a general-purpose completion.
import { TAKEOVER_SYSTEM } from "./takeover";

/** The tool page-agent packs every step's reflection and action into. */
export const TAKEOVER_TOOL = "AgentOutput";

/** A request larger than this is not a page-agent step (the page's text is sent viewport-only). */
export const TAKEOVER_MAX_BODY = 400_000;

/** Enough for the reflection and one action; page-agent's replies are a few hundred tokens. */
export const TAKEOVER_MAX_TOKENS = 1500;

const ROLES = new Set(["system", "user", "assistant", "tool"]);

type Message = { role: string; content?: unknown; tool_calls?: unknown; tool_call_id?: unknown };

/**
 * The body to forward for a page-agent step, on `model`, or why it isn't one. The client's model, temperature and
 * token limit are ignored; the tool must be page-agent's AgentOutput and the model must call it.
 */
export function takeoverRequest(body: unknown, model: string): { body: Record<string, unknown> } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Expected a JSON body." };
  const b = body as { messages?: unknown; tools?: unknown };
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > 8) return { error: "Expected page-agent's messages." };
  const messages = b.messages as Message[];
  if (!messages.every((m) => m && typeof m === "object" && ROLES.has(m.role))) return { error: "Unexpected message role." };
  if (!Array.isArray(b.tools) || b.tools.length !== 1) return { error: "Expected page-agent's one tool." };
  const tool = b.tools[0] as { type?: unknown; function?: { name?: unknown } };
  if (tool?.type !== "function" || tool.function?.name !== TAKEOVER_TOOL) return { error: "Expected page-agent's AgentOutput tool." };
  // page-agent puts the takeover's own instructions in the user message; without them this isn't a takeover step.
  if (!messages.some((m) => m.role === "user" && typeof m.content === "string" && m.content.includes(TAKEOVER_SYSTEM))) return { error: "Expected a Hoot takeover step." };
  return {
    body: {
      model,
      messages: messages.map(({ role, content, tool_calls, tool_call_id }) => ({ role, content, ...(tool_calls ? { tool_calls } : {}), ...(tool_call_id ? { tool_call_id } : {}) })),
      tools: [tool],
      // One tool, so "required" is the same as naming it, and more models accept it than a named choice.
      tool_choice: "required",
      parallel_tool_calls: false,
      max_tokens: TAKEOVER_MAX_TOKENS,
    },
  };
}

/** Steps a member may send a minute: a takeover is at most 6 steps, each retried once. */
export const TAKEOVER_STEPS_PER_MINUTE = 12;

/** Whether a member may send another step now, recording it if so. `log` holds each member's recent step times. */
export function allowStep(log: Map<string, number[]>, userId: string, now = Date.now()): boolean {
  const recent = (log.get(userId) ?? []).filter((t) => now - t < 60_000);
  const ok = recent.length < TAKEOVER_STEPS_PER_MINUTE;
  if (ok) recent.push(now);
  log.set(userId, recent);
  return ok;
}
