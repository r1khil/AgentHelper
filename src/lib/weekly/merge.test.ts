import { describe, expect, it } from "vitest";
import { combineReplyItems, htmlToText, shouldHoldReplies } from "./merge";

describe("combineReplyItems", () => {
  it("keeps recipient order and drops exact duplicates", () => {
    const items = combineReplyItems([
      { recipientEmail: "squddus@theowlfund.com", parsedItems: [{ day: "Wednesday", text: "Model review" }] },
      { recipientEmail: "apatil@theowlfund.com", parsedItems: [{ day: "Monday", text: "Stock pitch dry run" }, { day: "Wednesday", text: "model review" }] },
    ]);
    expect(items).toEqual([
      { day: "Monday", text: "Stock pitch dry run" },
      { day: "Wednesday", text: "model review" },
    ]);
  });

  it("treats the same text on a different day as its own item, and tolerates a null list", () => {
    const items = combineReplyItems([
      { recipientEmail: "a@x.com", parsedItems: [{ day: "Monday", text: "Retro" }] },
      { recipientEmail: "b@x.com", parsedItems: [{ day: "Friday", text: "Retro" }] },
      { recipientEmail: "c@x.com", parsedItems: null },
    ]);
    expect(items).toHaveLength(2);
  });
});

describe("shouldHoldReplies", () => {
  const replied = new Date("2026-09-20T13:05:00Z");

  it("merges into an untouched draft", () => {
    expect(shouldHoldReplies({ status: "draft", editedAt: null }, replied)).toBe(false);
  });

  it("merges when the exec's edit came before the reply", () => {
    expect(shouldHoldReplies({ status: "draft", editedAt: new Date("2026-09-20T12:00:00Z") }, replied)).toBe(false);
  });

  it("holds when the exec edited after the reply, or the pack is sent", () => {
    expect(shouldHoldReplies({ status: "draft", editedAt: new Date("2026-09-20T14:00:00Z") }, replied)).toBe(true);
    expect(shouldHoldReplies({ status: "sent", editedAt: null }, replied)).toBe(true);
  });
});

describe("htmlToText", () => {
  it("reads an HTML-only reply as lines", () => {
    expect(htmlToText("<div>Monday: Dry run</div><div>Wednesday: Model review</div>")).toBe("Monday: Dry run\nWednesday: Model review");
    expect(htmlToText("<p>A &amp; B</p><br/><script>bad()</script>")).toBe("A & B");
  });
});
