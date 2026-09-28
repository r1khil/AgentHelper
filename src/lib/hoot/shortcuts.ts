/**
 * Hoot's panel opens and closes with Option+S (Alt+S off a Mac). Nothing else: Command+S is the browser's Save, and
 * Command/Ctrl+J is Downloads in Chrome on Windows and moves down a row inside ⌘K. Prefer the physical S key:
 * Option+S produces ß on some Mac layouts.
 */
export function hootShortcut(event: Pick<KeyboardEvent, "code" | "key" | "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "repeat">): "toggle" | null {
  if (event.repeat || event.shiftKey || !event.altKey || event.metaKey || event.ctrlKey) return null;
  return event.code === "KeyS" || event.key.toLowerCase() === "s" ? "toggle" : null;
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** How the shortcut is written on this device. */
export const hootShortcutLabel = () => (isMac() ? "⌥S" : "Alt S");
