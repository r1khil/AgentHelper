// When Hoot opens a page for a member, page-agent drives the screen there the way a person would: the cursor moves to
// the sidebar link or tab and clicks it. The destination is already decided and checked by the server (resolveNavigation);
// page-agent only chooses the clicks. Pure and client-safe, so the rules below are testable.

/** The part of a DOM element the click guard reads. */
export type ClickTarget = { closest(selector: string): ClickTarget | null; getAttribute(name: string): string | null };

/**
 * Whether Hoot may click this element on the way to a page: a same-app link, a tab, or a control that only opens a
 * menu or section (the scope switcher). Never a button that does something (save, delete, record, sign out), a
 * download, a link out of the app, or a form field, so a takeover can't change data however the model reads the page.
 */
export function mayClick(el: ClickTarget, origin: string): { ok: true } | { ok: false; reason: string } {
  const link = el.closest("a[href]");
  if (link) {
    const href = link.getAttribute("href") ?? "";
    if (link.getAttribute("download") !== null) return { ok: false, reason: "That link downloads a file." };
    if (link.getAttribute("target") === "_blank") return { ok: false, reason: "That link opens a new tab." };
    let url: URL;
    try {
      url = new URL(href, origin);
    } catch {
      return { ok: false, reason: "That link has no address." };
    }
    if (url.origin !== origin) return { ok: false, reason: "That link leaves the app." };
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return { ok: false, reason: "That link isn't a page." };
    return { ok: true };
  }
  if (el.closest('[role="tab"]')) return { ok: true };
  // A menu (the scope switcher) or a collapsed section; never a dialog, which is where a form lives (Record trade).
  const opener = el.closest("[aria-haspopup], [aria-expanded]");
  const popup = opener?.getAttribute("aria-haspopup");
  if (opener && popup !== "dialog" && opener.closest("form") === null && opener.getAttribute("type") !== "submit") return { ok: true };
  return { ok: false, reason: "Hoot only follows links, tabs and menus while opening a page; it never presses buttons that change something." };
}

/** Whether the address in view is the destination: the same path, with every setting the destination names. */
export function atDestination(current: { pathname: string; search: string }, href: string): boolean {
  const want = new URL(href, "http://x");
  const path = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
  if (path(current.pathname) !== path(want.pathname)) return false;
  const have = new URLSearchParams(current.search);
  return [...want.searchParams].every(([k, v]) => have.get(k) === v);
}

/**
 * The page as page-agent describes it, cut to the elements it can click (lines like `\t*[12]<a href=/t/fund>Portfolio />`).
 * Finding a page needs the links, not the page's figures and prose, and each step costs a fraction of the tokens: the
 * gateway's shared Qwen account answers 429 when steps carry 15K tokens each.
 */
export const clickableOnly = (content: string) =>
  content
    .split("\n")
    .filter((line) => /^\s*\*?\[\d+\]</.test(line))
    .join("\n");

/** The step budget: the deepest page (a holding's tab in another team) is about three clicks from anywhere. */
export const TAKEOVER_MAX_STEPS = 6;

/** The longest a member watches before Hoot just opens the page. */
export const TAKEOVER_TIMEOUT_MS = 30_000;

/** page-agent's instructions for this app, on top of its own browsing rules. */
export const TAKEOVER_SYSTEM = [
  "You are Hoot, the Owl Fund app's assistant, showing a member how to reach a page by clicking through the app yourself while they watch.",
  "The destination has already been chosen and checked; your only job is to get there with as few clicks as possible, the way a person would.",
  "How the app is laid out: the left sidebar has New (home), Portfolio, Markets, Screener and Threads (every conversation), then the member's recent threads. On a Portfolio page the header's breadcrumb reads Portfolio / <scope>, where <scope> is a menu to switch to one team or the whole fund, and the views (Positions, Performance, Risk, Exposure, Activity, What if) are link tabs under it. A holding's page opens from its row in Positions; its sections (Threads, Model, Filings & notes, Earnings) are tabs on that page. What's new and Admin sit in the account panel, which you can't open: for those, call done with success false at once.",
  "After a click that changes the address, the next step already shows the new page; don't click the same link twice.",
  "Links show their href: prefer the element whose href matches the destination address, or the one that leads closer to it.",
  "Only click links, tabs and menus. Never type, never press buttons that save, delete, record, upload, send or sign out.",
  "As soon as the current URL matches the destination, call done with success true and a one-line note. If you can't find a way there in a few clicks, call done with success false; the app will open the page directly.",
].join("\n");

export const takeoverTask = (label: string, href: string) => `Open ${label}. Destination address: ${href}`;
