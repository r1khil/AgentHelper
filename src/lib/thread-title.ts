// Client-safe: how a thread's stored title reads in lists and headers.

const CALL = /^Call: (\S+) · (.+)$/;

/** Longest a thread title is stored or shown; a question's first words become its title. */
export const TITLE_MAX = 80;

/** A question cut to a title at a word boundary, with an ellipsis when anything was cut ("… the whole thing…", not "…thing f"). */
export function clipTitle(text: string, max = TITLE_MAX): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

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
  // Titles saved before they were cut at a word stop at exactly TITLE_MAX characters, often mid-word.
  return title.length === TITLE_MAX && !title.endsWith("…") ? clipTitle(`${title} x`, TITLE_MAX) : title;
}
