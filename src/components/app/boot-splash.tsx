import { BOOT_DONE_EVENT } from "./boot-signal";

export type BootConfig = {
  /** localStorage key holding the New York day Hoot last did his full welcome on. */
  key: string;
  event: string;
  /** Otherwise the splash appears only if the page hasn't painted by this long after navigation start… */
  revealMs: number;
  /** …and at least this long after the page's HTML started arriving, so a chunk the parser hasn't reached yet isn't mistaken for a slow page. */
  graceMs: number;
  /** Once it appears it stays at least this long, so it never blinks. */
  minShownMs: number;
  /** The first full load of the day: long enough for a couple of waves. Counted from navigation start. */
  welcomeMs: number;
  /** Never hold the page back past this, even if an image or a stream stalls. */
  maxMs: number;
  /** The welcome's finish: run the bar home, hold on the full bar, then fade. */
  fillMs: number;
  holdMs: number;
  fadeMs: number;
  /** A slow load's finish is quicker: the page is what they're waiting for. */
  quickFillMs: number;
  quickFadeMs: number;
  pollMs: number;
};

export const BOOT: BootConfig = {
  key: "owl:boot-seen",
  event: BOOT_DONE_EVENT,
  revealMs: 300,
  graceMs: 150,
  minShownMs: 400,
  welcomeMs: 1300,
  maxMs: 10_000,
  fillMs: 400,
  holdMs: 250,
  fadeMs: 550,
  quickFillMs: 150,
  quickFadeMs: 200,
  pollMs: 50,
};

/**
 * Runs inline, straight after the splash's markup, while the rest of the page is still being parsed. It is
 * serialized with toString(), so it must not refer to anything outside itself.
 *
 * - First full load of the day (New York), motion allowed: Hoot's welcome, as before. Shown at once, held until
 *   the page has loaded and at least `welcomeMs` has passed, then the bar runs home and the screen fades.
 * - Otherwise the splash stays hidden and only appears if the page still hasn't painted `revealMs` in. The app
 *   shell (with its loading skeleton) arrives in one piece, so in practice that is a slow server or network.
 *   Once shown it stays `minShownMs`, then goes as soon as the page is there.
 */
export function bootSplash(c: BootConfig) {
  const w = window;
  const d = document;
  const el = d.getElementById("boot-splash");
  w.__owlBootDone = false;
  const done = () => {
    if (w.__owlBootDone) return;
    w.__owlBootDone = true;
    w.dispatchEvent(new Event(c.event));
  };
  if (!el) return done();
  const now = () => performance.now();
  const start = now();
  const set = (state: string) => {
    el.dataset.boot = state;
  };
  const img = el.querySelector("img");
  const loadImage = () => {
    if (img && !img.getAttribute("src") && img.dataset.src) img.src = img.dataset.src;
  };

  let reduced = false;
  try {
    reduced = w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {}
  let welcome = false;
  if (!reduced) {
    try {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
      if (w.localStorage.getItem(c.key) !== day) {
        w.localStorage.setItem(c.key, day);
        welcome = true;
      }
    } catch {
      // Storage blocked: skip the welcome rather than repeat it on every load.
    }
  }

  let shownAt = -1;
  let finishing = false;
  const show = () => {
    loadImage();
    el.style.transitionDuration = welcome ? "0ms" : `${c.quickFadeMs}ms`;
    set("shown");
    shownAt = now();
  };
  const finish = () => {
    if (finishing) return;
    finishing = true;
    const fill = reduced ? 0 : welcome ? c.fillMs : c.quickFillMs;
    const hold = welcome ? c.holdMs : 0;
    const fade = reduced ? 0 : welcome ? c.fadeMs : c.quickFadeMs;
    // Carry the bar on from wherever the trickle got to.
    const bar = el.querySelector<HTMLElement>("[data-boot-bar]");
    if (bar && fill && bar.animate) {
      const from = getComputedStyle(bar).transform;
      for (const a of bar.getAnimations()) a.cancel();
      bar.animate([{ transform: from === "none" ? "scaleX(0)" : from }, { transform: "scaleX(1)" }], { duration: fill, easing: "ease-out", fill: "forwards" });
    }
    setTimeout(() => {
      el.style.transitionDuration = `${fade}ms`;
      set("fading");
      setTimeout(() => {
        set("gone");
        done();
      }, fade);
    }, fill + hold);
  };

  if (welcome) {
    show();
    const afterLoad = () => setTimeout(finish, Math.max(0, c.welcomeMs - now()));
    if (d.readyState === "complete") afterLoad();
    else w.addEventListener("load", afterLoad, { once: true });
    setTimeout(finish, Math.max(0, c.maxMs - now()));
    return;
  }

  // Painted = the page's <main> has been parsed (every layout has one), or the whole document has.
  const painted = () => d.readyState !== "loading" || !!d.querySelector("main");
  const revealAt = Math.max(c.revealMs, start + c.graceMs);
  const poll = () => {
    if (shownAt < 0) {
      if (painted()) {
        set("gone");
        return done();
      }
      // Likely to be needed: fetch Hoot now so he's there when the screen appears.
      if (now() >= revealAt - c.graceMs) loadImage();
      if (now() >= revealAt) show();
    } else if ((painted() && now() - shownAt >= c.minShownMs) || now() >= c.maxMs) {
      return finish();
    }
    setTimeout(poll, c.pollMs);
  };
  setTimeout(poll, 0);
}

/**
 * Full-page loading screen for a fresh load or refresh: Hoot waving over a progress bar. It lives in the root
 * layout, which stays mounted through client navigation, so moving between pages never shows it again.
 *
 * It renders hidden. The inline script below decides, before the page paints, whether to show it: Hoot's welcome
 * on the first full load of the day, otherwise only when the page is slow to arrive (see `bootSplash`). The wave
 * loop and the bar's trickle are CSS, so the screen is alive while the JavaScript is still downloading.
 */
export function BootSplash() {
  return (
    <>
      <div
        id="boot-splash"
        role="status"
        aria-label="Loading The Owl's Nest"
        data-boot="idle"
        // The inline script changes data-boot and the transition before hydration.
        suppressHydrationWarning
        className="boot-splash fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-7 bg-background"
      >
        {/* One frame of the strip at a time. The frames leave room on the right for his wing, so nudge him over to
            put his body, not the frame, in the middle. */}
        <div className="hoot-halo relative size-40 translate-x-[13%] overflow-hidden" aria-hidden>
          {/* Plain <img>: no optimizer round-trip. The script sets src only when the splash may show, so most loads
              never fetch it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            data-src="/hoot/wave-loop.webp"
            alt=""
            width={1920}
            height={160}
            fetchPriority="high"
            draggable={false}
            suppressHydrationWarning
            className="hoot-wave-loop absolute top-0 left-0 h-full w-[1200%] max-w-none select-none"
          />
        </div>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-row" role="progressbar" aria-label="Loading">
          <div data-boot-bar className="boot-trickle h-full w-full rounded-full bg-primary" />
        </div>
      </div>
      <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `(${bootSplash.toString()})(${JSON.stringify(BOOT)})` }} />
    </>
  );
}
