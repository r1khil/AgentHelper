import type { ModelMessage, UIMessage } from "ai";

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

const TEXT_KEEP_CHARS = 400;
/** Tools whose `data.text` is a long document window; only the head is kept once the step is no longer current. */
const TEXT_TOOLS = new Set(["read_filing", "read_drive_file", "read_call_transcript", "read_web_page"]);

/**
 * Shrink one tool's `data` payload to what the model still needs once that result is no longer
 * current: the head of a long document window, headline-only news, passage stubs. Returns the
 * same reference when nothing applies so callers can skip the copy.
 */
export function shrinkToolData(name: string, data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  if (TEXT_TOOLS.has(name) && typeof d.text === "string" && d.text.length > TEXT_KEEP_CHARS) {
    return { ...d, text: `${d.text.slice(0, TEXT_KEEP_CHARS)}… (earlier; text truncated, call ${name} again with the same arguments if you need it)` };
  }
  if (name === "get_news" && Array.isArray(d.items)) {
    const items = (d.items as Record<string, unknown>[]).map(({ headline, publishedAt, sourceId }) => ({ headline, publishedAt, sourceId }));
    return { ...d, items };
  }
  if (name === "search_drive_text" && Array.isArray(d.passages)) {
    const passages = (d.passages as Record<string, unknown>[]).map(({ fileId, name: n, seq, sourceId, text }) => ({ fileId, name: n, seq, sourceId, text: typeof text === "string" ? text.slice(0, 160) : text }));
    return { ...d, passages };
  }
  return data;
}

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
        const data = shrinkToolData(toolName(p), p.output.data);
        return data === p.output.data ? p : { ...p, output: { ...p.output, data } };
      }),
    } as UIMessage;
  });
}

/**
 * Mid-turn compaction for `prepareStep`: every tool-result message except the last `keepLastSteps`
 * gets its payloads shrunk with the same rules as `compactHistory`. Operates on the model messages
 * of the current step only; nothing persisted changes. Returns the input array when nothing changed.
 */
export function compactForStep(messages: ModelMessage[], keepLastSteps = 2): ModelMessage[] {
  const toolIdx: number[] = [];
  messages.forEach((m, i) => {
    if (m.role === "tool") toolIdx.push(i);
  });
  if (toolIdx.length <= keepLastSteps) return messages;
  const cutoff = toolIdx[toolIdx.length - keepLastSteps];
  let changed = false;
  const out = messages.map((m, i) => {
    if (m.role !== "tool" || i >= cutoff) return m;
    const content = m.content.map((part) => {
      if (part.type !== "tool-result" || part.output.type !== "json") return part;
      const v = part.output.value as { data?: unknown } | null;
      if (!v || typeof v !== "object" || !("data" in v)) return part;
      const data = shrinkToolData(part.toolName, v.data);
      if (data === v.data) return part;
      changed = true;
      return { ...part, output: { type: "json" as const, value: { ...v, data } as typeof part.output.value } };
    });
    return { ...m, content } as ModelMessage;
  });
  return changed ? out : messages;
}
