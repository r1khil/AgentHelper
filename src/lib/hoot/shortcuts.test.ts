import { describe, expect, it } from "vitest";
import { hootShortcut } from "./shortcuts";
const key = (extra: Record<string, string | boolean> = {}) => ({ code: "KeyS", key: "s", altKey: false, metaKey: false, ctrlKey: false, shiftKey: false, repeat: false, ...extra });
describe("Hoot shortcuts", () => {
  it("toggles with Alt+S, including Option+S producing a different character on Mac", () => {
    expect(hootShortcut(key({ altKey: true }))).toBe("toggle");
    expect(hootShortcut(key({ altKey: true, key: "ß" }))).toBe("toggle");
  });
  it("leaves the browser's Save alone", () => {
    expect(hootShortcut(key({ metaKey: true }))).toBeNull();
    expect(hootShortcut(key({ ctrlKey: true }))).toBeNull();
  });
  it("no longer takes Command/Ctrl+J (Downloads, and moving down a row in ⌘K)", () => {
    expect(hootShortcut(key({ code: "KeyJ", key: "j", metaKey: true }))).toBeNull();
    expect(hootShortcut(key({ code: "KeyJ", key: "j", ctrlKey: true }))).toBeNull();
  });
  it("ignores unrelated, repeated, or modified key strokes", () => {
    expect(hootShortcut(key())).toBeNull();
    expect(hootShortcut(key({ altKey: true, code: "KeyD", key: "d" }))).toBeNull();
    expect(hootShortcut(key({ altKey: true, repeat: true }))).toBeNull();
    expect(hootShortcut(key({ altKey: true, shiftKey: true }))).toBeNull();
    expect(hootShortcut(key({ altKey: true, metaKey: true }))).toBeNull();
    // AltGr on Windows arrives as Ctrl+Alt and types a character.
    expect(hootShortcut(key({ altKey: true, ctrlKey: true }))).toBeNull();
  });
});
