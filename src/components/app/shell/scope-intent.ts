// Scope changes the member chose (the scope switcher, ⌘K, Hoot's "switch to …", Undo, Back) get no "Switched to"
// notice; the shell's notice only speaks up when following a link changed the scope. Kept free of React so plain
// modules can mark one.

let intendedAt = 0;
const INTENT_MS = 10_000;

/** Mark the next scope change as chosen, just before navigating. */
export function markScopeIntent(now = Date.now()) {
  intendedAt = now;
}

/** Whether a chosen scope change is pending; clears it either way, so it covers one navigation only. */
export function takeScopeIntent(now = Date.now()) {
  const intended = intendedAt > 0 && now - intendedAt < INTENT_MS;
  intendedAt = 0;
  return intended;
}
