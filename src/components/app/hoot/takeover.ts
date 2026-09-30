"use client";

// Hoot taking over the screen to open a page, with alibaba/page-agent: its mask dims the app and blocks input, its
// cursor moves to the link or tab and clicks it, one model call per click (through /api/hoot/page-agent, on Hoot's
// gateway model). The destination was already resolved and checked by the server; if page-agent doesn't get there
// (a miss, an error, the time limit, Esc or Skip), the caller opens it directly, so the member always lands there.
import { atDestination, clickableOnly, mayClick, takeoverTask, TAKEOVER_MAX_STEPS, TAKEOVER_SYSTEM, TAKEOVER_TIMEOUT_MS } from "@/lib/hoot/takeover";

export type TakeoverState = { label: string; href: string; step: string | null } | null;

let state: TakeoverState = null;
const listeners = new Set<() => void>();
const set = (next: TakeoverState) => {
  state = next;
  for (const l of listeners) l();
};

/** The takeover in progress, for the bar that says what Hoot is doing and offers Stop. */
export const takeoverStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

let current: { stop: () => void } | null = null;

/** End the takeover in progress; the caller then opens the page directly. */
export function stopTakeover() {
  current?.stop();
}

const here = () => ({ pathname: window.location.pathname, search: window.location.search });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Until the address has changed from `before` and the new page has rendered a moment, or 4 s. */
async function landed(before: string) {
  const until = Date.now() + 4000;
  while (window.location.href === before && Date.now() < until) await sleep(100);
  await sleep(400);
}

// Dev only: run a takeover from the console without asking Hoot, e.g. __hootTakeOver("/t/fig/risk", "Risk for FIG").
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as { __hootTakeOver?: unknown }).__hootTakeOver = (href: string, label = href) => takeOver({ href, label });
}

/**
 * Drive the screen to `href`. Resolves true when the member is on the destination (or already was), false when the
 * caller should open it directly: reduced motion, or page-agent didn't make it.
 */
export async function takeOver(action: { href: string; label: string }): Promise<boolean> {
  if (atDestination(here(), action.href)) return true;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  current?.stop();

  const [{ PageAgentCore }, { PageController }] = await Promise.all([import("@page-agent/core"), import("@page-agent/page-controller")]);

  // page-agent's controller, limited to what a navigation needs: links, tabs and menus, never typing or buttons.
  class HootController extends PageController {
    override async clickElement(index: number) {
      const el = (this as unknown as { selectorMap: Map<number, { ref?: Element }> }).selectorMap.get(index)?.ref;
      if (!el) return super.clickElement(index);
      const verdict = mayClick(el, window.location.origin);
      if (!verdict.ok) return { success: false, message: `❌ ${verdict.reason}` };
      const before = window.location.href;
      const result = await super.clickElement(index);
      // A link to another page: let it land before the next look, or the model sees the old page and clicks again.
      const to = el.closest("a[href]")?.getAttribute("href");
      if (result.success && to && new URL(to, before).href !== before) await landed(before);
      return result;
    }
    override async inputText() {
      return { success: false, message: "❌ Hoot doesn't type while opening a page." };
    }
    override async selectOption() {
      return { success: false, message: "❌ Hoot doesn't change settings while opening a page." };
    }
  }

  const pageController = new HootController({
    enableMask: true,
    // Only what's on screen: the sidebar and the page's own controls, not every row of a long table.
    viewportExpansion: 0,
    includeAttributes: ["href", "aria-current", "aria-selected"],
  });
  // page-agent only lists elements nothing covers, so the bar lets hits through while it reads the page; otherwise
  // the scope menu under it would be invisible to the model.
  const bar = (events: string) => document.querySelectorAll<HTMLElement>("[data-hoot-takeover-bar]").forEach((b) => (b.style.pointerEvents = events));
  pageController.addEventListener("beforeUpdate", () => bar("none"));
  pageController.addEventListener("afterUpdate", () => bar(""));
  const agent = new PageAgentCore({
    pageController,
    // page-agent posts to `${baseURL}/chat/completions`; the server picks the model and holds the key.
    baseURL: "/api/hoot/page-agent",
    model: "hoot",
    maxRetries: 1,
    maxSteps: TAKEOVER_MAX_STEPS,
    stepDelay: 0.2,
    language: "en-US",
    instructions: { system: TAKEOVER_SYSTEM },
    transformPageContent: clickableOnly,
    customTools: { input_text: null, select_dropdown_option: null, ask_user: null, execute_javascript: null, scroll_horizontally: null },
    // Arrived: stop there, without spending a step on "done".
    onAfterStep: (a) => {
      if (atDestination(here(), action.href)) void a.stop();
    },
  });

  agent.addEventListener("historychange", () => {
    const last = agent.history.at(-1);
    if (last?.type === "step" && last.reflection.next_goal) set({ ...action, step: last.reflection.next_goal });
  });

  const stop = () => void agent.stop();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") stop();
  };
  const timer = window.setTimeout(stop, TAKEOVER_TIMEOUT_MS);
  // The mask swallows keys that reach it; listen before it does.
  window.addEventListener("keydown", onKey, true);
  current = { stop };
  set({ ...action, step: null });
  try {
    await agent.execute(takeoverTask(action.label, action.href));
  } catch (e) {
    console.warn("[hoot takeover] page-agent failed", e);
  } finally {
    window.clearTimeout(timer);
    window.removeEventListener("keydown", onKey, true);
    if (current?.stop === stop) {
      current = null;
      set(null);
    }
    agent.dispose();
  }
  return atDestination(here(), action.href);
}
