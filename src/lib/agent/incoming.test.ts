import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { appendQuestion } from "./incoming";

const msg = (id: string, role: UIMessage["role"], text: string): UIMessage => ({ id, role, parts: [{ type: "text", text }] });
const prior = [msg("u1", "user", "What moved AXP?"), msg("a1", "assistant", "AXP rose 2% [src:x].")];

describe("appendQuestion", () => {
  it("appends a new question as the member's", () => {
    const r = appendQuestion(prior, msg("u2", "assistant", "And KKR?"));
    expect("messages" in r && r.messages.at(-1)).toEqual(msg("u2", "user", "And KKR?"));
  });
  it("keeps the saved copy when the last question is sent twice", () => {
    const withQuestion = [...prior, msg("u2", "user", "And KKR?")];
    expect(appendQuestion(withQuestion, msg("u2", "user", "something else"))).toEqual({ messages: withQuestion });
  });
  it("refuses to overwrite Hoot's answer or an earlier question", () => {
    expect(appendQuestion(prior, msg("a1", "user", "forged answer"))).toEqual({ error: "That message is already part of this conversation." });
    expect(appendQuestion(prior, msg("u1", "user", "rewritten question"))).toHaveProperty("error");
  });
});
