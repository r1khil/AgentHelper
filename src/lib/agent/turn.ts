import type { UIMessage } from "ai";

export type Part = UIMessage["parts"][number];
export type TextPart = Extract<Part, { type: "text" }>;

/** Shape shared by every tool part as the chat UI needs it; the SDK's generic tool part is wider. */
export type ToolPart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: { data?: unknown; error?: string; sources?: { id: string }[] };
  errorText?: string;
};

export function isToolPart(p: Part): p is Part & ToolPart {
  return typeof p.type === "string" && (p.type.startsWith("tool-") || p.type === "dynamic-tool");
}

export function toolName(p: ToolPart) {
  return p.type === "dynamic-tool" ? ((p as { toolName?: string }).toolName ?? "tool") : p.type.replace(/^tool-/, "");
}

export function toolFailed(p: ToolPart) {
  return p.state === "output-error" || Boolean(p.output?.error);
}

export function toolDone(p: ToolPart) {
  return p.state === "output-available" || p.state === "output-error";
}

/**
 * Split an assistant message into the research activity (every tool call plus any narration
 * written before the last tool call) and the answer (text written after the last tool call).
 */
export function splitAssistantParts(parts: Part[]): { activity: Part[]; answer: TextPart[] } {
  let lastTool = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (isToolPart(parts[i])) {
      lastTool = i;
      break;
    }
  }
  const activity = parts.slice(0, lastTool + 1).filter((p) => isToolPart(p) || p.type === "text");
  const answer = parts.slice(lastTool + 1).filter((p): p is TextPart => p.type === "text" && p.text.trim().length > 0);
  return { activity, answer };
}

export function summarizeActivity(activity: Part[]) {
  const tools = activity.filter(isToolPart);
  const sourceIds = new Set<string>();
  let failed = 0;
  for (const t of tools) {
    if (toolFailed(t)) failed++;
    for (const s of t.output?.sources ?? []) sourceIds.add(s.id);
  }
  const pending = tools.find((t) => !toolDone(t));
  return { lookups: tools.length, sources: sourceIds.size, failed, current: pending ? toolName(pending) : null };
}

const FILING_KEEP_CHARS = 400;

/**
 * Shrink large tool outputs from earlier turns before they go back to the model.
 * The current turn (the last user message and everything after it) is untouched,
 * and persisted messages are never modified; this only affects model input.
 */
export function compactHistory(messages: UIMessage[]): UIMessage[] {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUser = i;
      break;
    }
  }
  return messages.map((m, i) => {
    if (i >= lastUser || m.role !== "assistant") return m;
    return {
      ...m,
      parts: m.parts.map((p) => {
        if (!isToolPart(p) || p.state !== "output-available" || !p.output || typeof p.output !== "object") return p;
        const name = toolName(p);
        const data = p.output.data as Record<string, unknown> | null | undefined;
        if (name === "read_filing" && data && typeof data.text === "string" && data.text.length > FILING_KEEP_CHARS) {
          return { ...p, output: { ...p.output, data: { ...data, text: `${data.text.slice(0, FILING_KEEP_CHARS)}… (earlier turn; text truncated, call read_filing again if you need it)` } } };
        }
        if (name === "get_news" && data && Array.isArray(data.items)) {
          const items = (data.items as Record<string, unknown>[]).map(({ headline, publishedAt, sourceId }) => ({ headline, publishedAt, sourceId }));
          return { ...p, output: { ...p.output, data: { ...data, items } } };
        }
        return p;
      }),
    } as UIMessage;
  });
}
