import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOT, bootSplash } from "./boot-splash";

/** Just enough of window and document for the inline script: the splash element, <main>, storage and events. */
function page({ seen, reduced = false, storageThrows = false }: { seen?: string; reduced?: boolean; storageThrows?: boolean } = {}) {
  const store = new Map<string, string>(seen ? [[BOOT.key, seen]] : []);
  const storage = {
    getItem: (k: string) => {
      if (storageThrows) throw new Error("blocked");
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (storageThrows) throw new Error("blocked");
      store.set(k, v);
    },
  };
  const img = { dataset: { src: "/hoot/wave-loop.webp" } as Record<string, string>, src: "", getAttribute: () => img.src || null };
  const el = { dataset: { boot: "idle" } as Record<string, string>, style: {} as Record<string, string>, querySelector: (s: string) => (s === "img" ? img : null) };
  const doc = { readyState: "loading", main: false, getElementById: () => el, querySelector: (s: string) => (s === "main" && doc.main ? {} : null) };
  const events: string[] = [];
  const onLoad: (() => void)[] = [];
  const win = {
    __owlBootDone: undefined as boolean | undefined,
    localStorage: storage,
    matchMedia: () => ({ matches: reduced }),
    addEventListener: (type: string, fn: () => void) => type === "load" && onLoad.push(fn),
    dispatchEvent: (e: Event) => events.push(e.type),
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  return {
    state: () => el.dataset.boot,
    img,
    store,
    win,
    events,
    /** The app shell (with its <main>) has been parsed. */
    arrive: () => {
      doc.main = true;
    },
    /** The load event. */
    load: () => {
      doc.readyState = "complete";
      for (const fn of onLoad) fn();
    },
  };
}

const at = async (ms: number) => vi.advanceTimersByTimeAsync(ms - performance.now());

describe("boot splash", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    // 10:00 in New York on Monday 28 September.
    vi.setSystemTime(new Date("2026-09-28T14:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("never shows when the page paints within the reveal time", async () => {
    const p = page({ seen: "2026-09-28" });
    bootSplash(BOOT);
    expect(p.win.__owlBootDone).toBe(false);
    await at(100);
    p.arrive();
    await at(200);
    expect(p.state()).toBe("gone");
    expect(p.win.__owlBootDone).toBe(true);
    expect(p.events).toEqual([BOOT.event]);
    // Hoot's image is never fetched.
    expect(p.img.src).toBe("");
  });

  it("appears when the page hasn't painted by the reveal time, and goes once it has", async () => {
    const p = page({ seen: "2026-09-28" });
    bootSplash(BOOT);
    await at(BOOT.revealMs - 10);
    expect(p.state()).toBe("idle");
    expect(p.img.src).toBe("/hoot/wave-loop.webp");
    await at(BOOT.revealMs + BOOT.pollMs);
    expect(p.state()).toBe("shown");
    await at(1000);
    expect(p.state()).toBe("shown");
    p.arrive();
    await at(1000 + BOOT.pollMs + BOOT.quickFillMs);
    expect(p.state()).toBe("fading");
    expect(p.win.__owlBootDone).toBe(false);
    await at(1000 + BOOT.pollMs * 2 + BOOT.quickFillMs + BOOT.quickFadeMs);
    expect(p.state()).toBe("gone");
    expect(p.events).toEqual([BOOT.event]);
  });

  it("stays at least minShownMs once it has appeared", async () => {
    const p = page({ seen: "2026-09-28" });
    bootSplash(BOOT);
    await at(BOOT.revealMs + BOOT.pollMs);
    expect(p.state()).toBe("shown");
    p.arrive();
    await at(BOOT.revealMs + BOOT.minShownMs - BOOT.pollMs);
    expect(p.state()).toBe("shown");
    await at(BOOT.revealMs + BOOT.minShownMs + BOOT.pollMs * 2 + BOOT.quickFillMs);
    expect(p.state()).toBe("fading");
  });

  it("gives the page's HTML a moment to parse when it arrives late", async () => {
    // The script itself runs 800 ms in (a slow server); the rest of the chunk parses 60 ms later.
    await vi.advanceTimersByTimeAsync(800);
    const p = page({ seen: "2026-09-28" });
    bootSplash(BOOT);
    await at(860);
    p.arrive();
    await at(1200);
    expect(p.state()).toBe("gone");
  });

  it("does Hoot's welcome on the first full load of the New York day", async () => {
    const p = page({ seen: "2026-09-27" });
    bootSplash(BOOT);
    expect(p.state()).toBe("shown");
    expect(p.store.get(BOOT.key)).toBe("2026-09-28");
    p.arrive();
    await at(200);
    p.load();
    await at(BOOT.welcomeMs + BOOT.fillMs + BOOT.holdMs - 10);
    expect(p.state()).toBe("shown");
    await at(BOOT.welcomeMs + BOOT.fillMs + BOOT.holdMs + 10);
    expect(p.state()).toBe("fading");
    await at(BOOT.welcomeMs + BOOT.fillMs + BOOT.holdMs + BOOT.fadeMs + 10);
    expect(p.state()).toBe("gone");
    expect(p.win.__owlBootDone).toBe(true);
  });

  it("uses the New York date, not UTC", () => {
    // 23:30 on the 28th in New York is already the 29th in UTC.
    vi.setSystemTime(new Date("2026-09-29T03:30:00Z"));
    const p = page({ seen: "2026-09-28" });
    bootSplash(BOOT);
    expect(p.state()).toBe("idle");
  });

  it("gives up waiting for load after maxMs", async () => {
    const p = page();
    bootSplash(BOOT);
    await at(BOOT.maxMs + BOOT.fillMs + BOOT.holdMs + BOOT.fadeMs + 10);
    expect(p.state()).toBe("gone");
  });

  it("skips the welcome with reduced motion, without using up the day", async () => {
    const p = page({ reduced: true });
    bootSplash(BOOT);
    expect(p.state()).toBe("idle");
    expect(p.store.has(BOOT.key)).toBe(false);
  });

  it("skips the welcome when storage is blocked", () => {
    const p = page({ storageThrows: true });
    bootSplash(BOOT);
    expect(p.state()).toBe("idle");
  });
});
