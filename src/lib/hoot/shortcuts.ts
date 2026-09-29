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

/**
 * ⌘J (Ctrl J off a Mac) opens Hoot's palette from anywhere, even a text field; the browser's own use of Ctrl J
 * (Downloads on Windows) gives way because the app handles it first.
 */
export function askShortcut(event: Pick<KeyboardEvent, "key" | "code" | "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "repeat">): boolean {
  if (event.repeat || event.altKey || event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey) || (event.metaKey && event.ctrlKey)) return false;
  return event.code === "KeyJ" || event.key.toLowerCase() === "j";
}

/**
 * Copy written with the Mac's "⌘K" or "⌘J", as this device writes it: "Ctrl K" off a Mac. Client-side only (the server can't
 * tell the platform), so use it where the text first renders in the browser, like Hoot's tips and the tour's cards.
 */
export const withCommandKey = (text: string, mac = isMac()) => (mac ? text : text.replaceAll("⌘K", "Ctrl K").replaceAll("⌘J", "Ctrl J"));
