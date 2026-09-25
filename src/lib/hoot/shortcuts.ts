/** Prefer the physical S key: Option+S produces ß on some Mac layouts. */
export function hootShortcut(event: Pick<KeyboardEvent, "code" | "key" | "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "repeat">, mac: boolean): "open" | "toggle" | null {
  if (event.repeat || event.shiftKey) return null;
  if (event.code === "KeyS" || event.key.toLowerCase() === "s") {
    if (event.altKey && !event.metaKey && !event.ctrlKey) return "open";
    if (mac && event.metaKey && !event.altKey && !event.ctrlKey) return "open";
  }
  if (event.key.toLowerCase() === "j" && !event.altKey && (event.metaKey !== event.ctrlKey)) return "toggle";
  return null;
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
