import { describe, expect, it } from "vitest";
import { fallbackItems, parseItemsJson, processUpdateInstructions } from "./parse";

describe("parseItemsJson", () => {
  it("reads a plain array of items", () => {
    expect(parseItemsJson('[{"day":"Monday","text":"Stock pitch dry run"},{"day":null,"text":"Send the deck"}]')).toEqual([
      { day: "Monday", text: "Stock pitch dry run" },
      { day: null, text: "Send the deck" },
    ]);
  });

  it("reads through a code fence and surrounding prose", () => {
    const raw = 'Here you go:\n```json\n[{"day":"tue","text":"Model review"}]\n```\n';
    expect(parseItemsJson(raw)).toEqual([{ day: "Tuesday", text: "Model review" }]);
  });

  it("accepts bare strings and drops entries with no text", () => {
    expect(parseItemsJson('["Send the deck", {"day":"Monday"}, {"text":"   "}, 7]')).toEqual([{ day: null, text: "Send the deck" }]);
  });

  it("throws when there is no usable array, so the caller can fall back", () => {
    expect(() => parseItemsJson("I could not find any items.")).toThrow();
    expect(() => parseItemsJson("[{oops}]")).toThrow();
  });

  it("finds the array even when the model wrapped it in an object", () => {
    expect(parseItemsJson('{"items":[{"day":"Monday","text":"Dry run"}]}')).toEqual([{ day: "Monday", text: "Dry run" }]);
    expect(parseItemsJson('{"items":[]}')).toEqual([]);
  });

  it("caps the list and the length of each item", () => {
    const many = JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ day: null, text: `item ${i}` })));
    expect(parseItemsJson(many)).toHaveLength(20);
    const long = JSON.stringify([{ day: null, text: "x".repeat(500) }]);
    expect(parseItemsJson(long)[0].text).toHaveLength(300);
  });
});

describe("fallbackItems", () => {
  it("makes one item per line and reads a weekday prefix", () => {
    expect(fallbackItems("Monday: Stock pitch dry run\n\nSend the deck\n")).toEqual([
      { day: "Monday", text: "Stock pitch dry run" },
      { day: null, text: "Send the deck" },
    ]);
  });

  it("is empty for empty text", () => {
    expect(fallbackItems("   \n\n")).toEqual([]);
  });
});

describe("processUpdateInstructions", () => {
  it("tells the model to parse, never to author", () => {
    const text = processUpdateInstructions();
    expect(text).toContain("parser, not an author");
    expect(text).toMatch(/Never reword|invent/);
    expect(text).toContain("JSON array");
  });
});
