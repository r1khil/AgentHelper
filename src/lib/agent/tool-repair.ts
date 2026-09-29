import { InvalidToolInputError, NoSuchToolError } from "ai";
import { repairJson } from "./json-repair";

/**
 * Tool arguments a model wrote as broken JSON (a code fence, a trailing comma, an object cut off by the output
 * limit): repaired once without another model call. Returns the repaired input text, or null when there is nothing
 * to fix or it still doesn't parse; the SDK then validates the repaired input against the tool's schema as usual.
 */
export function repairToolInputText(input: string): string | null {
  const text = input.trim();
  if (!text) return "{}";
  try {
    JSON.parse(text);
    return null; // Valid JSON that failed the schema: a repair can't know what the model meant.
  } catch {
    // fall through
  }
  const fixed = repairJson(text);
  try {
    const value = JSON.parse(fixed);
    return value && typeof value === "object" && !Array.isArray(value) ? JSON.stringify(value) : null;
  } catch {
    return null;
  }
}

/** `repairToolCall` for streamText/generateText: JSON repair for malformed arguments, nothing else. */
export async function repairToolCall<T extends { input: string }>({ toolCall, error }: { toolCall: T; error: unknown }): Promise<T | null> {
  if (!InvalidToolInputError.isInstance(error)) return null;
  const input = repairToolInputText(toolCall.input);
  return input === null ? null : { ...toolCall, input };
}

/**
 * The text a failed tool call shows in the chat (and keeps in the saved message). The SDK's default hides every
 * error behind "An error occurred."; malformed arguments and unknown tool names are the model's own mistakes and
 * safe to show, so the reason survives. Anything else (a provider or network failure) stays generic. The SDK reports
 * a bad call twice, once with the error object and once as its string ("AI_InvalidToolInputError: …"), so both forms are recognized.
 */
export function toolErrorText(error: unknown): string {
  if (InvalidToolInputError.isInstance(error)) return invalidText(error.toolName, error.cause instanceof Error ? error.cause.message : error.message);
  if (NoSuchToolError.isInstance(error)) return `There is no tool named ${error.toolName}.`;
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  const invalid = /^(?:AI_\w+: )?Invalid input for tool ([\w-]+): ([\s\S]*)$/.exec(message);
  if (invalid) return invalidText(invalid[1], invalid[2]);
  const missing = /^(?:AI_\w+: )?Model tried to call unavailable tool '([\w-]+)'/.exec(message);
  if (missing) return `There is no tool named ${missing[1]}.`;
  return "An error occurred.";
}

/** "Invalid arguments for get_news: days: Too big: expected number to be <=60" from the SDK's validation message. */
function invalidText(toolName: string, detail: string): string {
  const issues = /Error message: (\[[\s\S]*\])/.exec(detail);
  if (issues) {
    try {
      const list = JSON.parse(issues[1]) as { path?: (string | number)[]; message?: string }[];
      const text = list.slice(0, 3).map((i) => `${i.path?.length ? `${i.path.join(".")}: ` : ""}${i.message ?? "invalid"}`).join("; ");
      if (text) return `Invalid arguments for ${toolName}: ${text}`.slice(0, 300);
    } catch {
      // fall through to the first line
    }
  }
  return `Invalid arguments for ${toolName}: ${detail.replace(/^AI_\w+: /, "").split("\n")[0]}`.slice(0, 300);
}
