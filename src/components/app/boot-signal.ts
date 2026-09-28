/**
 * Whether the full-page loading screen (boot-splash.tsx) is out of the way. Its inline script sets
 * `window.__owlBootDone` to false while it decides, then to true and fires BOOT_DONE_EVENT once the page is
 * uncovered: at once when the page was ready without it, or when the splash has faded. Window state, so it
 * survives client navigation the same way the splash's "once per full load" does.
 */
export const BOOT_DONE_EVENT = "owl:boot-done";

declare global {
  interface Window {
    __owlBootDone?: boolean;
  }
}

/** Calls `cb` once the loading screen is out of the way (right away if it already is). Returns an unsubscribe. */
export function whenBootDone(cb: () => void): () => void {
  // Anything but an explicit false (the script never ran, e.g. a client-rendered error page) counts as done.
  if (window.__owlBootDone !== false) {
    cb();
    return () => {};
  }
  let called = false;
  const on = () => {
    if (called) return;
    called = true;
    stop();
    cb();
  };
  // The splash gives up at 10 s; don't wait forever on a script that failed part-way.
  const timer = window.setTimeout(on, 12_000);
  const stop = () => {
    window.clearTimeout(timer);
    window.removeEventListener(BOOT_DONE_EVENT, on);
  };
  window.addEventListener(BOOT_DONE_EVENT, on);
  return stop;
}
