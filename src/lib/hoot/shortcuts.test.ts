import { describe, expect, it } from "vitest";
import { hootShortcut } from "./shortcuts";
const key = (extra: Record<string, string | boolean> = {}) => ({ code: "KeyS", key: "s", altKey: false, metaKey: false, ctrlKey: false, shiftKey: false, repeat: false, ...extra });
describe("Hoot shortcuts", () => {
  it("opens with Alt+S, including Option+S producing a different character on Mac", () => {
    expect(hootShortcut(key({ altKey: true }), false)).toBe("open");
    expect(hootShortcut(key({ altKey: true, key: "ß" }), true)).toBe("open");
  });
  it("opens with Command+S on Mac only", () => {
    expect(hootShortcut(key({ metaKey: true }), true)).toBe("open");
    expect(hootShortcut(key({ metaKey: true }), false)).toBeNull();
  });
  it("keeps the existing Command/Ctrl+J toggle", () => {
    expect(hootShortcut(key({ code: "KeyJ", key: "j", metaKey: true }), true)).toBe("toggle");
    expect(hootShortcut(key({ code: "KeyJ", key: "j", ctrlKey: true }), false)).toBe("toggle");
  });
  it("ignores unrelated, repeated, or modified key strokes", () => {
    expect(hootShortcut(key(), true)).toBeNull();
    expect(hootShortcut(key({ altKey: true, repeat: true }), true)).toBeNull();
    expect(hootShortcut(key({ altKey: true, shiftKey: true }), true)).toBeNull();
    expect(hootShortcut(key({ altKey: true, metaKey: true }), true)).toBeNull();
  });
});
