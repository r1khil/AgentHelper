import { linesToItems, normalizeWeekday } from "./format";
import type { AgendaItem } from "./types";

export const MAX_ITEMS = 20;
export const MAX_ITEM_CHARS = 300;

function clean(items: AgendaItem[]): AgendaItem[] {
  return items
    .map((i) => ({ day: i.day ? normalizeWeekday(i.day) : null, text: i.text.trim().slice(0, MAX_ITEM_CHARS) }))
    .filter((i) => i.text.length > 0)
    .slice(0, MAX_ITEMS);
}

/**
 * Read the model's reply as a list of {day, text}. A fenced block or surrounding prose is fine;
 * anything that is not a JSON array of items throws, and the caller falls back to line parsing.
 */
export function parseItemsJson(raw: string): AgendaItem[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("No JSON array in the reply");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("The reply was not valid JSON");
  }
  if (!Array.isArray(parsed)) throw new Error("The reply was not a JSON array");
  const items: AgendaItem[] = [];
  for (const entry of parsed) {
    if (typeof entry === "string") {
      items.push({ day: null, text: entry });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const { day, text } = entry as { day?: unknown; text?: unknown };
    if (typeof text !== "string" || !text.trim()) continue;
    items.push({ day: typeof day === "string" && day.trim() ? day : null, text });
  }
  return clean(items);
}

/** No model, or the model failed: one item per line, with a leading weekday setting the day. */
export function fallbackItems(text: string): AgendaItem[] {
  return clean(linesToItems(text));
}

/**
 * The parser's whole job is to split what an exec wrote into lines and attach the weekday they
 * named. It must never add, reword, or infer a process update: the student owns the wording.
 */
export function processUpdateInstructions(): string {
  return [
    "You split an email reply into a list of agenda items. You are a parser, not an author.",
    "",
    "Rules:",
    "- Copy the writer's own words. Never reword, summarize, expand, correct, or invent an item.",
    "- One item per distinct point the writer made.",
    '- If the writer named a weekday for an item, put that weekday in "day" ("Monday" … "Friday"). Otherwise use null.',
    "- Drop greetings, sign-offs, and quoted text.",
    "",
    'Reply with only a JSON array: [{"day": "Monday", "text": "…"}]. No prose, no code fence.',
  ].join("\n");
}
