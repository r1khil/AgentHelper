/**
 * Repair the JSON a model tends to produce: code fences, trailing commas, and an object cut off by
 * the output limit (unterminated string, unclosed arrays and objects). Returns the repaired text.
 */
export function repairJson(raw: string): string {
  let t = raw.replace(/```(?:json)?/gi, "").trim();
  // Walk the text tracking string state so bracket balancing ignores braces inside strings.
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let out = "";
  for (const ch of t) {
    out += ch;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (inStr) out += '"';
  // A dangling `"text":` or `,` before the cut leaves invalid JSON; trim back to the last complete value.
  out = out.replace(/,\s*("[^"]*"\s*:\s*)?$/, "").replace(/("[^"]*"\s*:\s*)$/, "");
  while (stack.length) out += stack.pop();
  t = out.replace(/,(\s*[}\]])/g, "$1");
  return t;
}

/** Lenient JSON extraction: the object starting at the first `{`, repaired when the model cut it short. */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) return null;
  const end = text.lastIndexOf("}");
  const candidates = end > start ? [text.slice(start, end + 1), text.slice(start)] : [text.slice(start)];
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      try {
        return JSON.parse(repairJson(c));
      } catch {
        /* try the next candidate */
      }
    }
  }
  return null;
}
