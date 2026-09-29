// Client-safe: how a thread's stored title reads in lists and headers.

const CALL = /^Call: (\S+) · (.+)$/;

/** Whether a stored title is a sell-side call's chat (titled "Call: RSG · Broker" when the call is uploaded). */
export const isCallTitle = (title: string) => CALL.test(title);

/**
 * A thread's title as the app shows it. A sell-side call's chat ("Call: RSG · Broker", or "Call: XYZ · Acme · Broker"
 * for a company the fund doesn't hold) reads "Call brief: Broker", with the ticker only when it isn't already shown
 * beside the title (`ticker`). Any other title is shown as stored.
 */
export function threadTitle(title: string, ticker?: string | null): string {
  const m = CALL.exec(title);
  if (m) {
    const rest = m[2].split(" · ").join(", ");
    return `Call brief: ${ticker && ticker.toUpperCase() === m[1].toUpperCase() ? rest : `${m[1]}, ${rest}`}`;
  }
  return title;
}
