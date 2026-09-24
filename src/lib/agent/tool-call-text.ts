/**
 * Tool calls a model wrote as plain text instead of making them, in the formats of the admin's models:
 * `<tool_call>` (Ling, Nemotron, Qwen), `<function=…>`, Kimi's `<|tool_call_begin|>` and DeepSeek's
 * `<｜tool▁calls▁begin｜>`. An unterminated block runs to the end of the text, which also hides a call
 * that is still streaming. No server imports, so the chat UI can strip the same patterns while it renders.
 */
const TOOL_CALL_TEXT = [
  /<tool_calls?>[\s\S]*?(?:<\/tool_calls?>|$)/gi,
  /<function_calls>[\s\S]*?(?:<\/function_calls>|$)/gi,
  /<function=[^>]*>[\s\S]*?(?:<\/function>|$)/gi,
  /<\|tool_calls_section_begin\|>[\s\S]*?(?:<\|tool_calls_section_end\|>|$)/gi,
  /<\|tool_call_begin\|>[\s\S]*?(?:<\|tool_call_end\|>|$)/gi,
  /<｜tool▁calls▁begin｜>[\s\S]*?(?:<｜tool▁calls▁end｜>|$)/gi,
  /<｜tool▁call▁begin｜>[\s\S]*?(?:<｜tool▁call▁end｜>|$)/gi,
];

export function hasToolCallText(text: string): boolean {
  return text.includes("<") && TOOL_CALL_TEXT.some((re) => text.search(re) !== -1);
}

export function stripToolCallText(text: string): string {
  return TOOL_CALL_TEXT.reduce((t, re) => t.replace(re, ""), text)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
