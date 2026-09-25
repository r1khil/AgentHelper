/**
 * Whether the full-page loading screen has gone (boot-splash.tsx). Module state, so it survives client navigation
 * the same way the splash's own "shown once per load" does: anything mounted after it faded sees `true` at once.
 */
let done = false;
const waiting = new Set<() => void>();

export function markBootDone() {
  done = true;
  for (const cb of waiting) cb();
  waiting.clear();
}

/** Calls `cb` once the loading screen is gone (right away if it already is). Returns an unsubscribe. */
export function whenBootDone(cb: () => void): () => void {
  if (done) {
    cb();
    return () => {};
  }
  waiting.add(cb);
  return () => waiting.delete(cb);
}
